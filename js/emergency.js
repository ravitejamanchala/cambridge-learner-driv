// Blue-light vehicle (Rule 219): an emergency vehicle comes up behind the learner with its lights on.
// The learner has to notice it, slow down and make room on the left, without breaking the law, mounting
// the kerb or stopping somewhere that blocks it. Used by the blue-light lesson and by every mock test.
// The vehicle still obeys traffic lights here; real crews may treat a red as a give-way, which this
// training build deliberately does not model.
export const EMERGENCY = {
  trigger: 70,       // metres along the route before it appears
  behind: 80,        // metres behind the learner when it is placed
  cruise: 1.25,      // it travels a little above the limit
  follow: 20,        // seconds it will sit behind before that counts against you
  clearSpeed: 3.0,   // m/s (about 7 mph) or below counts as slowing down for it
  kerbRoom: 1.9      // metres from the nearside kerb that counts as having pulled in
};

// Two flashing blue lamps on a roof bar. Built lazily so this module can be imported without a 3D context.
function lightBar() {
  const T = THREE, g = new T.Group();
  const bar = new T.Mesh(new T.BoxGeometry(1.1, 0.1, 0.3), new T.MeshLambertMaterial({ color: 0xe8ecf1 }));
  bar.position.y = 1.5; g.add(bar);
  const lamps = [-0.34, 0.34].map(x => {
    const lamp = new T.Mesh(new T.SphereGeometry(0.14, 10, 8), new T.MeshBasicMaterial({ color: 0x0a1a66 }));
    lamp.position.set(x, 1.59, 0); g.add(lamp); return lamp;
  });
  g.userData.lamps = lamps;
  return g;
}

export function createEmergencyEvent({ net, traffic, test, player, ui, trigger = EMERGENCY.trigger }) {
  const events = [], record = (type, data = {}) => events.push({ type, at: traffic.clock, ...data });
  let phase = 'idle', car = null, bar = null, flash = 0, cameAt = 0, passedAt = null;
  let slowed = false, pulledIn = false, followFor = 0, bannerUntil = 0, badStop = false, faulted = false;

  const route = () => test.route;
  // the learner's offset towards the nearside kerb, and the width of the road they are on
  function kerbSide() {
    const nr = test.ctx; if (!nr) return null;
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th), along = fx * nr.tx + fz * nr.tz;
    const way = nr.way, side = way.oneway ? 1 : (Math.sign(along) || 1);
    return { offL: nr.lat * side, width: way.w };
  }
  // stopping on a crossing or inside a junction blocks the vehicle you are trying to help
  function stoppedInTheWay() {
    for (const z of net.zebras) if (Math.hypot(z.x - player.x, z.z - player.z) < z.w / 2 + 4) return true;
    for (const f of net.fillets) if (Math.hypot(f.C[0] - player.x, f.C[1] - player.z) < f.R + f.w) return true;
    return false;
  }
  function detach() {
    if (car && bar) { car.mesh.remove(bar); bar.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
    if (car) car.emergency = false;
    bar = null;
  }

  const S = { events, get phase() { return phase; }, get vehicle() { return car; } };

  S.update = (dt, clock = traffic.clock) => {
    if (phase === 'done') return;
    if (phase === 'idle') {
      const R = route(); if (!R) return;
      const left = R.len - test.sRoute;
      if (test.sRoute < trigger || left < 110 || Math.abs(player.v) < 4) return;
      // the farthest-away pooled car becomes the emergency vehicle, placed back along the route
      const pool = traffic.cars.slice().sort((p, q) => Math.hypot(q.x - player.x, q.z - player.z) - Math.hypot(p.x - player.x, p.z - player.z));
      const pick = pool[0]; if (!pick) return;
      let s = Math.max(0, test.sRoute - EMERGENCY.behind), k = 0;
      while (k < R.steps.length - 1 && R.stepS[k + 1] <= s) k++;
      const st = R.steps[k];
      traffic.placeCar(pick, st.e, st.dir, Math.min(st.e.len - 2, s - R.stepS[k]), 12, EMERGENCY.cruise, R.steps);
      car = pick; car.emergency = true;
      try { bar = lightBar(); car.mesh.add(bar); } catch (_) { bar = null; } // headless or no 3D context
      phase = 'coming'; cameAt = clock; record('emergency-approach', { x: car.x, z: car.z });
      ui.banner('Blue lights behind you. Check your mirrors.', 'info'); bannerUntil = clock + 5;
      return;
    }
    if (!car) { phase = 'done'; return; }
    car.pinned = Math.max(car.pinned || 0, 8); // it must not be recycled mid-event
    if (bar) { // flash the lamps alternately
      flash += dt;
      const on = Math.floor(flash * 4) % 2;
      bar.userData.lamps.forEach((lamp, i) => lamp.material.color.setHex(i === on ? 0x3b6bff : 0x0a1a66));
    }
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th);
    const forward = (car.x - player.x) * fx + (car.z - player.z) * fz;
    const lateral = Math.abs((car.x - player.x) * fz - (car.z - player.z) * fx);
    if (phase === 'coming') {
      const near = forward < -4 && forward > -70 && lateral < 9;
      if (near) {
        followFor += dt;
        if (Math.abs(player.v) <= EMERGENCY.clearSpeed) slowed = true;
        const k = kerbSide();
        if (k && k.offL > k.width / 2 - EMERGENCY.kerbRoom) pulledIn = true;
        if (Math.abs(player.v) < 0.4 && stoppedInTheWay()) badStop = true;
        if (clock > bannerUntil && followFor > 2.5 && !slowed && !pulledIn) {
          ui.banner('Let it past: slow down and pull in on the left where it is safe.', 'warn'); bannerUntil = clock + 4;
        }
      }
      if (forward > 6) { // it is through and clear
        phase = 'passing'; passedAt = clock; record('emergency-passed', { followFor: Math.round(followFor * 10) / 10, slowed, pulledIn });
        ui.banner('It is past. Carry on when it is safe.', 'info'); bannerUntil = clock + 4;
        if (!faulted && !slowed && !pulledIn) {
          faulted = true;
          test.fault('D', 'Emergency vehicle', 'An emergency vehicle had to get past without you slowing down or making room', 'emergency-room', Infinity);
        }
        if (badStop) test.fault('D', 'Emergency vehicle – position', 'Stopped on a crossing or in a junction to let the emergency vehicle past', 'emergency-stop', Infinity);
      } else if (followFor > EMERGENCY.follow && !faulted && !slowed && !pulledIn) {
        faulted = true;
        test.fault('D', 'Emergency vehicle', `Held an emergency vehicle up for over ${EMERGENCY.follow} seconds without slowing down or making room`, 'emergency-room', Infinity);
      }
      return;
    }
    if (phase === 'passing' && (forward > 90 || !car.alive)) { phase = 'done'; detach(); }
  };

  S.result = () => {
    if (phase === 'idle') return { ok: false, why: 'The emergency vehicle never caught up with you: drive the whole route at a normal speed.' };
    if (passedAt === null) return { ok: false, why: 'You did not let the emergency vehicle past. Slow down and pull in on the left when it is safe.' };
    if (badStop) return { ok: false, why: 'You stopped on a crossing or in a junction. Pull in where you are clear of both.' };
    if (!slowed && !pulledIn) return { ok: false, why: 'The emergency vehicle had to find its own way past you.' };
    return { ok: true, why: pulledIn ? 'You pulled in on the left and let the emergency vehicle past.' : 'You slowed down and let the emergency vehicle past.' };
  };

  S.stop = () => { detach(); ui.banner(null); };
  return S;
}
