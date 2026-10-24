// Evening driving (issue #10): what changes when a lesson is set at dusk. Lamps on every vehicle, the sky,
// and the textures the world uses for road lighting. Nothing here touches the road, the traffic's
// priorities or the assessment: lighting is only what the learner sees.
//
// Every lamp shares one geometry and one material per colour, so a long drive at dusk adds nothing to
// the GPU as cars come and go (npm run test:free measures this for the motorway).
const T = THREE;

export const DUSK = {
  sky: { top: '#24304f', mid: '#4f5675', low: '#9a7385', horizon: '#e0905f' },
  fog: 0x575872, fogNear: 230, fogFar: 820,   // far enough that nothing marked is ever hidden in it
  hemi: { sky: 0x6d7da0, ground: 0x2c2822, intensity: 0.5 },
  sun: { colour: 0xff9f62, intensity: 0.42, offset: [-300, 55, 60] }, // low in the west: long shadows
  lines: 0xcfcfc6,                             // retroreflective, but not glowing white on a dark road
};

let KIT = null;
const kit = () => KIT || (KIT = {
  lamp: new T.PlaneGeometry(0.34, 0.16),
  head: new T.MeshBasicMaterial({ color: 0xfff6dc }),
  tail: new T.MeshBasicMaterial({ color: 0xd8261c }),
  glow: new T.PlaneGeometry(1, 1),
});

// Front and rear lamps for a vehicle body, placed from its own bounding box (vehicles face -z). The
// group is hidden in daylight; `front` can be switched separately (the learner's dipped headlights).
export function attachLamps(body) {
  const K = kit(), box = new T.Box3().setFromObject(body);
  if (!isFinite(box.min.x)) return null;
  const g = new T.Group(); g.name = 'lamps'; g.visible = false;
  const y = box.min.y + (box.max.y - box.min.y) * 0.38, x = (box.max.x - box.min.x) / 2 - 0.28;
  const front = new T.Group(), rear = new T.Group();
  for (const sx of [-x, x]) {
    const h = new T.Mesh(K.lamp, K.head); h.position.set(sx, y, box.min.z - 0.02); h.rotation.y = Math.PI; front.add(h);
    const r = new T.Mesh(K.lamp, K.tail); r.position.set(sx, y, box.max.z + 0.02); rear.add(r);
  }
  g.add(front, rear); g.userData = { front, rear };
  body.add(g);
  return g;
}
// Indicators on every vehicle: a small amber block at each corner, seen from in front, behind and beside,
// flashing on the side the driver is going (vehicles face -z, so their left is -x). One geometry and one
// material for all of them.
let IND = null;
export function attachIndicators(body) {
  IND = IND || { geo: new T.BoxGeometry(0.16, 0.09, 0.09), mat: new T.MeshBasicMaterial({ color: 0xffa31a }) };
  const box = new T.Box3().setFromObject(body); if (!isFinite(box.min.x)) return null;
  const g = new T.Group(); g.name = 'indicators';
  const y = box.min.y + (box.max.y - box.min.y) * 0.42, x = (box.max.x - box.min.x) / 2 - 0.06, L = new T.Group(), R = new T.Group();
  for (const [side, sx] of [[L, -x], [R, x]]) for (const z of [box.min.z + 0.05, box.max.z - 0.05]) { const m = new T.Mesh(IND.geo, IND.mat); m.position.set(sx, y, z); side.add(m); }
  L.visible = R.visible = false; g.add(L, R); g.userData = { L, R }; body.add(g);
  return g;
}
// flash a vehicle's indicators: `dir` 'L', 'R' or null, `on` the flash phase
export function setIndicators(holder, dir, on) {
  let g = holder.userData.ind; if (!g || g.parent?.parent !== holder) g = holder.userData.ind = holder.getObjectByName('indicators');
  if (!g) return; g.userData.L.visible = on && dir === 'L'; g.userData.R.visible = on && dir === 'R';
}
// switch a vehicle's lamps: all of them at dusk, and the front ones only if its headlights are on
export function setLamps(body, dusk, headlights = true) {
  const g = body && body.getObjectByName('lamps'); if (!g) return;
  g.visible = dusk; g.userData.front.visible = dusk && headlights;
}

// the sky behind everything at dusk: deep blue overhead down to a warm glow on the horizon
export function duskSky() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), s = DUSK.sky, grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, s.top); grad.addColorStop(0.45, s.mid); grad.addColorStop(0.72, s.low); grad.addColorStop(0.86, s.horizon); grad.addColorStop(1, s.horizon);
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  const t = new T.CanvasTexture(c); t.needsUpdate = true; return t;
}

// a soft pool of light for the road under a lamp: added on top of the surface, never replacing it
export function lightPoolTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,214,150,0.55)'); grad.addColorStop(0.5, 'rgba(255,200,130,0.22)'); grad.addColorStop(1, 'rgba(255,190,120,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new T.CanvasTexture(c); t.needsUpdate = true; return t;
}
