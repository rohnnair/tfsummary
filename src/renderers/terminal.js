const chalk = require('chalk');
const { summarize } = require('../parser/plan');

const ACTION_COLORS = {
  create: chalk.green,
  update: chalk.yellow,
  delete: chalk.red,
  replace: chalk.magenta,
};

const ACTION_ICONS = {
  create: '+',
  update: '~',
  delete: '-',
  replace: '±',
};

function formatCost(cost) {
  if (cost === null || cost === undefined) return '';
  return `$${Number(cost).toFixed(2)}/mo`;
}

function truncate(str, len) {
  if (typeof str !== 'string') str = JSON.stringify(str) || '';
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

function renderTerminal(resources, options = {}) {
  const lines = [];
  const summary = summarize(resources);

  // Header
  lines.push('');
  lines.push(chalk.bold('Terraform Plan Summary'));
  lines.push(chalk.dim('─'.repeat(72)));

  // Destructive warning
  const destructive = resources.filter(r => r.isDestructive);
  if (destructive.length > 0) {
    lines.push('');
    lines.push(chalk.bgRed.white.bold(' ⚠  DESTRUCTIVE CHANGES '));
    for (const r of destructive) {
      const color = ACTION_COLORS[r.action];
      lines.push(color(`  ${ACTION_ICONS[r.action]} [${r.actionLabel}] ${r.address}`));
    }
    lines.push('');
  }

  // Resource list
  if (!options.summaryOnly) {
    lines.push('');
    lines.push(chalk.bold('Resources:'));
    lines.push('');

    for (const r of resources) {
      const color = ACTION_COLORS[r.action] || chalk.white;
      const icon = ACTION_ICONS[r.action] || ' ';
      const costStr = r.monthlyCost !== null ? chalk.cyan(` (${formatCost(r.monthlyCost)})`) : '';

      lines.push(color(`  ${icon} [${r.actionLabel.padEnd(7)}] ${r.address}${costStr}`));

      // Field-level diffs for updates
      if (r.diffs && r.diffs.length > 0) {
        for (const diff of r.diffs) {
          const fromStr = truncate(diff.from, 40);
          const toStr = truncate(diff.to, 40);

          switch (diff.type) {
            case 'add':
              lines.push(chalk.green(`               + ${diff.field} = ${toStr}`));
              break;
            case 'remove':
              lines.push(chalk.red(`               - ${diff.field} = ${fromStr}`));
              break;
            case 'change':
              lines.push(chalk.yellow(`               ~ ${diff.field}: ${fromStr} → ${toStr}`));
              break;
          }
        }
      }
    }
  }

  // Cost summary
  const totalMonthlyCost = resources.reduce((sum, r) => sum + (r.monthlyCost || 0), 0);
  if (totalMonthlyCost > 0) {
    lines.push('');
    lines.push(chalk.dim('─'.repeat(72)));
    lines.push(chalk.bold.cyan(`  Estimated monthly cost: $${totalMonthlyCost.toFixed(2)}/mo`));
  }

  // Summary counts
  lines.push('');
  lines.push(chalk.dim('─'.repeat(72)));

  const parts = [];
  if (summary.create > 0) parts.push(chalk.green(`+${summary.create} to create`));
  if (summary.update > 0) parts.push(chalk.yellow(`~${summary.update} to update`));
  if (summary.replace > 0) parts.push(chalk.magenta(`±${summary.replace} to replace`));
  if (summary.delete > 0) parts.push(chalk.red(`-${summary.delete} to destroy`));

  lines.push(`  ${chalk.bold('Plan:')} ${parts.join(', ')} (${summary.total} total)`);
  lines.push('');

  return lines.join('\n');
}

module.exports = { renderTerminal };
