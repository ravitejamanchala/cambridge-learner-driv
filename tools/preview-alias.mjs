// Each development branch has its own preview. Never overwrite another review,
// or select the production Pages branch, when no PR number is available yet.
export function previewAlias(prNumber, branch) {
  if (prNumber) {
    if (!/^[1-9]\d*$/.test(prNumber)) throw Error('Invalid PR number');
    return 'pr-' + prNumber;
  }
  const aliases = {
    'feature/production-cockpit-billing': 'cockpit-review',
    'feature/personal-route-builder': 'routes-review',
    'feature/professional-ui': 'design-review',
  };
  if (!Object.hasOwn(aliases, branch)) throw Error('No isolated preview for this branch');
  return aliases[branch];
}
