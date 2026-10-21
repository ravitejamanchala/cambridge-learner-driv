// Blue-light vehicle (Rule 219): a police car comes up behind the learner with its lights on, driving
// hard and faster than anything else on the road. Spotting it in the mirrors is the skill, which is
// why it always comes from behind; the learner then slows and makes room, without breaking the law,
// mounting the kerb or stopping somewhere that blocks it.
// Used by the blue-light lesson and by every mock test.
// The vehicle still obeys traffic lights here; real crews may treat a red as a give-way, which this
// training build deliberately does not model.
export const EMERGENCY = {
  trigger: 70,       // metres along the route before it appears
  behind: 80,        // metres behind the learner when it is placed
  cruise: 1.7,       // well above the limit, and above anything else on the road (traffic runs 0.88-1.0)
  follow: 20,        // seconds it will sit behind before that counts against you
  blocking: 2,       // seconds sat in a junction or on a crossing before that counts as blocking it
  giveUp: 45,        // seconds held up before it finds another way and the drive carries on
  abandon: 90,       // seconds before the whole event is written off, however far away it got
  clearSpeed: 3.0,   // m/s (about 7 mph) or below counts as slowing down for it
  kerbRoom: 1.9      // metres from the nearside kerb that counts as having pulled in
};

// The blue lights. The police model carries its own bar on the roof, with a `BlueLights` material on
// the lenses, so that is what gets flashed rather than a second bar bolted on over the top. What makes
// it carry at a distance is not the lens — a few pixels of blue in a mirror — but an additive halo
// around it, which keeps a floor on its size however far away the car is.
const LAMP = { lens: 0x8fc0ff, glow: 0x3f7bff, dim: 0x101a46, halo: 0x4b84ff };
function haloTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(150,195,255,0.75)');
  grd.addColorStop(1, 'rgba(60,120,255,0)');
  x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function makeHalo(tex) {
  const T = THREE;
  const halo = new T.Sprite(new T.SpriteMaterial({ map: tex, color: LAMP.halo, blending: T.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.set(1.4, 1.4, 1); halo.renderOrder = 6;
  return halo;
}
// Every part of the model drawn with the blue-lens material, and where in the car those lenses sit.
// The material is cloned first, because the model's materials are shared with every other car.
function modelLamps(root) {
  const T = THREE, mats = [], points = [];
  root.updateMatrixWorld(true);
  root.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    list.forEach((m, i) => {
      if (!/blue\s*light/i.test(m?.name || '')) return;
      const clone = m.clone(); clone.name = m.name;
      if (Array.isArray(o.material)) o.material[i] = clone; else o.material = clone;
      mats.push(clone);
      const spots = lensSpots(o, i); for (const p of spots) points.push(p.applyMatrix4(o.matrixWorld));
    });
  });
  return { mats, points };
}
// The left and right ends of the lens geometry, so a halo can sit on each one.
function lensSpots(mesh, materialIndex) {
  const T = THREE, g = mesh.geometry, pos = g.attributes.position, idx = g.index;
  const groups = (g.groups || []).filter(gr => gr.materialIndex === materialIndex);
  const ranges = groups.length ? groups : [{ start: 0, count: idx ? idx.count : pos.count }];
  const box = new T.Box3();
  const v = new T.Vector3();
  for (const gr of ranges) for (let i = gr.start; i < gr.start + gr.count; i++) {
    const k = idx ? idx.getX(i) : i;
    box.expandByPoint(v.set(pos.getX(k), pos.getY(k), pos.getZ(k)));
  }
  if (box.isEmpty()) return [];
  const c = box.getCenter(new T.Vector3()), w = box.max.x - box.min.x;
  // one halo per end if the lenses run across the roof, otherwise a single one in the middle
  return w > 0.25 ? [new T.Vector3(box.min.x + w * 0.22, c.y, c.z), new T.Vector3(box.max.x - w * 0.22, c.y, c.z)]
    : [c.clone()];
}
// Fallback for a car with no model of its own: a white bar with two blue lamps on it.
function lightBar(roof = 1.5) {
  const T = THREE, g = new T.Group();
  const bar = new T.Mesh(new T.BoxGeometry(1.1, 0.1, 0.3), new T.MeshLambertMaterial({ color: 0xe8ecf1 }));
  bar.position.y = roof + 0.06; g.add(bar);
  const mats = [-0.34, 0.34].map(x => {
    const lamp = new T.Mesh(new T.SphereGeometry(0.17, 12, 10), new T.MeshBasicMaterial({ color: LAMP.dim }));
    lamp.position.set(x, roof + 0.17, 0); g.add(lamp); return lamp.material;
  });
  g.userData.lamps = mats;
  return { group: g, mats, points: [new T.Vector3(-0.34, roof + 0.17, 0), new T.Vector3(0.34, roof + 0.17, 0)] };
}

export function createEmergencyEvent({ net, traffic, test, player, ui, scene = null, body = null, trigger = EMERGENCY.trigger }) {
  const events = [], record = (type, data = {}) => events.push({ type, at: traffic.clock, ...data });
  let phase = 'idle', car = null, shell = null, bar = null, flash = 0, cameAt = 0, passedAt = null;
  let lights = null; // { mats, halos } — whatever is doing the flashing on this car
  let slowed = false, pulledIn = false, followFor = 0, bannerUntil = 0, badStop = false, faulted = false, everNear = false, movingWhenNear = false, blockingFor = 0;

  const route = () => test.route;
  // the learner's offset towards the nearside kerb, and the width of the road they are on
  function kerbSide() {
    const nr = test.ctx; if (!nr) return null;
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th), along = fx * nr.tx + fz * nr.tz;
    const way = nr.way, lane = way.oneway ? 1 : (Math.sign(along) || 1);
    return { offL: nr.lat * lane, width: way.w };
  }
  // held up by something in front: the learner had no say in where they came to rest
  function blockedAhead() {
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th);
    return traffic.cars.concat(traffic.bikes || []).some(o => {
      if (!o.alive || o === car || Math.abs(o.v) > 0.6) return false;
      const dx = o.x - player.x, dz = o.z - player.z, fwd = dx * fx + dz * fz;
      return fwd > 0 && fwd < 11 && Math.abs(dx * fz - dz * fx) < 2.6;
    });
  }
  // Stopping on a crossing, or inside the junction itself, blocks the vehicle you are trying to help.
  // The junction box is the node and half the width of the widest road meeting there: waiting at the
  // give-way line a few metres short of it is an ordinary stop, not a stop in the way.
  function stoppedInTheWay() {
    for (const z of net.zebras) if (Math.hypot(z.x - player.x, z.z - player.z) < z.w / 2 + 4) return true;
    for (const f of net.fillets) {
      const nx = f.nx ?? f.C[0], nz = f.nz ?? f.C[1];
      if (Math.hypot(nx - player.x, nz - player.z) < f.w / 2 + 2) return true;
    }
    return false;
  }
  // the step the given route distance falls in
  function stepAt(s) {
    const R = route(); let k = 0;
    while (k < R.steps.length - 1 && R.stepS[k + 1] <= s) k++;
    return { k, step: R.steps[k], into: s - R.stepS[k] };
  }
  function buildShell() {
    const T = THREE, group = new T.Group();
    let roof = 1.4, found = { mats: [], points: [] };
    const police = body ? body() : null;
    if (police) { group.add(police); roof = new T.Box3().setFromObject(police).max.y; found = modelLamps(group); }
    // The model has no blue lenses of its own (or there is no model at all): bolt a bar on instead.
    if (!found.mats.length) { const fb = lightBar(roof); bar = fb.group; group.add(bar); found = fb; }
    let tex = null; try { tex = haloTexture(); } catch (_) { /* headless: the lenses still flash */ }
    const halos = tex ? found.points.map(p => { const h = makeHalo(tex); h.position.copy(p); group.add(h); return h; }) : [];
    lights = { mats: found.mats, halos };
    return group;
  }
  // The police car follows the traffic agent, and the agent's own body is hidden while it does.
  function attachShell() {
    try {
      shell = buildShell();
      if (scene) { scene.add(shell); car.mesh.visible = false; }
      else { car.mesh.add(bar); shell = null; } // no scene to add to: just light up the car that is there
    } catch (_) { shell = null; bar = null; } // headless, or no 3D context
  }
  function detach() {
    try {
      if (shell) { shell.parent?.remove(shell); }
      else if (bar) car.mesh.remove(bar);
      if (bar) bar.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    } catch (_) { /* nothing to tidy */ }
    if (car) { car.emergency = false; if (car.mesh) car.mesh.visible = true; }
    shell = null; bar = null; lights = null;
  }

  const S = { events, get phase() { return phase; }, get vehicle() { return car; }, get shell() { return shell; } };

  S.update = (dt, clock = traffic.clock) => {
    if (phase === 'done') return;
    if (phase === 'idle') {
      const R = route(); if (!R) return;
      if (test.sRoute < trigger || R.len - test.sRoute < 110 || Math.abs(player.v) < 4) return;
      // the farthest-away pooled car becomes the emergency vehicle
      const pool = traffic.cars.slice().sort((p, q) => Math.hypot(q.x - player.x, q.z - player.z) - Math.hypot(p.x - player.x, p.z - player.z));
      const pick = pool[0]; if (!pick) return;
      // Always from behind: seeing it in the mirrors is the exercise.
      const at = stepAt(Math.max(0, test.sRoute - EMERGENCY.behind));
      traffic.placeCar(pick, at.step.e, at.step.dir, Math.min(at.step.e.len - 2, at.into), 16, EMERGENCY.cruise, R.steps);
      car = pick; car.emergency = true; attachShell();
      phase = 'coming'; cameAt = clock; record('emergency-approach', { x: car.x, z: car.z });
      // Nothing is announced. The lesson card said what to do, and a police car with its lights on is
      // there to be seen in the mirrors or down the road, which is the skill being practised.
      return;
    }
    if (!car) { phase = 'done'; return; }
    car.pinned = Math.max(car.pinned || 0, 8); // it must not be recycled mid-event
    if (shell) { shell.position.set(car.x, 0, car.z); shell.rotation.y = car.th; }
    if (lights) {
      // The lenses pulse together — they are one material on the model — and the halos alternate end
      // to end, which is what gives it the wig-wag of a real bar. Something is lit at every moment,
      // so it never reads as a dark box in a mirror.
      flash += dt;
      const beat = Math.floor(flash * 7), side = beat % 2, bright = beat % 4 !== 3;
      for (const m of lights.mats) {
        m.color.setHex(bright ? LAMP.lens : LAMP.dim);
        if (m.emissive) m.emissive.setHex(bright ? LAMP.glow : 0x000000);
      }
      // the halo keeps a floor on its size, so the light still registers far down the road
      const d = Math.hypot(car.x - player.x, car.z - player.z), k = Math.max(1, Math.min(4.5, d / 14));
      lights.halos.forEach((halo, i) => {
        halo.visible = bright && (lights.halos.length < 2 || i === side);
        if (halo.visible) halo.scale.set(1.4 * k, 1.4 * k, 1);
      });
    }
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th);
    const forward = (car.x - player.x) * fx + (car.z - player.z) * fz;
    const lateral = Math.abs((car.x - player.x) * fz - (car.z - player.z) * fx);
    if (phase === 'coming') {
      // In range at all: close enough that the learner should have seen it in the mirrors and reacted.
      const near = lateral < 12 && forward < -4 && forward > -70;
      // Actually being held up by the learner. Time spent stuck in a queue or at a red light further
      // back is not the learner's doing and must not be counted against them.
      const holding = near && Math.abs(forward) < 30;
      if (near) {
        everNear = true;
        if (holding) followFor += dt;
        if (Math.abs(player.v) <= EMERGENCY.clearSpeed) slowed = true;
        const k = kerbSide();
        if (k && k.offL > k.width / 2 - EMERGENCY.kerbRoom) pulledIn = true;
        // Only a stop the learner chose counts, and only once the vehicle is close enough behind for
        // the stop to be about it. Sitting in a queue at a junction, waiting to emerge while it is
        // still a long way back, or edging over a give-way line on the way through is not "stopping
        // in a junction to let it past": that is sitting there, which takes a few seconds.
        if (Math.abs(player.v) > 1) movingWhenNear = true;
        if (holding && movingWhenNear && Math.abs(player.v) < 0.4 && stoppedInTheWay() && !blockedAhead()) {
          blockingFor += dt;
          if (blockingFor > EMERGENCY.blocking && !badStop) {
            record('emergency-blocking-stop', { x: player.x, z: player.z, forward: Math.round(forward) });
            badStop = true;
          }
        } else if (Math.abs(player.v) > 1) blockingFor = 0;

      }
      const through = forward > 6;
      if (through) {
        phase = 'passing'; passedAt = clock;
        record('emergency-passed', { followFor: Math.round(followFor * 10) / 10, slowed, pulledIn });
        if (!faulted && !slowed && !pulledIn) {
          faulted = true;
          test.fault('D', 'Emergency vehicle', 'An emergency vehicle had to get past without you slowing down or making room', 'emergency-room', Infinity);
        }
        if (badStop) test.fault('D', 'Emergency vehicle – position', 'Stopped on a crossing or in a junction to let the emergency vehicle past', 'emergency-stop', Infinity);
      } else if (followFor > EMERGENCY.follow && !faulted && !slowed && !pulledIn) {
        faulted = true;
        test.fault('D', 'Emergency vehicle', `Held an emergency vehicle up for over ${EMERGENCY.follow} seconds without slowing down or making room`, 'emergency-room', Infinity);
      }
      // It cannot follow for ever: it finds another way, and the drive carries on without a siren
      // behind it for the rest of the route. The second clause covers one that never got close at
      // all, so a drive is never left waiting on it.
      if (followFor > EMERGENCY.giveUp || clock - cameAt > EMERGENCY.abandon) {
        record('emergency-gave-up', { followFor: Math.round(followFor), reached: everNear });
        ui.banner(null); phase = 'done'; if (car) { car.alive = false; car.mesh.visible = false; } detach();
      }
      return;
    }
    if (phase === 'passing' && (Math.abs(forward) > 90 || !car.alive)) { phase = 'done'; detach(); }
  };

  S.result = () => {
    if (phase === 'idle') return { ok: false, why: 'The emergency vehicle never reached you: drive the whole route at a normal speed.' };
    // It never got close enough to be in the learner's way, so there was nothing for them to do.
    if (!everNear) return { ok: false, why: 'The emergency vehicle never reached you on this drive. Try the route again.' };
    if (passedAt === null) return { ok: false, why: 'You did not let the emergency vehicle behind you through. Check your mirrors, slow down and keep over to the left when it is safe.' };
    if (badStop) return { ok: false, why: 'You stopped on a crossing or in a junction. Pull up where you are clear of both.' };
    if (!slowed && !pulledIn) return { ok: false, why: 'The emergency vehicle had to find its own way past you.' };
    return { ok: true, why: pulledIn ? 'You kept over to the left and let the emergency vehicle past.' : 'You slowed down and let the emergency vehicle past.' };
  };

  S.stop = () => { detach(); ui.banner(null); };
  return S;
}
