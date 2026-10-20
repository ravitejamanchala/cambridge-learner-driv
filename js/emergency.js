// Blue-light vehicle (Rule 219): a police car arrives with its lights on, either coming up behind the
// learner or towards them on the other side of the road. The learner has to notice it, slow down and
// make room, without breaking the law, mounting the kerb or stopping somewhere that blocks it.
// Used by the blue-light lesson and by every mock test.
// The vehicle still obeys traffic lights here; real crews may treat a red as a give-way, which this
// training build deliberately does not model.
export const EMERGENCY = {
  trigger: 70,       // metres along the route before it appears
  behind: 80,        // metres behind the learner when it comes up from behind
  lead: 150,         // metres ahead when it is coming the other way
  cruise: 1.25,      // it travels a little above the limit
  follow: 20,        // seconds it will sit behind before that counts against you
  giveUp: 45,        // seconds before it finds another way and the drive carries on
  clearSpeed: 3.0,   // m/s (about 7 mph) or below counts as slowing down for it
  kerbRoom: 1.9      // metres from the nearside kerb that counts as having pulled in
};

// Two flashing blue lamps on a roof bar, sized to sit just above the car's roof.
function lightBar(roof = 1.5) {
  const T = THREE, g = new T.Group();
  const bar = new T.Mesh(new T.BoxGeometry(1.1, 0.1, 0.3), new T.MeshLambertMaterial({ color: 0xe8ecf1 }));
  bar.position.y = roof + 0.06; g.add(bar);
  const lamps = [-0.34, 0.34].map(x => {
    const lamp = new T.Mesh(new T.SphereGeometry(0.14, 10, 8), new T.MeshBasicMaterial({ color: 0x0a1a66 }));
    lamp.position.set(x, roof + 0.15, 0); g.add(lamp); return lamp;
  });
  g.userData.lamps = lamps;
  return g;
}

export function createEmergencyEvent({ net, traffic, test, player, ui, scene = null, body = null, trigger = EMERGENCY.trigger, side = null }) {
  const events = [], record = (type, data = {}) => events.push({ type, at: traffic.clock, ...data });
  let phase = 'idle', car = null, shell = null, bar = null, flash = 0, cameAt = 0, passedAt = null, from = side;
  let slowed = false, pulledIn = false, followFor = 0, bannerUntil = 0, badStop = false, faulted = false;

  const route = () => test.route;
  // the learner's offset towards the nearside kerb, and the width of the road they are on
  function kerbSide() {
    const nr = test.ctx; if (!nr) return null;
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th), along = fx * nr.tx + fz * nr.tz;
    const way = nr.way, lane = way.oneway ? 1 : (Math.sign(along) || 1);
    return { offL: nr.lat * lane, width: way.w };
  }
  // stopping on a crossing or inside a junction blocks the vehicle you are trying to help
  function stoppedInTheWay() {
    for (const z of net.zebras) if (Math.hypot(z.x - player.x, z.z - player.z) < z.w / 2 + 4) return true;
    for (const f of net.fillets) if (Math.hypot(f.C[0] - player.x, f.C[1] - player.z) < f.R + f.w) return true;
    return false;
  }
  // the step the given route distance falls in
  function stepAt(s) {
    const R = route(); let k = 0;
    while (k < R.steps.length - 1 && R.stepS[k + 1] <= s) k++;
    return { k, step: R.steps[k], into: s - R.stepS[k] };
  }
  // Which way it comes from. An oncoming vehicle needs a two-way road ahead to come down, so where the
  // route has none the event falls back to coming up behind. The choice is taken from the route itself
  // rather than at random, so a drive replays the same way.
  function chooseSide() {
    if (from) return from;
    const R = route(), at = stepAt(Math.min(R.len - 20, test.sRoute + EMERGENCY.lead));
    const twoWay = at.step && !at.step.e.way.oneway && !at.step.e.way.rb && at.step.e.len > 40;
    return twoWay && Math.round(R.len) % 2 === 0 ? 'oncoming' : 'behind';
  }

  function buildShell() {
    const T = THREE, group = new T.Group();
    let roof = 1.4;
    const police = body ? body() : null;
    if (police) { group.add(police); roof = new T.Box3().setFromObject(police).max.y; }
    bar = lightBar(roof); group.add(bar);
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
    shell = null; bar = null;
  }

  const S = { events, get phase() { return phase; }, get vehicle() { return car; }, get side() { return from; }, get shell() { return shell; } };

  S.update = (dt, clock = traffic.clock) => {
    if (phase === 'done') return;
    if (phase === 'idle') {
      const R = route(); if (!R) return;
      if (test.sRoute < trigger || R.len - test.sRoute < 110 || Math.abs(player.v) < 4) return;
      // the farthest-away pooled car becomes the emergency vehicle
      const pool = traffic.cars.slice().sort((p, q) => Math.hypot(q.x - player.x, q.z - player.z) - Math.hypot(p.x - player.x, p.z - player.z));
      const pick = pool[0]; if (!pick) return;
      from = chooseSide();
      if (from === 'oncoming') {
        // placed down the road, facing the learner, finding its own way towards them
        const at = stepAt(Math.min(R.len - 20, test.sRoute + EMERGENCY.lead));
        traffic.placeCar(pick, at.step.e, -at.step.dir, Math.max(1, at.step.e.len - at.into), 12, EMERGENCY.cruise, null);
      } else {
        const at = stepAt(Math.max(0, test.sRoute - EMERGENCY.behind));
        traffic.placeCar(pick, at.step.e, at.step.dir, Math.min(at.step.e.len - 2, at.into), 12, EMERGENCY.cruise, R.steps);
      }
      car = pick; car.emergency = true; attachShell();
      phase = 'coming'; cameAt = clock; record('emergency-approach', { side: from, x: car.x, z: car.z });
      ui.banner(from === 'oncoming' ? 'Blue lights coming towards you. Slow down and keep well to the left.' : 'Blue lights behind you. Check your mirrors.', 'info');
      bannerUntil = clock + 5;
      return;
    }
    if (!car) { phase = 'done'; return; }
    car.pinned = Math.max(car.pinned || 0, 8); // it must not be recycled mid-event
    if (shell) { shell.position.set(car.x, 0, car.z); shell.rotation.y = car.th; }
    if (bar) { // flash the lamps alternately
      flash += dt;
      const on = Math.floor(flash * 4) % 2;
      bar.userData.lamps.forEach((lamp, i) => lamp.material.color.setHex(i === on ? 0x3b6bff : 0x0a1a66));
    }
    const fx = -Math.sin(player.th), fz = -Math.cos(player.th);
    const forward = (car.x - player.x) * fx + (car.z - player.z) * fz;
    const lateral = Math.abs((car.x - player.x) * fz - (car.z - player.z) * fx);
    const oncoming = from === 'oncoming';
    if (phase === 'coming') {
      // in range: behind and closing, or ahead and closing
      const near = lateral < 12 && (oncoming ? forward > 4 && forward < 70 : forward < -4 && forward > -70);
      if (near) {
        followFor += dt;
        if (Math.abs(player.v) <= EMERGENCY.clearSpeed) slowed = true;
        const k = kerbSide();
        if (k && k.offL > k.width / 2 - EMERGENCY.kerbRoom) pulledIn = true;
        if (Math.abs(player.v) < 0.4 && stoppedInTheWay()) badStop = true;
        if (clock > bannerUntil && followFor > 2.5 && !slowed && !pulledIn) {
          ui.banner('Let it through: slow down and keep over to the left where it is safe.', 'warn'); bannerUntil = clock + 4;
        }
      }
      const through = oncoming ? forward < -6 : forward > 6;
      if (through) {
        phase = 'passing'; passedAt = clock;
        record('emergency-passed', { side: from, followFor: Math.round(followFor * 10) / 10, slowed, pulledIn });
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
      // It cannot follow for ever: it finds another way, and the drive carries on without a siren
      // behind it for the rest of the route.
      if (followFor > EMERGENCY.giveUp) {
        record('emergency-gave-up', { side: from, followFor: Math.round(followFor) });
        ui.banner(null); phase = 'done'; if (car) { car.alive = false; car.mesh.visible = false; } detach();
      }
      return;
    }
    if (phase === 'passing' && (Math.abs(forward) > 90 || !car.alive)) { phase = 'done'; detach(); }
  };

  S.result = () => {
    const where = from === 'oncoming' ? 'coming the other way' : 'behind you';
    if (phase === 'idle') return { ok: false, why: 'The emergency vehicle never reached you: drive the whole route at a normal speed.' };
    if (passedAt === null) return { ok: false, why: `You did not let the emergency vehicle ${where} through. Slow down and keep over to the left when it is safe.` };
    if (badStop) return { ok: false, why: 'You stopped on a crossing or in a junction. Pull up where you are clear of both.' };
    if (!slowed && !pulledIn) return { ok: false, why: 'The emergency vehicle had to find its own way past you.' };
    return { ok: true, why: pulledIn ? 'You kept over to the left and let the emergency vehicle past.' : 'You slowed down and let the emergency vehicle past.' };
  };

  S.stop = () => { detach(); ui.banner(null); };
  return S;
}
