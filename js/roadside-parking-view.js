import { rectangleCorners } from './parking-geometry.js';
import { makeBoxCar } from './car.js';
// Draws the roadside parallel-parking exercise into the ordinary town world: the two parked cars, the
// marked space between them, the target the learner is working towards, and the optional guide line.
export function createRoadsideParkingView(scene) {
  const T = THREE;
  // Broken white lines, the way a UK parking bay is marked out on the road.
  const white = new T.LineDashedMaterial({ color: 0xf2f1ea, dashSize: 0.55, gapSize: 0.3 });
  const goalMaterial = new T.LineDashedMaterial({ color: 0xffb21a, dashSize: 0.5, gapSize: 0.28 });
  let props = null, line = null, arrow = null, pathLine = null, targetRef = null, lastPath = null;

  const outline = (rect, material) => {
    const p = rectangleCorners(rect), points = [];
    for (let i = 0; i < 4; i++) points.push(new T.Vector3(p[i].x, 0.05, p[i].z), new T.Vector3(p[(i + 1) % 4].x, 0.05, p[(i + 1) % 4].z));
    const line = new T.LineSegments(new T.BufferGeometry().setFromPoints(points), material);
    line.computeLineDistances(); // dashes need the running length along each segment
    return line;
  };
  const drop = (o) => { if (!o) return; scene.remove(o); o.traverse?.(c => { if (c.isMesh || c.isLine || c.isLineSegments) { c.geometry?.dispose(); } }); };

  function setRoadsideParking(layout, bodies = null) {
    if (props) { drop(props); props = null; }
    if (line) { drop(line); line = null; }
    if (arrow) { scene.remove(arrow); arrow = null; }
    if (pathLine) { drop(pathLine); pathLine = null; }
    targetRef = null; lastPath = null;
    if (!layout) return;
    props = new T.Group();
    props.add(outline(layout.bay, white));
    layout.obstacles.forEach((o, i) => {
      const car = bodies?.(i) || makeBoxCar(o.id === 'parked-front' ? 0x55606a : 0x2f4f6f, false);
      car.position.set(o.x, 0, o.z); car.rotation.y = o.th;
      car.traverse(c => { if (c.isMesh) c.castShadow = true; });
      props.add(car);
    });
    scene.add(props);
    arrow = new T.ArrowHelper(new T.Vector3(0, 0, -1), new T.Vector3(0, 0.15, 0), 1.8, 0xffb21a, 0.45, 0.3);
    scene.add(arrow);
  }

  function setParkingTarget(target, path, grade) {
    if (!props) return;
    if (target !== targetRef) {
      if (line) { props.remove(line); line.geometry.dispose(); }
      line = outline(target, goalMaterial); props.add(line); targetRef = target;
      if (arrow) { arrow.position.set(target.x, 0.15, target.z); arrow.setDirection(new T.Vector3(-Math.sin(target.th), 0, -Math.cos(target.th))); }
    }
    const colour = grade.valid ? 0x2fbf71 : 0xffb21a;
    goalMaterial.color.setHex(colour); arrow?.setColor(colour);
    if (path !== lastPath) {
      if (pathLine) { scene.remove(pathLine); pathLine.geometry.dispose(); pathLine.material.dispose(); }
      pathLine = new T.Line(new T.BufferGeometry().setFromPoints(path.map(p => new T.Vector3(p.x, 0.06, p.z))), new T.LineBasicMaterial({ color: 0x82d9ef, transparent: true, opacity: 0.65 }));
      scene.add(pathLine); lastPath = path;
    }
  }

  const showParkingGuide = (on) => { if (pathLine) pathLine.visible = on; };
  return { setRoadsideParking, setParkingTarget, showParkingGuide };
}
