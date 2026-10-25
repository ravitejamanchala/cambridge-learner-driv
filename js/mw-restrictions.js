// Temporary restrictions on the motorway: smart-motorway gantries showing a lower limit and red X lane
// closures, and roadworks with a temporary limit, cones and a closed lane. Everything is placed by distance
// along the circuit's centre line on the A carriageway (js/motorway.js), on the straights. One plan is read
// by the lesson (js/motorway-lessons.js), the examiner's speed check and the HUD (test.restriction), the
// background traffic (traffic.setRestrictions) and the Bot lab's driver, so all of them agree on what the
// signs say.
import { MW, centreLine, onCarriageway, sampleAt } from './motorway.js';

const T = typeof THREE !== 'undefined' ? THREE : null;
const LIFT = 6.6, FACE = 2.4; // gantry signals: centre height above the road, and size (larger than life, to read at a distance)

// What each lesson's restriction looks like, in centre-line metres on carriageway A.
//  gantries: one signal per lane, 'NN' a mandatory limit, 'X' lane closed (Rule 258), 'L'/'R' move out of
//            this lane to that side, 'end' the restriction ends (national speed limit)
//  roadworks: a temporary limit over a stretch, and one lane closed behind a taper of cones
export const PLANS = {
  gantries: {
    kind: 'gantries', lanes: 3,
    gantries: [
      { at: 15950, show: ['60', '60', '60'] },
      { at: 16400, show: ['R', '50', '50'] },
      { at: 16850, show: ['X', '50', '50'] },
      { at: 17300, show: ['X', '50', '50'] },
      { at: 17750, show: ['50', '50', '50'] },
      { at: 18100, show: ['end', 'end', 'end'] },
    ],
    // why the left-hand lane is shut: a broken-down car with its hazard lights on
    incident: { at: 17450, lane: 0 },
  },
  roadworks: {
    kind: 'roadworks', lanes: 3, lane: 2, // the right-hand lane is closed
    limit: { from: 4700, to: 5980, mph: 50 },
    taper: [5250, 5400], works: [5400, 5900], reopen: 5960,
    signs: [
      { at: 4450, face: 'works', plate: '½ mile' },
      { at: 4520, face: 'lanes', plate: '800 yds' },
      { at: 4700, face: '50', both: true },
      { at: 5050, face: 'merge' },
      { at: 5980, face: 'end' },
    ],
  },
};

// ---- where things are, and what applies there ----
// the last gantry at or before s
const gantryAt = (P, s) => { let g = null; for (const q of P.gantries) if (q.at <= s) g = q; return g; };
const shown = (g) => g ? g.show.map(v => +v).filter(v => v > 0) : [];
// the mandatory limit at s (mph), or null where the road's own limit applies
export function limitAt(P, s) {
  if (s == null) return null;
  if (P.kind === 'gantries') { const g = gantryAt(P, s), n = shown(g); return n.length ? Math.max(...n) : null; }
  return s >= P.limit.from && s < P.limit.to ? P.limit.mph : null;
}
// the lanes closed at s
export function closedAt(P, s) {
  if (s == null) return [];
  if (P.kind === 'gantries') { const g = gantryAt(P, s); return g ? g.show.flatMap((v, i) => v === 'X' ? [i] : []) : []; }
  return s >= P.taper[0] && s < P.reopen ? [P.lane] : [];
}
// where lane `lane` next becomes closed, at or after s (null if it does not within `ahead` metres)
export function closesAt(P, lane, s, ahead) {
  for (let d = 0; d <= ahead; d += 10) if (closedAt(P, s + d).includes(lane)) return s + d;
  return null;
}
// the lowest limit from s to `ahead` metres on, so a driver can be down to it by the sign
export function limitAhead(P, s, ahead) {
  let lo = limitAt(P, s);
  const marks = P.kind === 'gantries' ? P.gantries.map(g => g.at) : [P.limit.from];
  for (const m of marks) if (m > s && m <= s + ahead) { const l = limitAt(P, m); if (l != null && (lo == null || l < lo)) lo = l; }
  return lo;
}
// In the coned-off area at roadworks? Lanes counted from the left, laneF in lanes (as js/lane-discipline.js
// measures it): the taper's cone line runs across the closed lane from its outer edge to its inner line.
export function inWorks(P, s, laneF) {
  if (P.kind !== 'roadworks' || s == null || laneF == null) return false;
  const [a, b] = P.taper, inner = P.lane - 0.5, outer = P.lane + 0.5;
  if (s >= a && s < b) { const line = outer + (inner - outer) * (s - a) / (b - a); return P.lane > 0 ? laneF > line + 0.15 : laneF < line - 0.15; }
  if (s >= b && s < P.works[1]) return P.lane > 0 ? laneF > inner + 0.15 : laneF < inner - 0.15;
  return false;
}

// Distance along the centre line of a vehicle on carriageway A, on either straight; null anywhere else (the
// bends, carriageway B, slip roads), where no restriction is ever placed. The north straight runs east
// from x = -L/2 at s = 0; the south straight runs west from x = +L/2 after the east bend.
const SOUTH0 = MW.straight + Math.PI * MW.radius;
export function sOnA(x, z, th) {
  const L = MW.straight; if (Math.abs(x) > L / 2) return null;
  const east = -Math.sin(th) > 0.5, west = -Math.sin(th) < -0.5;
  let s = z < 0 && east ? x + L / 2 : z > 0 && west ? SOUTH0 + (L / 2 - x) : null;
  if (s == null) return null;
  // the straights swing gently (an S-bend), so step along the centre line to the point level with this one
  for (let i = 0; i < 2; i++) { const c = sampleAt(centreLine(), s); s += (x - c.x) * c.tx + (z - c.z) * c.tz; }
  return s;
}
// lane of a point on carriageway A at centre-line s, counted from the left (0 the left-hand lane)
export function laneOnA(P, x, z, s) {
  const c = onCarriageway(centreLine(), P.lanes, 'A', s), off = (x - c.x) * c.nx + (z - c.z) * c.nz; // + to the left
  return (P.lanes - 1) / 2 - off / MW.laneW;
}

// ---- what it looks like ----
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.anisotropy = 4; return t; }
const FONT = (px) => `700 ${px}px Geist, ui-sans-serif, system-ui, sans-serif`;
// A gantry signal: lit, on black, as on a smart motorway (Highway Code Rules 258 and 261)
export function signalTex(v) {
  return canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#0d0f12'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2b2f36'; g.lineWidth = 8; g.strokeRect(4, 4, W - 8, H - 8);
    const cx = W / 2, cy = H / 2, r = 92;
    if (+v > 0) { // a red ring, the limit in black on white
      g.fillStyle = '#d4202b'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, r * 0.76, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.font = FONT(92); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(v, cx, cy + 6);
    } else if (v === 'X') { // lane closed: a red cross
      g.strokeStyle = '#ff2a2a'; g.lineWidth = 26; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx - 62, cy - 62); g.lineTo(cx + 62, cy + 62); g.moveTo(cx + 62, cy - 62); g.lineTo(cx - 62, cy + 62); g.stroke();
    } else if (v === 'L' || v === 'R') { // move out of this lane: a white arrow sloping down towards the lane to use
      const k = v === 'R' ? 1 : -1; g.save(); g.translate(cx, cy); g.rotate(k * Math.PI * 0.75); g.fillStyle = '#fff';
      g.fillRect(-12, -70, 24, 100); g.beginPath(); g.moveTo(-44, 26); g.lineTo(44, 26); g.lineTo(0, 78); g.closePath(); g.fill(); g.restore();
    } else if (v === 'end') { // national speed limit: white disc, black diagonal band
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
      g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip(); g.translate(cx, cy); g.rotate(-Math.PI / 4); g.fillStyle = '#111'; g.fillRect(-r, -16, 2 * r, 32); g.restore();
    }
  });
}
// Temporary signs for roadworks, on yellow backing boards
function worksTex(face, plate) {
  return canvasTex(256, 320, (g, W, H) => {
    g.fillStyle = '#ffd400'; g.fillRect(0, 0, W, H); g.strokeStyle = '#111'; g.lineWidth = 6; g.strokeRect(6, 6, W - 12, H - 12);
    const cx = W / 2; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (face === 'works') { // red triangle, a person digging
      g.fillStyle = '#d4202b'; g.beginPath(); g.moveTo(cx, 26); g.lineTo(W - 26, 210); g.lineTo(26, 210); g.closePath(); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.moveTo(cx, 62); g.lineTo(W - 58, 190); g.lineTo(58, 190); g.closePath(); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(cx - 12, 108, 10, 0, Math.PI * 2); g.fill(); g.fillRect(cx - 20, 120, 16, 38);
      g.lineWidth = 6; g.strokeStyle = '#111'; g.beginPath(); g.moveTo(cx - 4, 128); g.lineTo(cx + 26, 168); g.stroke();
      g.beginPath(); g.moveTo(cx + 8, 182); g.quadraticCurveTo(cx + 38, 150, cx + 62, 182); g.closePath(); g.fill();
    } else if (face === 'lanes') { // three lanes, the right-hand one ending
      g.fillStyle = '#111';
      for (let i = 0; i < 3; i++) { const x = 70 + i * 58; g.fillRect(x - 8, i === 2 ? 120 : 50, 16, i === 2 ? 110 : 180); g.beginPath(); g.moveTo(x - 26, i === 2 ? 128 : 58); g.lineTo(x, i === 2 ? 96 : 26); g.lineTo(x + 26, i === 2 ? 128 : 58); g.fill(); }
      g.fillStyle = '#d4202b'; g.fillRect(70 + 2 * 58 - 30, 100, 60, 14);
    } else if (face === 'merge') { g.fillStyle = '#111'; g.font = FONT(56); g.fillText('Merge', cx, 96); g.fillText('in turn', cx, 166); }
    else if (face === 'end') {
      g.fillStyle = '#111'; g.font = FONT(36); g.fillText('End of', cx, 60); g.fillText('roadworks', cx, 100);
      g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, 196, 66, 0, Math.PI * 2); g.fill(); g.lineWidth = 4; g.stroke();
      g.save(); g.beginPath(); g.arc(cx, 196, 64, 0, Math.PI * 2); g.clip(); g.translate(cx, 196); g.rotate(-Math.PI / 4); g.fillStyle = '#111'; g.fillRect(-70, -11, 140, 22); g.restore();
    } else if (+face > 0) {
      g.fillStyle = '#d4202b'; g.beginPath(); g.arc(cx, 140, 104, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, 140, 80, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.font = FONT(96); g.fillText(face, cx, 146);
    }
    if (plate) { g.fillStyle = '#111'; g.font = FONT(42); g.fillText(plate, cx, 272); }
  });
}
const keepLeftTex = () => canvasTex(128, 128, (g, W, H) => { g.fillStyle = '#0b4ea2'; g.beginPath(); g.arc(64, 64, 60, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
  g.save(); g.translate(64, 64); g.rotate(Math.PI * 0.75); g.fillStyle = '#fff'; g.fillRect(-9, -36, 18, 50); g.beginPath(); g.moveTo(-26, 10); g.lineTo(26, 10); g.lineTo(0, 42); g.closePath(); g.fill(); g.restore(); });

// flash the gantries' amber lamps, alternately, about once a second
export function flashLamps(group, clock) { const on = Math.floor(clock * 2) % 2 ? 1 : -1; for (const l of group?.userData.lamps || []) l.visible = l.userData.phase === on; }

// Build everything for plan P on carriageway A and add it to the scene. Returns the group, so the lesson can
// take it away again; group.userData.lamps are the amber lamps that flash beside a restricting signal.
export function buildRestriction(scene, P) {
  const line = centreLine(), group = new T.Group(); group.name = 'restriction';
  const grey = new T.MeshLambertMaterial({ color: 0x8a9096 }), half = P.lanes * MW.laneW / 2;
  const facing = (o, c) => { o.position.set(c.x, 0, c.z); o.rotation.y = Math.atan2(-c.tx, -c.tz); }; // faces drivers coming towards it
  if (P.kind === 'gantries') {
    const panel = new T.PlaneGeometry(FACE, FACE), lampG = new T.PlaneGeometry(0.34, 0.34), amber = new T.MeshBasicMaterial({ color: 0xffb21a }), lamps = [];
    const post = new T.BoxGeometry(0.45, LIFT + 1.2, 0.45).translate(0, (LIFT + 1.2) / 2, 0);
    const span = 2 * half + MW.shoulder + MW.hardStrip + 3, beam = new T.BoxGeometry(span, 0.5, 0.9), mats = new Map();
    const mat = (v) => mats.get(v) || mats.set(v, new T.MeshBasicMaterial({ map: signalTex(v) })).get(v);
    for (const q of P.gantries) {
      const c = onCarriageway(line, P.lanes, 'A', q.at), g = new T.Group(); facing(g, c);
      const mid = (MW.shoulder - MW.hardStrip) / 2; // the beam's middle, over the carriageway plus its strips
      const b = new T.Mesh(beam, grey); b.position.set(-mid, LIFT + 1.05, -0.3); g.add(b);
      for (const x of [-half - MW.shoulder - 1.2, half + MW.hardStrip + 1.2]) { const p = new T.Mesh(post, grey); p.position.set(x, 0, -0.3); g.add(p); }
      q.show.forEach((v, i) => { const x = (i - (P.lanes - 1) / 2) * MW.laneW, m = new T.Mesh(panel, mat(v)); m.position.set(x, LIFT, 0.2); g.add(m);
        // a pair of amber lamps at the top corners, flashing in turn, wherever the signal restricts you
        if (v !== 'end') for (const k of [-1, 1]) { const l = new T.Mesh(lampG, amber); l.position.set(x + k * (FACE / 2 - 0.25), LIFT + FACE / 2 - 0.25, 0.22); l.userData.phase = k; g.add(l); lamps.push(l); } });
      group.add(g);
    }
    group.userData.lamps = lamps;
  } else {
    // signs on the verge (and in the central reservation as well, for the limit)
    for (const sg of P.signs) for (const side of sg.both ? [1, -1] : [1]) {
      const lat = side > 0 ? half + MW.shoulder + 2 : -(half + MW.hardStrip + MW.reserve / 2);
      const c = onCarriageway(line, P.lanes, 'A', sg.at, lat), g = new T.Group(); facing(g, c);
      const face = new T.Mesh(new T.PlaneGeometry(2.4, 3.0), new T.MeshLambertMaterial({ map: worksTex(sg.face, sg.plate) })); face.position.y = 3.1; g.add(face);
      for (const x of [-0.8, 0.8]) { const leg = new T.Mesh(new T.CylinderGeometry(0.06, 0.06, 1.6, 6).translate(0, 0.8, 0), grey); leg.position.set(x, 0, -0.04); g.add(leg); }
      group.add(g);
    }
    // cones: across the closed lane over the taper, along its inner line through the works, and back out
    const pts = [], lane = (k) => (P.lanes - 1) / 2 - k, edge = lane(P.lane) + (P.lane > 0 ? -0.5 : 0.5), inner = lane(P.lane) + (P.lane > 0 ? 0.5 : -0.5);
    const [a, b] = P.taper;
    for (let s = a; s <= b; s += 6) pts.push([s, edge + (inner - edge) * (s - a) / (b - a)]);
    for (let s = b + 9; s < P.works[1]; s += 9) pts.push([s, inner]);
    for (let s = P.works[1]; s <= P.reopen; s += 8) pts.push([s, inner + (edge - inner) * (s - P.works[1]) / (P.reopen - P.works[1])]);
    const coneG = new T.ConeGeometry(0.26, 1.0, 10).translate(0, 0.5, 0), bandG = new T.CylinderGeometry(0.15, 0.18, 0.18, 10).translate(0, 0.56, 0); // 1 m motorway cones
    const cones = new T.InstancedMesh(coneG, new T.MeshLambertMaterial({ color: 0xff5a14 }), pts.length), bands = new T.InstancedMesh(bandG, new T.MeshLambertMaterial({ color: 0xf2f2f2 }), pts.length), m4 = new T.Matrix4();
    pts.forEach(([s, l], i) => { const c = onCarriageway(line, P.lanes, 'A', s, l * MW.laneW); m4.makeTranslation(c.x, 0, c.z); cones.setMatrixAt(i, m4); bands.setMatrixAt(i, m4); });
    group.add(cones, bands);
    // a keep-left sign where the taper starts, and a works vehicle inside the closed lane
    const kc = onCarriageway(line, P.lanes, 'A', a + 2, lane(P.lane) * MW.laneW), kl = new T.Group(); facing(kl, kc);
    const disc = new T.Mesh(new T.CircleGeometry(0.6, 24), new T.MeshLambertMaterial({ map: keepLeftTex() })); disc.position.y = 1.6; kl.add(disc);
    const kleg = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 1.0, 6).translate(0, 0.5, 0), grey); kl.add(kleg); group.add(kl);
    const vc = onCarriageway(line, P.lanes, 'A', (P.works[0] + P.works[1]) / 2, lane(P.lane) * MW.laneW), van = new T.Group(); facing(van, vc);
    const body = new T.Mesh(new T.BoxGeometry(2.0, 2.2, 5.6).translate(0, 1.35, 0), new T.MeshLambertMaterial({ color: 0xf2c200 })); van.add(body);
    const board = new T.Mesh(new T.PlaneGeometry(1.8, 1.0), new T.MeshBasicMaterial({ map: keepLeftTex() })); board.position.set(0, 2.9, 2.85); van.add(board);
    group.add(van);
  }
  scene.add(group);
  return group;
}
