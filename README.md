# tfsummary

Beautify Terraform plan output with built-in AWS cost estimates.

## Features

- Colored terminal output with resource diffs
- HTML dark-themed reports
- GitHub PR-ready markdown output
- Built-in AWS cost estimates (no external tools required)
- Accurate fixed-cost pricing for EC2, RDS, ALB, NAT Gateway, EBS
- Usage-based resources (S3, SQS, Lambda) labeled honestly
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

# Specify AWS region for pricing
tfsummary plan.json --region us-west-2
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

tfsummary includes built-in AWS pricing data — no external tools or credentials required.

**Fixed-cost resources** (priced automatically):
- EC2 instances (47 instance types)
- RDS instances (PostgreSQL, MySQL, MariaDB)
- Application & Network Load Balancers
- NAT Gateways
- EBS volumes
- ElastiCache nodes
- Elastic IPs

**Usage-based resources** (labeled as such):
- S3, SQS, SNS, Lambda, DynamoDB, CloudWatch, API Gateway, CloudFront

**Free resources** (no cost shown):
- IAM roles/policies, Security Groups, VPC, Subnets, Route53 records, ACM certificates, ECR, Secrets Manager

Pricing covers 12 AWS regions with regional multipliers applied automatically.

## GitHub Actions

Add the included workflow to automatically comment plan summaries on PRs that modify Terraform files. Copy `.github/workflows/terraform-summary.yml` to your repo.

The workflow:
1. Runs `terraform plan` on PRs that touch `.tf` or `.tfvars` files
2. Generates a markdown summary with cost estimates
3. Posts a sticky comment on the PR

## License

MIT
