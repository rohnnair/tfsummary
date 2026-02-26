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
  fs.writeFileSync(tmpPlan, JSON.stringify(planData));

  try {
    const args = [
      '--prices', PRICES_CSV,
      '--plan', tmpPlan,
      '--region', region,
      '--format', 'json',
    ];

    const result = execFileSync(oiqBin, args, {
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
      fs.rmdirSync(tmpDir);
    } catch {
      // ignore cleanup errors
    }
  }
}

function applyCosts(resources, costData) {
  const costItems = costData.resources || costData.line_items || costData || [];
  const costMap = new Map();

  if (Array.isArray(costItems)) {
    for (const item of costItems) {
      const addr = item.address || item.resource || item.name;
      if (addr) {
        costMap.set(addr, {
          monthly: item.monthly_cost || item.monthlyCost || item.cost || 0,
          hourly: item.hourly_cost || item.hourlyCost || 0,
        });
      }
    }
  }

  for (const r of resources) {
    const cost = costMap.get(r.address);
    if (cost) {
      r.monthlyCost = cost.monthly;
      r.hourlyCost = cost.hourly;
    }
  }
}

module.exports = { estimateCosts, ensurePrices, downloadPrices };
