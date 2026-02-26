#!/usr/bin/env node

const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { parsePlan } = require('../src/parser/plan');
const { estimateCosts } = require('../src/cost/oiq');
const { renderTerminal } = require('../src/renderers/terminal');
const { renderHtml } = require('../src/renderers/html');
const { renderMarkdown } = require('../src/renderers/markdown');

program
  .name('tfsummary')
  .description('Beautify Terraform plan output with cost estimates')
  .version('1.0.0')
  .argument('[plan-file]', 'Path to terraform show -json output file')
  .option('-f, --format <format>', 'Output format: terminal, html, markdown, json', 'terminal')
  .option('-o, --out <file>', 'Write output to file instead of stdout')
  .option('-r, --region <region>', 'AWS region for cost estimates', 'us-east-1')
  .option('--no-cost', 'Skip cost estimation')
  .option('--summary-only', 'Show only the summary, hide per-resource list')
  .action(async (planFile, options) => {
    try {
      let rawJson;

      if (planFile) {
        const filePath = path.resolve(planFile);
        if (!fs.existsSync(filePath)) {
          console.error(`Error: File not found: ${filePath}`);
          process.exit(1);
        }
        rawJson = fs.readFileSync(filePath, 'utf-8');
      } else if (!process.stdin.isTTY) {
        rawJson = await readStdin();
      } else {
        program.help();
        process.exit(1);
      }

      let planData;
      try {
        planData = JSON.parse(rawJson);
      } catch {
        console.error('Error: Invalid JSON input. Run "terraform show -json tfplan" to generate valid input.');
        process.exit(1);
      }

      const resources = parsePlan(planData);

      if (options.cost) {
        try {
          await estimateCosts(resources, planData, options.region);
        } catch (err) {
          console.error(`Warning: Cost estimation failed: ${err.message}`);
        }
      }

      let output;
      switch (options.format) {
        case 'html':
          output = renderHtml(resources, options);
          break;
        case 'markdown':
          output = renderMarkdown(resources, options);
          break;
        case 'json':
          output = JSON.stringify(resources, null, 2);
          break;
        case 'terminal':
        default:
          output = renderTerminal(resources, options);
          break;
      }

      if (options.out) {
        const outPath = path.resolve(options.out);
        fs.writeFileSync(outPath, output);
        console.error(`Output written to ${outPath}`);
      } else {
        process.stdout.write(output);
      }
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  });

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk) => { data += chunk; });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

program.parse();
