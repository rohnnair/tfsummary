# tfsummary

Beautify Terraform plan output with cost estimates via [OpenInfraQuote](https://github.com/terrateamio/openinfraquote).

## Features

- Colored terminal output with resource diffs
- HTML dark-themed reports
- GitHub PR-ready markdown output
- Cost estimates via OpenInfraQuote
- Destructive change warnings
- Field-level diffs for updated resources
- Reads from file or stdin pipe

## Installation

```bash
npm install -g tfsummary
```

## Quick Start

```bash
# Generate a plan JSON
terraform plan -out=tfplan
terraform show -json tfplan > plan.json

# View summary in terminal
tfsummary plan.json

# Pipe from terraform
terraform show -json tfplan | tfsummary

# Skip cost estimation
tfsummary plan.json --no-cost
```

## Usage

```
Usage: tfsummary [options] [plan-file]

Beautify Terraform plan output with cost estimates

Arguments:
  plan-file                    Path to terraform show -json output file

Options:
  -V, --version                output the version number
  -f, --format <format>        Output format: terminal, html, markdown, json (default: "terminal")
  -o, --out <file>             Write output to file instead of stdout
  -r, --region <region>        AWS region for cost estimates (default: "us-east-1")
  --no-cost                    Skip cost estimation
  --summary-only               Show only the summary, hide per-resource list
  -h, --help                   display help for command
```

## Output Formats

### Terminal (default)

```bash
tfsummary plan.json
```

Colored output with action icons, field diffs, and cost estimates.

### HTML Report

```bash
tfsummary plan.json --format html --out report.html
```

Dark-themed HTML report suitable for sharing or embedding.

### Markdown (for PRs)

```bash
tfsummary plan.json --format markdown
```

GitHub-flavored markdown with tables, diff blocks, and caution callouts for destructive changes.

### JSON

```bash
tfsummary plan.json --format json
```

Parsed resource data as JSON for programmatic use.

## Cost Estimation

tfsummary uses [OpenInfraQuote](https://github.com/terrateamio/openinfraquote) for cost estimates. Install it:

```bash
# macOS
brew tap terrateamio/openinfraquote
brew install openinfraquote

# Linux
curl -LO https://github.com/terrateamio/openinfraquote/releases/latest/download/oiq-linux-amd64.tar.gz
tar -xzf oiq-linux-amd64.tar.gz
sudo mv oiq /usr/local/bin/
```

Pricing data is auto-downloaded daily from `https://oiq.terrateam.io/prices.csv.gz` and cached at `~/.tfsummary/prices.csv`.

Use `--no-cost` to skip cost estimation if oiq is not installed.

## GitHub Actions

Add the included workflow to automatically comment plan summaries on PRs that modify Terraform files. Copy `.github/workflows/terraform-summary.yml` to your repo.

The workflow:
1. Runs `terraform plan` on PRs that touch `.tf` or `.tfvars` files
2. Generates a markdown summary with cost estimates
3. Posts a sticky comment on the PR

## License

MIT
