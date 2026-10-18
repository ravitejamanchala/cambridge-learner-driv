// Mapillary encodes what a sign is in its class string, e.g.
//   regulatory--maximum-speed-limit-30--g1   warning--roundabout-ahead--g1
// so the useful fields can be read straight out of the name.
const SPEED = /^regulatory--maximum-speed-limit-(\d+)--/;

export function parseSign(value) {
  if (typeof value !== 'string') return null;
  const s = SPEED.exec(value);
  // UK signs are posted in mph; Mapillary's class number is the posted figure.
  if (s) return { kind: 'speed', mph: Number(s[1]), value };
  if (value.startsWith('regulatory--give-way')) return { kind: 'giveway', value };
  if (value.startsWith('regulatory--stop')) return { kind: 'stop', value };
  if (value.startsWith('regulatory--no-entry')) return { kind: 'noentry', value };
  if (value.startsWith('warning--roundabout')) return { kind: 'roundabout-ahead', value };
  return null;                                   // 1,500 classes exist; we only act on these
}
