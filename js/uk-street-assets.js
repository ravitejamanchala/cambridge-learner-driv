// Original low-poly UK street furniture. Each object uses one vertex-colour mesh,
// no downloaded models/textures, and stays within its native collision envelope.
export const STREET_ASSETS = Object.freeze({
  lamp: [.9, 6, .4], bench: [1.8, .9, .65], bin: [.6, 1, .6],
  bollard: [.2, .9, .2], gate: [2, 1.2, .2], postBox: [.5, 1.3, .5],
  bicycleParking: [1.5, .8, .6], busStop: [.45, 3, .18],
  busShelter: [3.2, 2.5, 1.5], sign: [.6, 2.2, .15],
});
export function streetAssetHeading(tags = {}) {
  const value = tags.direction;
  if (value == null) return undefined;
  const cardinal = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
  const degrees = cardinal[String(value).toUpperCase()] ?? (/^\d+(\.\d+)?$/.test(String(value)) ? Number(value) : NaN);
  // Models face +Z; OSM direction is clockwise from north.
  return Number.isFinite(degrees) && degrees >= 0 && degrees <= 360 ? Math.PI - degrees * Math.PI / 180 : undefined;
}
export function streetAssetGeometry(T, kind, dimensions = STREET_ASSETS[kind]) {
  if (!Object.hasOwn(STREET_ASSETS, kind) || !dimensions) return null;
  const [W, H, D] = dimensions, positions = [], colours = [];
  const steel = 0x4d585b, silver = 0x9da9a8, wood = 0x94785a,
    cream = 0xe5e2d5, dark = 0x263b3b, glass = 0x8fa7ab, red = 0xa84036;
  const part = (geometry, color, x, y, z, rotation = 0) => {
    geometry.rotateZ(rotation); geometry.translate(x, y, z);
    const g = geometry.index ? geometry.toNonIndexed() : geometry, p = g.attributes.position, c = new T.Color(color);
    for (let i = 0; i < p.count; i++) {
      positions.push(p.getX(i) / W, p.getY(i) / H - .5, p.getZ(i) / D);
      colours.push(c.r, c.g, c.b);
    }
    if (g !== geometry) g.dispose(); geometry.dispose();
  };
  const box = (w,h,d,x,y,z,c) => part(new T.BoxGeometry(w,h,d),c,x,y,z);
  const pole = (radius,height,x,y,z,c=steel) => part(new T.CylinderGeometry(radius,radius,height,8),c,x,y,z);
  if (kind === 'lamp') {
    const x = -W*.32, r = Math.min(W*.07,D*.2);
    pole(r,H*.91,x,H*.455,0); pole(r*1.4,H*.06,x,H*.03,0);
    box(W*.7,H*.025,D*.2,0,H*.92,0,steel);
    box(W*.36,H*.035,D*.85,W*.25,H*.955,0,silver);
    box(W*.3,H*.008,D*.65,W*.25,H*.934,0,cream);
  } else if (kind === 'bench') {
    for (const x of [-W*.35,W*.35]) {
      box(W*.045,H*.5,D*.75,x,H*.25,0,steel);
      box(W*.04,H*.85,D*.06,x,H*.425,-D*.36,steel);
      box(W*.055,H*.055,D*.76,x,H*.65,0,steel);
    }
    for(let i=0;i<4;i++) box(W,H*.06,D*.17,0,H*.5,-D*.3+i*D*.2,wood);
    for(let i=0;i<3;i++) box(W,H*.1,D*.075,0,H*(.68+i*.13),-D*.37,wood);
  } else if (kind === 'bicycleParking') {
    // Three Sheffield-style inverted U stands, not a solid fence.
    for(const z of [-D*.4,0,D*.4]) {
      const r=Math.min(W*.025,D*.06), x=W*.42;
      for(const side of [-x,x]) pole(r,H*.87,side,H*.435,z,silver);
      box(x*2,r*2,r*2,0,H*.87,z,silver);
    }
  } else if (kind === 'bollard') {
    pole(Math.min(W,D)*.46,H*.94,0,H*.47,0,dark);
    pole(Math.min(W,D)*.47,H*.14,0,H*.76,0,cream);
    box(W*.45,H*.08,D*.02,0,H*.77,D*.475,0xe4c858);
  } else if (kind === 'postBox') {
    const r=Math.min(W,D)*.48;
    pole(r,H*.76,0,H*.48,0,red); pole(r*.88,H*.12,0,H*.06,0,dark);
    pole(r,H*.08,0,H*.9,0,red);
    box(W*.51,H*.055,D*.025,0,H*.74,D*.475,dark);
    box(W*.35,H*.2,D*.025,0,H*.53,D*.475,cream);
    box(W*.19,H*.012,D*.01,0,H*.56,D*.492,steel);
    box(W*.19,H*.012,D*.01,0,H*.52,D*.492,steel);
  } else if (kind === 'bin') {
    box(W*.9,H*.78,D*.9,0,H*.39,0,dark);
    box(W,H*.09,D,0,H*.91,0,steel);
    for(const x of [-W*.4,W*.4]) box(W*.08,H*.17,D*.8,x,H*.8,0,dark);
    for(const x of [-W*.3,-W*.1,W*.1,W*.3]) box(W*.035,H*.65,D*.03,x,H*.38,D*.46,silver);
    box(W*.17,H*.14,D*.025,0,H*.58,D*.485,cream);
  } else if (kind === 'gate') {
    for(const x of [-W*.46,W*.46]) box(W*.06,H,D,x,H*.5,0,steel);
    for(const y of [H*.3,H*.8]) box(W*.9,H*.065,D*.5,0,y,0,cream);
    for(const x of [-W*.25,0,W*.25]) box(W*.025,H*.55,D*.45,x,H*.55,0,cream);
  } else if (kind === 'busStop') {
    pole(Math.min(W*.08,D*.24),H*.91,-W*.15,H*.455,0,silver);
    box(W,H*.17,D*.65,0,H*.9,0,cream);
    box(W*.92,H*.035,D*.04,0,H*.961,D*.35,red);
    // Original bus pictogram (no operator logo or invented route number).
    box(W*.58,H*.074,D*.04,0,H*.884,D*.35,dark);
    box(W*.45,H*.028,D*.02,0,H*.901,D*.38,cream);
    for(const x of [-W*.19,W*.19]) box(W*.11,H*.016,D*.02,x,H*.841,D*.38,dark);
    box(W*.42,H*.15,D*.5,-W*.15,H*.64,0,steel);
    box(W*.33,H*.13,D*.02,-W*.15,H*.64,D*.26,cream);
  } else if (kind === 'busShelter') {
    box(W,H*.055,D,0,H*.96,0,steel);
    box(W*.96,H*.02,D*.94,0,H*.924,0,cream);
    for(const x of [-W*.45,W*.45]) for(const z of [-D*.43,D*.43]) pole(.035,H*.92,x,H*.46,z,silver);
    // Opaque muted glazing avoids transparency sorting and overlapping layers.
    box(W*.88,H*.64,D*.025,0,H*.56,-D*.43,glass);
    box(W*.012,H*.64,D*.82,-W*.45,H*.56,0,glass);
    box(W*.012,H*.64,D*.82,W*.45,H*.56,0,glass);
    for(const x of [-W*.15,W*.15]) pole(.025,H*.88,x,H*.46,-D*.41,silver);
    box(W*.86,H*.025,D*.025,0,H*.61,-D*.405,cream);
    box(W*.58,H*.035,D*.26,0,H*.21,-D*.22,wood);
    for(const x of [-W*.22,W*.22]) box(W*.025,H*.2,D*.13,x,H*.1,-D*.22,steel);
  } else if (kind === 'sign') {
    // Unknown sign faces stay blank; legal signs are supplied by existing controls.
    pole(Math.min(W*.055,D*.24),H*.95,0,H*.475,0,silver);
    box(W,H*.22,D*.5,0,H*.83,0,cream);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new T.Float32BufferAttribute(colours,3));
  geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return geometry;
}
