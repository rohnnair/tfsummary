const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { execFileSync } = require('child_process');
const os = require('os');

const CACHE_DIR = path.join(os.homedir(), '.tfsummary');
const PRICES_CSV = path.join(CACHE_DIR, 'prices.csv');
const PRICES_URL = 'https://oiq.terrateam.io/prices.csv.gz';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 1 day

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function isPricesStale() {
  if (!fs.existsSync(PRICES_CSV)) return true;
  const stat = fs.statSync(PRICES_CSV);
  return Date.now() - stat.mtimeMs > MAX_AGE_MS;
}

function downloadPrices() {
  return new Promise((resolve, reject) => {
    ensureCacheDir();

    https.get(PRICES_URL, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        https.get(res.headers.location, handleResponse).on('error', reject);
        return;
      }
      handleResponse(res);

      function handleResponse(response) {
        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download prices: HTTP ${response.statusCode}`));
          return;
        }

        const gunzip = zlib.createGunzip();
        const output = fs.createWriteStream(PRICES_CSV);

        response.pipe(gunzip).pipe(output);

        output.on('finish', () => {
          output.close();
          resolve();
        });

        output.on('error', reject);
        gunzip.on('error', reject);
      }
    }).on('error', reject);
  });
}

async function ensurePrices() {
  if (isPricesStale()) {
    try {
      await downloadPrices();
    } catch (err) {
      if (!fs.existsSync(PRICES_CSV)) {
        throw new Error(`Cannot download prices and no cached copy exists: ${err.message}`);
      }
      // Use stale cache if download fails
    }
  }
}

function findOiq() {
  try {
    execFileSync('which', ['oiq'], { stdio: 'pipe' });
    return 'oiq';
  } catch {
    const brewPath = '/opt/homebrew/bin/oiq';
    if (fs.existsSync(brewPath)) return brewPath;

    const usrLocalPath = '/usr/local/bin/oiq';
    if (fs.existsSync(usrLocalPath)) return usrLocalPath;

    return null;
  }
}

async function estimateCosts(resources, planData, region) {
  await ensurePrices();

  const oiqBin = findOiq();
  if (!oiqBin) {
    throw new Error(
      'oiq (OpenInfraQuote) not found. Install it:\n' +
      '  macOS:  brew tap terrateamio/openinfraquote && brew install openinfraquote\n' +
      '  Linux:  See https://github.com/terrateamio/openinfraquote'
    );
  }

  // Write the plan to a temp file for oiq to consume
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tfsummary-'));
  const tmpPlan = path.join(tmpDir, 'plan.json');
  const tmpMatch = path.join(tmpDir, 'match.json');
  fs.writeFileSync(tmpPlan, JSON.stringify(planData));

  try {
    // Step 1: oiq match — match resources to pricing rows
    execFileSync(oiqBin, [
      'match',
      '--pricesheet', PRICES_CSV,
      '--output', tmpMatch,
      tmpPlan,
    ], {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Step 2: oiq price — calculate costs from matches
    const result = execFileSync(oiqBin, [
      'price',
      '--input', tmpMatch,
      '--region', region,
      '--format', 'json',
    ], {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const costData = JSON.parse(result);
    applyCosts(resources, costData);
  } finally {
    // Cleanup temp files
    try {
      fs.unlinkSync(tmpPlan);
      fs.unlinkSync(tmpMatch);
      fs.rmdirSync(tmpDir);
    } catch {
      // ignore cleanup errors
    }
  }
}

function applyCosts(resources, costData) {
  const costItems = costData.resources || [];
  const costMap = new Map();

  for (const item of costItems) {
    const addr = item.address;
    if (addr && item.price) {
      costMap.set(addr, {
        monthly: item.price.max || item.price.min || 0,
      });
    }
  }

  // Store total estimate from oiq
  if (costData.price) {
    const total = costData.price.max || costData.price.min || 0;
    costData._totalMonthly = total;
  }

  for (const r of resources) {
    const cost = costMap.get(r.address);
    if (cost) {
      r.monthlyCost = cost.monthly;
    }
  }
}

module.exports = { estimateCosts, ensurePrices, downloadPrices };
