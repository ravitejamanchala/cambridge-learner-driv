import {auditCity} from './accuracy-audit.js';
import { Dataset } from "./dataset.js";
import { project, unproject, tileKey } from "./projection.js";
import { inside } from "./geometry.js";
const $ = (id) => document.getElementById(id),
  canvas = $("map"),
  ctx = canvas.getContext("2d");
const colors = {
  road: "#3d535f",
  building: "#ad7961",
  water: "#78bde0",
  ground: "#b1cc9d",
  tree: "#3d8055",
  footway: "#bb9e64",
  cycleway: "#6ba49a",
  boundary: "#8a5ab2",
};
let accuracyReport=null, dataset,
  tile,
  index,
  features = [],
  selected = null,
  epoch = 0,
  center = [0, 0],
  zoom = 1,
  visible = new Set(),
  drag = null,
  width = 0,
  height = 0;
const status = (text) => ($("status").textContent = text);
const screen = (p) => [
  (p[0] - center[0]) * zoom + width / 2,
  (p[1] - center[1]) * zoom + height / 2,
];
function path(points) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const [x, y] = screen(p);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  });
}
function drawGeometry(g, fill) {
  if (g.type === "Point") {
    const [x, y] = screen(g.coordinates);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  if (g.type === "LineString") {
    path(g.coordinates);
    ctx.stroke();
  }
  if (g.type === "MultiPolygon")
    for (const rings of g.coordinates) {
      ctx.beginPath();
      for (const ring of rings) {
        ring.forEach((p, i) => {
          const [x, y] = screen(p);
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.closePath();
      }
      if (fill) ctx.fill("evenodd");
      ctx.stroke();
    }
}
function render() {
  width = canvas.clientWidth;
  height = canvas.clientHeight;
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);
  if (!index) return;
  if ($("boundaries").checked) {
    ctx.lineWidth = 1;
    for (const t of index.tiles) {
      const a = screen([t.bounds[0], t.bounds[1]]);
      ctx.strokeStyle = t.id === tile?.id ? "#df3277" : "#899fa7";
      ctx.strokeRect(a[0], a[1], index.tileSize * zoom, index.tileSize * zoom);
      ctx.fillStyle = "#596f77";
      ctx.font = "11px system-ui";
      ctx.fillText(t.id, a[0] + 5, a[1] + 15);
    }
  }
  for (const f of features) {
    if (!visible.has(f.kind) || f.kind === "boundary") continue;
    ctx.strokeStyle = ctx.fillStyle = colors[f.kind] || "#66756f";
    ctx.lineWidth = f.kind === "road" ? 3 : 1.5;
    drawGeometry(f.geometry, true);
  }
  if ($("sourceBounds").checked) {
    ctx.strokeStyle = "#9b44bb";
    ctx.lineWidth = 2;
    drawGeometry(index.boundary.geometry, false);
  }
  if (selected) {
    ctx.strokeStyle = "#e22572";
    ctx.fillStyle = "#e2257270";
    ctx.lineWidth = 4;
    drawGeometry(selected.geometry, true);
  }
  $("scale").textContent =
    "100 m = " + (100 * zoom).toFixed(0) + " px · north ↑";
}
function fit() {
  if (!tile) return;
  center = [
    (tile.bounds[0] + tile.bounds[2]) / 2,
    (tile.bounds[1] + tile.bounds[3]) / 2,
  ];
  zoom =
    Math.min(canvas.clientWidth, canvas.clientHeight) / (index.tileSize * 1.15);
  render();
}
function select(id) {
  selected = features.find((f) => f.id === id) || null;
  $("featureSelect").value = selected?.id || "";
  $("detail").textContent = selected
    ? JSON.stringify(selected, null, 2)
    : "No feature selected";
  render();
}
async function loadTile(id, focus = null) {
  const token = ++epoch,
    reader = dataset;
  status("Loading tile " + id + "…");
  features = [];
  selected = null;
  render();
  try {
    const loaded = await reader.tile(id);
    if (token !== epoch || reader !== dataset) return;
    tile = loaded;
    const priority = (f) =>
      f.geometry.type === "Point"
        ? 5
        : f.geometry.type === "LineString"
          ? 4
          : f.kind === "building"
            ? 3
            : f.kind === "water"
              ? 2
              : 1;
    features = loaded.features
      .slice()
      .sort((a, b) => priority(a) - priority(b));
    const selectBox = $("featureSelect");
    selectBox.replaceChildren(new Option("Choose a feature", ""));
    features.forEach((f) =>
      selectBox.add(new Option(f.kind + " · " + f.id, f.id)),
    );
    $("tileSelect").value = id;
    fit();
    if (focus) {
      center = focus;
      zoom = 3;
      render();
    }
    status(
      (index.synthetic ? "SYNTHETIC TEST DATA · " : "") +
        id +
        ": " +
        features.length +
        " features · " +
        loaded.status +
        " · geographic review pending",
    );
    $("metrics").textContent =
      reader.requests +
      " file requests · " +
      reader.cache.size +
      " cached files";
    const p = unproject(index.projection, { x: center[0], z: center[1] });
    $("google").href =
      "https://www.google.com/maps/@?api=1&map_action=map&center=" +
      p[1] +
      "%2C" +
      p[0] +
      "&zoom=18&basemap=satellite";
  } catch (e) {
    if (token === epoch) {
      status("Tile failed: " + e.message + ". Select the tile again to retry.");
      tile = null;
      features = [];
      render();
    }
  }
}
async function open() {
  accuracyReport=null;$("accuracyExport").disabled=true;$("accuracySummary").textContent="Not run for this dataset.";
  const token = ++epoch;
  status("Loading city index…");
  index = null;
  tile = null;
  features = [];
  selected = null;
  render();
  try {
    const reader = new Dataset($("datasetUrl").value),
      data = await reader.open();
    if (token !== epoch) return;
    dataset = reader;
    index = data;
    $("cityTitle").textContent = data.name;
    $("gate").textContent = data.accepted
      ? "Accepted dataset"
      : "NOT ACCEPTED · data inspection only";
    $("attribution").textContent = data.attribution;
    const sel = $("tileSelect");
    sel.replaceChildren();
    data.tiles.forEach((t) =>
      sel.add(new Option(t.id + " · " + t.status, t.id)),
    );
    visible = new Set(Object.keys(data.layers));
    $("layers").replaceChildren();
    for (const layer of visible) {
      const label = document.createElement("label"),
        input = document.createElement("input");
      input.type = "checkbox";
      input.checked = true;
      input.onchange = () => {
        input.checked ? visible.add(layer) : visible.delete(layer);
        render();
      };
      label.append(input, layer + " (" + data.layers[layer] + ")");
      $("layers").append(label);
    }
    const report = await reader.read("validation.json");
    if (token !== epoch) return;
    $("validation").textContent = JSON.stringify(report, null, 2);
    const p = project(index.projection, [
        Number($("longitude").value),
        Number($("latitude").value),
      ]),
      key = tileKey(p.x, p.z, index.tileSize);
    await loadTile(
      data.tiles.some((t) => t.id === key) ? key : data.tiles[0].id,
    );
  } catch (e) {
    if (token === epoch) status("Dataset failed: " + e.message);
  }
}
$("datasetForm").onsubmit = (e) => {
  e.preventDefault();
  open();
};
$("tileSelect").onchange = () => loadTile($("tileSelect").value);
$("featureSelect").onchange = () => select($("featureSelect").value);
$("fit").onclick = fit;
$("boundaries").onchange = $("sourceBounds").onchange = render;
$("locationForm").onsubmit = (e) => {
  e.preventDefault();
  try {
    if (!index) throw Error("Open a dataset first");
    const p = project(index.projection, [
        Number($("longitude").value),
        Number($("latitude").value),
      ]),
      key = tileKey(p.x, p.z, index.tileSize);
    if (!index.tiles.some((t) => t.id === key))
      throw Error("Location is outside this dataset");
    loadTile(key, [p.x, p.z]);
  } catch (error) {
    status(error.message);
  }
};
canvas.onpointerdown = (e) => {
  drag = { x: e.clientX, y: e.clientY, center: [...center] };
  canvas.setPointerCapture(e.pointerId);
};
canvas.onpointermove = (e) => {
  if (drag) {
    center = [
      drag.center[0] - (e.clientX - drag.x) / zoom,
      drag.center[1] - (e.clientY - drag.y) / zoom,
    ];
    render();
  }
};
canvas.onpointerup = (e) => {
  if (drag && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) {
    const rect = canvas.getBoundingClientRect(),
      p = [
        (e.clientX - rect.left - width / 2) / zoom + center[0],
        (e.clientY - rect.top - height / 2) / zoom + center[1],
      ],
      distance = (a, b) => {
        const dx = b[0] - a[0],
          dz = b[1] - a[1],
          t = Math.max(
            0,
            Math.min(
              1,
              ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) /
                (dx * dx + dz * dz || 1),
            ),
          );
        return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
      };
    const f = [...features]
      .reverse()
      .find(
        (f) =>
          visible.has(f.kind) &&
          (f.geometry.type === "Point"
            ? Math.hypot(
                p[0] - f.geometry.coordinates[0],
                p[1] - f.geometry.coordinates[1],
              ) <
              8 / zoom
            : f.geometry.type === "LineString"
              ? f.geometry.coordinates.some(
                  (a, i, r) => i && distance(r[i - 1], a) < 6 / zoom,
                )
              : f.geometry.coordinates.some(
                  (r) =>
                    inside(p, r[0]) && !r.slice(1).some((h) => inside(p, h)),
                )),
      );
    select(f?.id);
  }
  drag = null;
};
canvas.onpointercancel = () => (drag = null);
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    zoom = Math.max(0.01, Math.min(10, zoom * Math.exp(-e.deltaY * 0.001)));
    render();
  },
  { passive: false },
);
canvas.onkeydown = (e) => {
  const d = 50 / zoom;
  if (e.key === "ArrowLeft") center[0] -= d;
  else if (e.key === "ArrowRight") center[0] += d;
  else if (e.key === "ArrowUp") center[1] -= d;
  else if (e.key === "ArrowDown") center[1] += d;
  else if (e.key === "+") zoom = Math.min(10, zoom * 1.2);
  else if (e.key === "-") zoom = Math.max(0.01, zoom / 1.2);
  else return;
  e.preventDefault();
  render();
};
new ResizeObserver(render).observe(canvas);
const requested = new URLSearchParams(location.search).get("index");
if (requested) $("datasetUrl").value = requested;
open();

$('accuracyRun').onclick=async()=>{if(!dataset?.index)return;const current=dataset;$('accuracyRun').disabled=true;$('accuracyExport').disabled=true;accuracyReport=null;try{const report=await auditCity(current,(n,total)=>{$('accuracySummary').textContent=`Checking tile ${n}/${total}…`;});if(current!==dataset||index!==current.index)throw Error('Dataset changed; rerun the audit.');accuracyReport=report;$('accuracySummary').textContent=JSON.stringify({coverage:{checked:report.coverage.checkedTiles,expected:report.coverage.expectedTiles},stats:report.stats,mappedDetails:report.mappedDetails,accepted:report.accepted,missingEvidence:report.missingEvidence},null,2);$('accuracyExport').disabled=false;}catch(e){$('accuracySummary').textContent=e.message;}finally{$('accuracyRun').disabled=false;}};
$('accuracyExport').onclick=()=>{if(!accuracyReport)return;const url=URL.createObjectURL(new Blob([JSON.stringify(accuracyReport,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='cambridge-accuracy-audit.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
