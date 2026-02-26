const ACTION_LABELS = {
  'no-op': 'no-op',
  'create': 'create',
  'read': 'read',
  'update': 'update',
  'delete': 'delete',
  'replace': 'replace',
};

const DESTRUCTIVE_ACTIONS = new Set(['delete', 'replace']);

function classifyAction(actions) {
  if (!actions || actions.length === 0) return 'no-op';
  if (actions.includes('delete') && actions.includes('create')) return 'replace';
  if (actions.includes('create') && actions.includes('delete')) return 'replace';
  if (actions.includes('delete')) return 'delete';
  if (actions.includes('create')) return 'create';
  if (actions.includes('update')) return 'update';
  if (actions.includes('read')) return 'read';
  return 'no-op';
}

function computeFieldDiffs(before, after) {
  if (!before || !after) return [];
  const diffs = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const bVal = before[key];
    const aVal = after[key];

    if (bVal === undefined && aVal !== undefined) {
      diffs.push({ field: key, from: null, to: aVal, type: 'add' });
    } else if (bVal !== undefined && aVal === undefined) {
      diffs.push({ field: key, from: bVal, to: null, type: 'remove' });
    } else if (JSON.stringify(bVal) !== JSON.stringify(aVal)) {
      diffs.push({ field: key, from: bVal, to: aVal, type: 'change' });
    }
  }

  return diffs;
}

function parsePlan(planData) {
  const resources = [];

  const changes = planData.resource_changes || [];

  for (const rc of changes) {
    if (!rc.change) continue;

    const actions = rc.change.actions || [];
    const action = classifyAction(actions);

    if (action === 'no-op' || action === 'read') continue;

    const before = rc.change.before || {};
    const after = rc.change.after || {};

    const resource = {
      address: rc.address,
      type: rc.type,
      name: rc.name,
      provider: rc.provider_name || '',
      action,
      actionLabel: ACTION_LABELS[action] || action,
      isDestructive: DESTRUCTIVE_ACTIONS.has(action),
      before,
      after,
      diffs: action === 'update' ? computeFieldDiffs(before, after) : [],
      monthlyCost: null,
      hourlyCost: null,
    };

    resources.push(resource);
  }

  // Sort: destructive first, then creates, then updates
  const order = { delete: 0, replace: 1, create: 2, update: 3 };
  resources.sort((a, b) => (order[a.action] ?? 9) - (order[b.action] ?? 9));

  return resources;
}

function summarize(resources) {
  const summary = { create: 0, update: 0, delete: 0, replace: 0, total: resources.length };
  for (const r of resources) {
    if (summary[r.action] !== undefined) summary[r.action]++;
  }
  return summary;
}

module.exports = { parsePlan, summarize, classifyAction, computeFieldDiffs };
