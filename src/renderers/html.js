const { summarize } = require('../parser/plan');

const ACTION_COLORS = {
  create: '#22c55e',
  update: '#eab308',
  delete: '#ef4444',
  replace: '#a855f7',
};

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCost(cost) {
  if (cost === null || cost === undefined) return '';
  return `$${Number(cost).toFixed(2)}/mo`;
}

function truncate(str, len) {
  if (typeof str !== 'string') str = JSON.stringify(str) || '';
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

function renderHtml(resources, options = {}) {
  const summary = summarize(resources);
  const destructive = resources.filter(r => r.isDestructive);
  const totalMonthlyCost = resources.reduce((sum, r) => sum + (r.monthlyCost || 0), 0);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Terraform Plan Summary</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
    background: #0d1117;
    color: #c9d1d9;
    padding: 2rem;
    line-height: 1.6;
  }
  .container { max-width: 960px; margin: 0 auto; }
  h1 {
    font-size: 1.5rem;
    color: #f0f6fc;
    margin-bottom: 0.5rem;
  }
  .divider {
    border: none;
    border-top: 1px solid #21262d;
    margin: 1rem 0;
  }
  .warning {
    background: #3d1214;
    border: 1px solid #f85149;
    border-radius: 6px;
    padding: 1rem;
    margin: 1rem 0;
  }
  .warning-title {
    color: #f85149;
    font-weight: bold;
    font-size: 1.1rem;
    margin-bottom: 0.5rem;
  }
  .warning-item { color: #f85149; margin-left: 1rem; }
  .resource {
    border: 1px solid #21262d;
    border-radius: 6px;
    margin: 0.5rem 0;
    padding: 0.75rem 1rem;
    background: #161b22;
  }
  .resource-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .action-badge {
    display: inline-block;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: bold;
    color: #0d1117;
    margin-right: 0.5rem;
  }
  .address { color: #f0f6fc; font-weight: 500; }
  .cost { color: #58a6ff; font-size: 0.85rem; }
  .diffs {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid #21262d;
    font-size: 0.85rem;
  }
  .diff-add { color: #3fb950; }
  .diff-remove { color: #f85149; }
  .diff-change { color: #d29922; }
  .summary-bar {
    display: flex;
    gap: 1.5rem;
    padding: 1rem;
    background: #161b22;
    border-radius: 6px;
    margin-top: 1rem;
  }
  .summary-item { font-weight: bold; }
  .cost-total {
    color: #58a6ff;
    font-size: 1.1rem;
    font-weight: bold;
    margin: 1rem 0;
  }
  .footer {
    margin-top: 2rem;
    color: #484f58;
    font-size: 0.75rem;
  }
</style>
</head>
<body>
<div class="container">
  <h1>Terraform Plan Summary</h1>
  <hr class="divider">`;

  // Destructive warning
  if (destructive.length > 0) {
    html += `
  <div class="warning">
    <div class="warning-title">⚠ DESTRUCTIVE CHANGES</div>`;
    for (const r of destructive) {
      html += `
    <div class="warning-item">${escapeHtml(r.actionLabel)} ${escapeHtml(r.address)}</div>`;
    }
    html += `
  </div>`;
  }

  // Resources
  if (!options.summaryOnly) {
    for (const r of resources) {
      const color = ACTION_COLORS[r.action] || '#c9d1d9';
      const costStr = r.monthlyCost !== null ? formatCost(r.monthlyCost) : '';

      html += `
  <div class="resource">
    <div class="resource-header">
      <div>
        <span class="action-badge" style="background:${color}">${escapeHtml(r.actionLabel)}</span>
        <span class="address">${escapeHtml(r.address)}</span>
      </div>
      ${costStr ? `<span class="cost">${escapeHtml(costStr)}</span>` : ''}
    </div>`;

      if (r.diffs && r.diffs.length > 0) {
        html += `
    <div class="diffs">`;
        for (const diff of r.diffs) {
          const fromStr = escapeHtml(truncate(diff.from, 60));
          const toStr = escapeHtml(truncate(diff.to, 60));
          switch (diff.type) {
            case 'add':
              html += `
      <div class="diff-add">+ ${escapeHtml(diff.field)} = ${toStr}</div>`;
              break;
            case 'remove':
              html += `
      <div class="diff-remove">- ${escapeHtml(diff.field)} = ${fromStr}</div>`;
              break;
            case 'change':
              html += `
      <div class="diff-change">~ ${escapeHtml(diff.field)}: ${fromStr} → ${toStr}</div>`;
              break;
          }
        }
        html += `
    </div>`;
      }

      html += `
  </div>`;
    }
  }

  // Cost total
  if (totalMonthlyCost > 0) {
    html += `
  <div class="cost-total">Estimated monthly cost: $${totalMonthlyCost.toFixed(2)}/mo</div>`;
  }

  // Summary bar
  html += `
  <div class="summary-bar">`;
  if (summary.create > 0) html += `<span class="summary-item" style="color:${ACTION_COLORS.create}">+${summary.create} create</span>`;
  if (summary.update > 0) html += `<span class="summary-item" style="color:${ACTION_COLORS.update}">~${summary.update} update</span>`;
  if (summary.replace > 0) html += `<span class="summary-item" style="color:${ACTION_COLORS.replace}">±${summary.replace} replace</span>`;
  if (summary.delete > 0) html += `<span class="summary-item" style="color:${ACTION_COLORS.delete}">-${summary.delete} destroy</span>`;
  html += `<span class="summary-item" style="color:#8b949e">${summary.total} total</span>`;
  html += `
  </div>

  <div class="footer">Generated by tfsummary</div>
</div>
</body>
</html>`;

  return html;
}

module.exports = { renderHtml };
