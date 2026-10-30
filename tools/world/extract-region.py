"""Intersect a complete regional PBF with the city buffer, retaining dependencies.
This is a source-data build tool, never a runtime browser request.
"""

import argparse, hashlib, json, pathlib, datetime
import osmium
import shapely
from shapely.geometry import Point, LineString, Polygon, box, mapping
from shapely.ops import transform

parser = argparse.ArgumentParser()
parser.add_argument("pbf")
parser.add_argument("config")
parser.add_argument("projection")
parser.add_argument("output")
parser.add_argument("--boundary", type=int, required=True)
args = parser.parse_args()
pbf = pathlib.Path(args.pbf)
out = pathlib.Path(args.output)
out.mkdir(parents=True, exist_ok=True)
config = json.load(open(args.config))
p = json.load(open(args.projection))
factory = osmium.geom.WKBFactory()


def project(x, y, z=None):
    return ((x - p["origin"][1]) * p["kx"], -(y - p["origin"][0]) * p["kz"])


def raw(o, kind):
    d = {
        "type": kind,
        "id": o.id,
        "version": o.version,
        "timestamp": o.timestamp.isoformat().replace("+00:00", "Z"),
        "tags": dict(o.tags),
    }
    if kind == "node":
        d.update(lon=o.location.lon, lat=o.location.lat)
    elif kind == "way":
        d["nodes"] = [n.ref for n in o.nodes]
    else:
        d["members"] = [
            {
                "type": {"n": "node", "w": "way", "r": "relation"}[m.type],
                "ref": m.ref,
                "role": m.role,
            }
            for m in o.members
        ]
    return d


relations = {}


class Relations(osmium.SimpleHandler):
    def relation(self, o):
        relations[o.id] = raw(o, "relation")


Relations().apply_file(str(pbf))
if args.boundary not in relations:
    raise ValueError("Boundary relation absent from regional snapshot")


def supported_area(tags):
    return any(
        k in tags
        for k in [
            "building",
            "building:part",
            "landuse",
            "leisure",
            "natural",
            "waterway",
            "highway",
            "railway",
            "barrier",
            "amenity",
        ]
    )


boundary = None
for obj in osmium.FileProcessor(str(pbf)).with_areas():
    if obj.is_area() and not obj.from_way() and obj.orig_id() == args.boundary:
        boundary = shapely.from_wkb(factory.create_multipolygon(obj))
        break
if boundary is None or not boundary.is_valid:
    raise ValueError("Boundary geometry is unavailable or invalid")
world_boundary = transform(project, boundary)
# Conservative circumscribed buffer; JS manifest rebuild uses its recorded 64-gon method.
# 2 m selection safety allowance covers that approximation; retained dependencies may
# extend beyond the declared extent and are reported by the normalizer.
selection = world_boundary.buffer(config["bufferMetres"] + 2, quad_segs=32)
selection_box = box(*selection.bounds)
selected_nodes = set()
selected_ways = set()
selected_relations = {args.boundary}
ways = {}
relation_areas = {}
errors = []
stats = {"regionNodes": 0, "regionWays": 0, "regionRelations": len(relations)}


def intersects(geometry):
    world = transform(project, geometry)
    if not selection_box.intersects(box(*world.bounds)):
        return False
    if not world.is_valid:
        return True  # Preserve invalid candidates for explicit downstream rejection.
    return selection.intersects(world)


print("Selecting source features against city boundary + buffer", flush=True)
for obj in osmium.FileProcessor(str(pbf)).with_areas():
    if obj.is_node():
        stats["regionNodes"] += 1
        if obj.tags and selection.covers(
            Point(*project(obj.location.lon, obj.location.lat))
        ):
            selected_nodes.add(obj.id)
    elif obj.is_way():
        stats["regionWays"] += 1
        try:
            coords = [(n.lon, n.lat) for n in obj.nodes]
            if len(coords) < 2:
                continue
            lon0, lat0, lon1, lat1 = LineString(coords).bounds
            a = project(lon0, lat1)
            b = project(lon1, lat0)
            if not selection_box.intersects(box(a[0], a[1], b[0], b[1])):
                continue
            # Closed ways may contain the whole selection without an interior vertex.
            geometry = (
                Polygon(coords)
                if len(coords) >= 4 and coords[0] == coords[-1]
                else LineString(coords)
            )
            if intersects(geometry):
                selected_ways.add(obj.id)
                ways[obj.id] = raw(obj, "way")
        except Exception as e:
            errors.append({"id": "way/" + str(obj.id), "reason": str(e)})
    elif obj.is_area() and not obj.from_way():
        tags = dict(obj.tags)
        if obj.orig_id() != args.boundary and not supported_area(tags):
            continue
        try:
            geometry = shapely.from_wkb(factory.create_multipolygon(obj))
            if intersects(geometry):
                selected_relations.add(obj.orig_id())
                if geometry.is_valid:
                    relation_areas["relation/" + str(obj.orig_id())] = {
                        "engine": "libosmium / osmium 4.2.0",
                        "sourceVersion": relations[obj.orig_id()]["version"],
                        "geometry": mapping(geometry),
                    }
        except Exception as e:
            errors.append({"id": "relation/" + str(obj.orig_id()), "reason": str(e)})
# Preserve local turn restrictions, including via-way sequences. Unsupported
# route/site relations are accounted for in the selection report, not expanded
# into an unrelated nationwide relation tree.
unsupported = []
for rid, r in relations.items():
    touches = any(
        (m["type"] == "node" and m["ref"] in selected_nodes)
        or (m["type"] == "way" and m["ref"] in selected_ways)
        for m in r["members"]
    )
    if not touches:
        continue
    if r["tags"].get("type") == "restriction":
        selected_relations.add(rid)
    elif r["tags"].get("type") in ["multipolygon", "boundary"] and (
        supported_area(r["tags"]) or rid == args.boundary
    ):
        selected_relations.add(rid)
    elif rid not in selected_relations:
        unsupported.append(
            {
                "id": "relation/" + str(rid),
                "tags": r["tags"],
                "status": "unsupported relation category; retained in original PBF",
            }
        )
outside_errors = []
# Locate failed area assembly using all source member coordinates before declaring
# it outside the city. A missing/overlapping envelope remains a critical issue.
error_relations = {
    int(e["id"].split("/")[1]) for e in errors if e["id"].startswith("relation/")
}
error_way_owners = {}
for rid in error_relations:
    for member in relations.get(rid, {}).get("members", []):
        if member["type"] == "way":
            error_way_owners.setdefault(member["ref"], []).append(rid)
error_bounds = {}
if error_way_owners:
    for obj in osmium.FileProcessor(str(pbf)).with_locations():
        if not obj.is_way() or obj.id not in error_way_owners:
            continue
        points = [project(n.lon, n.lat) for n in obj.nodes]
        for rid in error_way_owners[obj.id]:
            error_bounds.setdefault(rid, []).extend(points)
for error in errors:
    if not error["id"].startswith("relation/"):
        continue
    points = error_bounds.get(int(error["id"].split("/")[1]), [])
    if points:
        envelope = box(
            min(p[0] for p in points),
            min(p[1] for p in points),
            max(p[0] for p in points),
            max(p[1] for p in points),
        )
        if not selection_box.intersects(envelope):
            outside_errors.append(
                {
                    **error,
                    "bounds": list(envelope.bounds),
                    "reason": error["reason"]
                    + "; source member envelope is outside the city buffer",
                }
            )
errors = [
    e for e in errors if not any(outside["id"] == e["id"] for outside in outside_errors)
]
queue = list(selected_relations)
missing = []
while queue:
    rid = queue.pop()
    r = relations.get(rid)
    if r is None:
        missing.append("relation/" + str(rid))
        continue
    for m in r["members"]:
        if m["type"] == "way":
            selected_ways.add(m["ref"])
        elif m["type"] == "node":
            selected_nodes.add(m["ref"])
        elif m["ref"] not in selected_relations:
            selected_relations.add(m["ref"])
            queue.append(m["ref"])


class Ways(osmium.SimpleHandler):
    def way(self, o):
        if o.id in selected_ways and o.id not in ways:
            ways[o.id] = raw(o, "way")


Ways().apply_file(str(pbf))
for w in ways.values():
    selected_nodes.update(w["nodes"])
nodes = {}


class Nodes(osmium.SimpleHandler):
    def node(self, o):
        if o.id in selected_nodes:
            nodes[o.id] = raw(o, "node")


Nodes().apply_file(str(pbf))
missing.extend("node/" + str(n) for n in selected_nodes - nodes.keys())
missing.extend("way/" + str(w) for w in selected_ways - ways.keys())
reader = osmium.io.Reader(str(pbf))
header = reader.header()
snapshot = header.get("osmosis_replication_timestamp")
reader.close()
elements = (
    list(nodes.values())
    + list(ways.values())
    + [relations[r] for r in sorted(selected_relations) if r in relations]
)
source = {
    "version": 0.6,
    "generator": "SlayDrive regional extract adapter",
    "osm3s": {"timestamp_osm_base": snapshot},
    "elements": elements,
    "relationAreas": relation_areas,
}
(out / "regional.json").write_text(json.dumps(source, separators=(",", ":")) + "\n")
report = {
    "schemaVersion": 1,
    "pbf": pbf.name,
    "pbfSha256": hashlib.sha256(pbf.read_bytes()).hexdigest(),
    "pbfBytes": pbf.stat().st_size,
    "snapshot": snapshot,
    "boundary": "relation/" + str(args.boundary),
    "boundaryVersion": relations[args.boundary]["version"],
    "boundaryGeographicGeometry": mapping(boundary),
    "projection": p,
    "bufferMetres": config["bufferMetres"],
    "selectionSafetyMetres": 2,
    "counts": {
        **stats,
        "selectedNodes": len(nodes),
        "selectedWays": len(ways),
        "selectedRelations": len(selected_relations),
    },
    "missingDependencies": missing,
    "selectionErrors": errors,
    "outsideSelectionAreaErrors": outside_errors,
    "unsupportedRelations": unsupported,
    "selectionMethod": "Exact geometry intersection, including closed ways/multipolygons containing the extent; complete downward dependencies; no node-only bbox assumption",
    "sourceLicense": "ODbL-1.0",
    "attribution": "© OpenStreetMap contributors; regional extract by Geofabrik",
}
(out / "selection.json").write_text(json.dumps(report, indent=2) + "\n")
print(
    json.dumps(
        {
            k: report[k]
            for k in ["snapshot", "counts", "missingDependencies", "selectionErrors"]
        }
    ),
    flush=True,
)
