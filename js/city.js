// Stylised city dressing for each 400 m chunk: houses with pitched roofs, shops with awnings,
// taller blocks with rooftop gardens, street lamps and trees. Everything is instanced per chunk.
import { posAt, nearest } from './net.js';

const T = THREE;
const pick = (R, a) => a[Math.floor(R() * a.length)];
const rr = (R, [a, b]) => a + R() * (b - a);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new T.CanvasTexture(c); t.anisotropy = 4; return t;
}
// facade: storeys x windows, with a door, shopfront or lobby on the ground floor. White so instance colour tints the wall.
function facade(floors, cols, ground) {
  return canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    const fh = H / floors;
    for (let f = 0; f < floors; f++) {
      const y0 = H - (f + 1) * fh;
      g.fillStyle = 'rgba(0,0,0,0.07)'; g.fillRect(0, y0 + fh - 3, W, 3);
      if (f === 0 && (ground === 'shop' || ground === 'lobby')) {
        g.fillStyle = '#26323b'; g.fillRect(8, y0 + fh * 0.26, W - 16, fh * 0.74);
        g.fillStyle = '#6d8ea3'; g.fillRect(14, y0 + fh * 0.32, W * 0.62, fh * 0.62);
        g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(20, y0 + fh * 0.36, W * 0.18, fh * 0.22);
        g.fillStyle = ground === 'shop' ? '#4a3022' : '#6d8ea3'; g.fillRect(W * 0.72, y0 + fh * 0.36, W * 0.17, fh * 0.64);
        continue;
      }
      const cw = W / cols;
      for (let c = 0; c < cols; c++) {
        const x = c * cw + cw * 0.22, w = cw * 0.56, y = y0 + fh * 0.2, h = fh * 0.58;
        if (f === 0 && ground === 'door' && c === cols - 1) {
          g.fillStyle = '#e9e6df'; g.fillRect(x + w * 0.15 - 3, y0 + fh * 0.22, w * 0.7 + 6, fh * 0.78);
          g.fillStyle = pick(Math.random, ['#2c4a6e', '#7a2e2e', '#2f5a45', '#202528']); g.fillRect(x + w * 0.15, y0 + fh * 0.26, w * 0.7, fh * 0.74);
          continue;
        }
        g.fillStyle = '#ece9e2'; g.fillRect(x - 4, y - 4, w + 8, h + 8);
        g.fillStyle = '#4d6577'; g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(255,255,255,.24)'; g.fillRect(x + 3, y + 3, w * 0.34, h * 0.42);
        g.fillStyle = '#ece9e2'; g.fillRect(x + w / 2 - 2, y, 4, h); g.fillRect(x, y + h * 0.45, w, 3);
        g.fillStyle = 'rgba(0,0,0,.14)'; g.fillRect(x - 4, y + h + 4, w + 8, 4);
      }
    }
    g.fillStyle = '#ffffff'; g.fillRect(W - 8, 0, 8, 8);
  });
}
// unit box, base at y=0; top/bottom faces sample a plain corner of the facade texture
function boxGeo() {
  const g = new T.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  const uv = g.attributes.uv; for (let i = 8; i < 16; i++) uv.setXY(i, 0.985, 0.985); uv.needsUpdate = true; return g;
}
// triangular prism roof, ridge along local x, base 1 x 1, height 1
function prismGeo() {
  const p = [-.5, 0, .5, .5, 0, .5, .5, 1, 0, -.5, 0, .5, .5, 1, 0, -.5, 1, 0, .5, 0, -.5, -.5, 0, -.5, -.5, 1, 0, .5, 0, -.5, -.5, 1, 0, .5, 1, 0,
    -.5, 0, .5, -.5, 1, 0, -.5, 0, -.5, .5, 0, .5, .5, 0, -.5, .5, 1, 0];
  const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(p, 3)); g.computeVertexNormals(); return g;
}

let K = null;
// shared geometry, materials and textures that must survive a map-area change
export function kitResources() {
  if (!K) return [];
  const mats = Object.values(K.mats);
  return [K.box, K.prism, K.unit, K.trunkG, K.crownG, K.poleG, K.headG, ...mats, ...mats.map(m => m.map).filter(Boolean)];
}
function kit() {
  if (K) return K;
  const lam = (c, o = {}) => new T.MeshLambertMaterial({ color: c, ...o });
  K = {
    box: boxGeo(), prism: prismGeo(), unit: new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
    mats: {
      house: lam(0xffffff, { map: facade(2, 2, 'door') }), shop: lam(0xffffff, { map: facade(3, 3, 'shop') }), block: lam(0xffffff, { map: facade(5, 4, 'lobby') }),
      roof: lam(0xffffff), garden: lam(0x7aa356), white: lam(0xffffff), pole: lam(0x3a4045), lampHead: new T.MeshBasicMaterial({ color: 0xfff1c8 }),
      trunk: lam(0x6b5340), crown: lam(0xffffff)
    },
    trunkG: new T.CylinderGeometry(0.2, 0.3, 3, 6).translate(0, 1.5, 0),
    crownG: new T.IcosahedronGeometry(2.4, 0),
    poleG: new T.CylinderGeometry(0.07, 0.09, 7, 6).translate(0, 3.5, 0),
    headG: new T.BoxGeometry(0.35, 0.16, 1.4)
  };
  return K;
}

const TYPES = {
  house: { w: [6.4, 8], d: [8, 10], h: [6, 7.2], tints: [0xe2c99a, 0xd9bd8c, 0xb4664c, 0xa95a42, 0xf1ece2, 0xc98a62], roof: 'pitch' },
  shop: { w: [9, 12], d: [10, 13], h: [9.5, 11.5], tints: [0xf3e7d3, 0xe8d6b8, 0xf6f1e8, 0xd99a7a, 0xe0c38f], roof: 'flat', awning: true },
  block: { w: [13, 17], d: [12, 16], h: [15, 19], tints: [0xf4f1ea, 0xe46a4c, 0xe7dccb, 0xc9d3d8, 0xd8b98e], roof: 'flat' }
};
const ROOF_PITCH = [0x55606a, 0x4a5058, 0x9b5a40, 0x8c4f3b];
const ROOF_FLAT = [0x8d9196, 0x7c8186, 0x9a9690];
const AWN = [0xc4473a, 0x2f7a5a, 0x2c4a6e, 0xd9862e, 0x8a3b5a];
const CROWNS = [0x5f9e4a, 0x73ad55, 0x4f8a42, 0x86b85e];

export function buildChunkContent(net, edges, cx, cz, C, R) {
  const k = kit(), grp = new T.Group();
  const B = { house: [], shop: [], block: [] }, bushes = [], roofsP = [], roofsF = [], gardens = [], props = [], awnings = [], trees = [], lamps = [];
  const occ = new Map();
  const hit = (x, z, r) => { const gx = Math.floor(x / 12), gz = Math.floor(z / 12); for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = occ.get((gx + i) * 100003 + gz + j); if (a) for (const b of a) if (Math.hypot(b[0] - x, b[1] - z) < (b[2] + r) * 0.9) return true; } return false; };
  const add = (x, z, r) => { const kk = Math.floor(x / 12) * 100003 + Math.floor(z / 12); let a = occ.get(kk); if (!a) occ.set(kk, a = []); a.push([x, z, r]); };
  const inChunk = (x, z) => Math.floor(x / C) === cx && Math.floor(z / C) === cz;
  const centreDist = (x, z) => Math.hypot(x + 150, z + 380); // roughly Market Square
  for (const e of edges) {
    const cls = e.way.cls; if (/trunk/.test(cls) || e.way.rb || e.way.mph >= 50) continue; // no houses along fast roads and country lanes
    const main = /^(primary|secondary|tertiary)/.test(cls);
    // street lamps on main roads
    if (main) for (let s = 10, i = 0; s < e.len - 6; s += 34, i++) {
      const p = posAt(e, s), side = i % 2 ? 1 : -1, o = e.way.w / 2 + 0.9, x = p.x + p.tz * side * o, z = p.z - p.tx * side * o;
      if (inChunk(x, z)) lamps.push([x, z, -p.tz * side, p.tx * side]); // last two: direction from pole towards the road
    }
    for (const side of [-1, 1]) {
      let s = 5;
      while (s < e.len - 5) {
        const p = posAt(e, s), nx = p.tz * side, nz = -p.tx * side;
        const cd = centreDist(p.x, p.z);
        const type = main ? (cd < 1600 ? (R() < 0.62 ? 'shop' : 'block') : (R() < 0.45 ? 'shop' : 'house')) : (cd < 900 && R() < 0.35 ? 'shop' : 'house');
        const TY = TYPES[type], w = rr(R, TY.w), d = rr(R, TY.d), h = rr(R, TY.h);
        s += w * 0.5;
        const pp = posAt(e, Math.min(s, e.len - 1));
        const setback = e.way.w / 2 + 3.0 + (type === 'house' ? 2 + R() * 3 : 0.4) + d / 2;
        const x = pp.x + pp.tz * side * setback, z = pp.z - pp.tx * side * setback, rad = Math.max(w, d) / 2;
        s += w * 0.5 + (type === 'house' ? 0.4 + R() * 1.2 : 1 + R() * 3);
        if (!inChunk(x, z)) continue;
        const nr = nearest(net, x, z); if (nr && nr.d - nr.way.w / 2 < rad * 0.82 + 2.6) continue;
        if (net.cycleRings.some(r => Math.hypot(x - r.x, z - r.z) < r.r + 4 + rad)) continue; // keep clear of a roundabout cycle track
        if (hit(x, z, rad)) continue; add(x, z, rad);
        const rot = Math.atan2(-pp.tz, pp.tx), front = side > 0 ? 1 : -1;
        B[type].push({ x, z, w, d, h, rot, c: pick(R, TY.tints) });
        if (TY.roof === 'pitch') roofsP.push({ x, z, y: h, w: w * 1.06, d: d * 1.08, h: Math.min(w, d) * 0.38, rot, c: pick(R, ROOF_PITCH) });
        else {
          roofsF.push({ x, z, y: h, w: w * 1.02, d: d * 1.02, h: 0.45, rot, c: pick(R, ROOF_FLAT) });
          if (R() < (cd < 1600 ? 0.55 : 0.3)) {
            gardens.push({ x, z, y: h + 0.45, w: w * 0.8, d: d * 0.75, h: 0.5, rot, c: pick(R, [0x7aa356, 0x6f9c4c, 0x86b25f]) });
            for (let q = 0; q < 3; q++) { const ox = (R() - 0.5) * w * 0.6, oz = (R() - 0.5) * d * 0.55; bushes.push({ x: x + Math.cos(rot) * ox + Math.sin(rot) * oz, z: z - Math.sin(rot) * ox + Math.cos(rot) * oz, y: h + 0.9, s: 0.28 + R() * 0.25, c: pick(R, CROWNS) }); }
          }
          const nP = 1 + Math.floor(R() * 2);
          for (let q = 0; q < nP; q++) { const ox = (R() - 0.5) * w * 0.5, oz = (R() - 0.5) * d * 0.5; props.push({ x: x + Math.cos(rot) * ox + Math.sin(rot) * oz, z: z - Math.sin(rot) * ox + Math.cos(rot) * oz, y: h + 0.45, w: 1.4, d: 1.1, h: 0.9 + R() * 0.6, rot, c: 0xb9bdc1 }); }
        }
        if (TY.awning && R() < 0.8) {
          const off = front * (d / 2 + 0.7);
          awnings.push({ x: x + Math.sin(rot) * off, z: z + Math.cos(rot) * off, y: 3.1, w: w * 0.82, d: 1.5, h: 0.14, rot, tilt: front * 0.32, c: pick(R, AWN) });
        }
      }
      // street trees on residential roads
      if (!main) for (let t = 8; t < e.len - 8; t += 18 + R() * 20) {
        if (R() > 0.45) continue;
        const p = posAt(e, t), o = e.way.w / 2 + 1.6, x = p.x + p.tz * side * o, z = p.z - p.tx * side * o;
        if (!inChunk(x, z) || hit(x, z, 2)) continue;
        const nr = nearest(net, x, z); if (nr && nr.d - nr.way.w / 2 < 1) continue;
        trees.push([x, z, 0.85 + R() * 0.45]); add(x, z, 2);
      }
    }
  }
  const M = new T.Matrix4(), Q = new T.Quaternion(), E = new T.Euler(), V = new T.Vector3(), S = new T.Vector3(), col = new T.Color();
  function inst(geo, mat, list, setup, shadow = true) {
    if (!list.length) return;
    const im = new T.InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => { setup(b); im.setMatrixAt(i, M); if (b.c !== undefined) im.setColorAt(i, col.setHex(b.c)); });
    im.frustumCulled = false; im.castShadow = shadow; im.receiveShadow = true; grp.add(im);
  }
  const boxSet = (b) => { E.set(b.tilt || 0, b.rot, 0, 'YXZ'); Q.setFromEuler(E); M.compose(V.set(b.x, b.y || 0, b.z), Q, S.set(b.w, b.h, b.d)); };
  for (const t of ['house', 'shop', 'block']) inst(k.box, k.mats[t], B[t], boxSet);
  inst(k.prism, k.mats.roof, roofsP, boxSet);
  inst(k.unit, k.mats.roof, roofsF, boxSet);
  inst(k.unit, k.mats.garden, gardens, boxSet, false);
  inst(k.unit, k.mats.white, props, boxSet);
  inst(k.unit, k.mats.white, awnings, boxSet);
  inst(k.trunkG, k.mats.trunk, trees, ([x, z, s]) => { M.makeScale(s, s, s); M.setPosition(x, 0, z); });
  const crowns = trees.map(([x, z, s], i) => ({ x, z, s, c: CROWNS[i % CROWNS.length] }));
  inst(k.crownG, k.mats.crown, crowns, (b) => { M.makeScale(b.s, b.s * 1.1, b.s); M.setPosition(b.x, 4.6 * b.s, b.z); });
  inst(k.crownG, k.mats.crown, bushes, (b) => { M.makeScale(b.s, b.s * 0.8, b.s); M.setPosition(b.x, b.y + b.s, b.z); });
  inst(k.poleG, k.mats.pole, lamps, ([x, z]) => { M.makeTranslation(x, 0, z); });
  inst(k.headG, k.mats.lampHead, lamps, ([x, z, dx, dz]) => { E.set(0, Math.atan2(dx, dz), 0, 'YXZ'); Q.setFromEuler(E); M.compose(V.set(x + dx * 0.6, 6.95, z + dz * 0.6), Q, S.set(1, 1, 1)); }, false);
  return grp;
}
