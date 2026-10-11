"""Convert an Overpass Turbo GeoJSON export into the compact road-network file the sim loads.

Usage: python3 -I build_net.py export.geojson out.json
Output coordinates are decimetres on a local plane: x = east, z = south, origin at the data centre.
"""
import json, math, sys, collections

SRC, OUT = sys.argv[1], sys.argv[2]
F = json.load(open(SRC))['features']

ROAD = ['trunk','primary','secondary','tertiary','unclassified','residential','living_street',
        'trunk_link','primary_link','secondary_link','tertiary_link']
WIDTH = {'trunk':10,'primary':9,'secondary':8.5,'tertiary':8,'unclassified':6.5,'residential':6.5,
         'living_street':5.5,'trunk_link':6.5,'primary_link':6.5,'secondary_link':6,'tertiary_link':6}
DEFAULT_MPH = {'trunk':60,'trunk_link':40,'living_street':20}

lats = [];lons = []
for f in F:
    g = f['geometry']
    if g['type'] == 'LineString':
        for x, y in g['coordinates']: lons.append(x); lats.append(y)
LAT0 = (min(lats)+max(lats))/2; LON0 = (min(lons)+max(lons))/2
KX = math.cos(math.radians(LAT0))*111320.0; KZ = 110574.0
def proj(lon, lat): return ((lon-LON0)*KX, -(lat-LAT0)*KZ)
def key(c): return (round(c[0],7), round(c[1],7))

def mph(v, cls):
    if not v: return DEFAULT_MPH.get(cls, 30), 1
    v = v.strip().lower()
    if v.endswith('mph'):
        try: return int(float(v[:-3])), 0
        except ValueError: pass
    if 'national' in v: return (70 if cls.startswith('trunk') else 60), 0
    try: return int(round(float(v)/1.609)), 0
    except ValueError: return DEFAULT_MPH.get(cls, 30), 1

# ---- ways ----
names = {'': 0}; nameList = ['']
ways = []; wayCoords = []
for f in F:
    g = f['geometry']; p = f['properties']
    if g['type'] != 'LineString' or p.get('highway') not in ROAD: continue
    coords = [key(c) for c in g['coordinates']]
    if len(coords) < 2: continue
    cls = p['highway']; rb = 1 if p.get('junction') in ('roundabout', 'circular') else 0
    ow = p.get('oneway')
    oneway = 1 if (ow in ('yes', '1', 'true') or (rb and ow != 'no')) else (-1 if ow == '-1' else 0)
    # cycle lanes: 0 none, 1 advisory (dashed), 2 mandatory (solid), 3 separate track
    def cyc(side):
        v = p.get('cycleway:' + side) or p.get('cycleway:both') or p.get('cycleway')
        if v == 'lane':
            kind = p.get('cycleway:%s:lane' % side) or p.get('cycleway:both:lane') or p.get('cycleway:lane')
            return 2 if kind == 'exclusive' else 1
        if v in ('track', 'separate'): return 3
        return 0
    cl, cr = cyc('left'), cyc('right')
    cw = 1.5
    for k in ('cycleway:left:width', 'cycleway:right:width', 'cycleway:both:width', 'cycleway:width'):
        try: cw = max(1.2, min(2.2, float(p[k]))); break
        except (KeyError, ValueError): pass
    if oneway == -1: coords.reverse(); oneway = 1; cl, cr = cr, cl
    lanes = 0
    try: lanes = int(str(p.get('lanes', '0')).split(';')[0])
    except ValueError: pass
    w = WIDTH[cls]
    if rb: w = max(w, 7.5)
    if lanes:
        w = max(w, lanes*3.3) if oneway else (max(w, lanes*3.2) if lanes >= 3 else w)
    if oneway and not lanes and not rb: w = min(w, 6.5)
    nm = p.get('name') or p.get('ref') or ''
    if nm not in names: names[nm] = len(nameList); nameList.append(nm)
    sp, assumed = mph(p.get('maxspeed'), cls)
    if (cl in (1, 2) or cr in (1, 2)) and not lanes: w = max(w, 7 + cw * ((cl in (1, 2)) + (cr in (1, 2))) * 0.6)
    ways.append([names[nm], ROAD.index(cls), sp, assumed, oneway, round(w, 1), rb, lanes, cl, cr, round(cw * 10)])
    wayCoords.append(coords)

# ---- graph vertices: shared nodes, endpoints ----
use = collections.Counter()
for cs in wayCoords:
    for c in set(cs): use[c] += 1
vert = {}; vlist = []
def vid(c):
    if c not in vert: vert[c] = len(vlist); vlist.append(c)
    return vert[c]

def dp(pts, tol):
    if len(pts) < 3: return pts
    keep = [0]*len(pts); keep[0] = keep[-1] = 1; st = [(0, len(pts)-1)]
    while st:
        a, b = st.pop(); ax, az = pts[a]; bx, bz = pts[b]; dx, dz = bx-ax, bz-az; L = math.hypot(dx, dz) or 1e-9
        best, bi = -1, -1
        for i in range(a+1, b):
            d = abs((pts[i][0]-ax)*dz-(pts[i][1]-az)*dx)/L
            if d > best: best, bi = d, i
        if best > tol: keep[bi] = 1; st += [(a, bi), (bi, b)]
    return [p for p, k in zip(pts, keep) if k]

edges = []; coordEdge = {}  # osm coord -> list of (edge, original xz)
for wi, cs in enumerate(wayCoords):
    start = 0
    for i in range(1, len(cs)):
        if i == len(cs)-1 or use[cs[i]] > 1 or cs[i] == cs[start]:
            seg = cs[start:i+1]
            if len(seg) >= 2 and not (len(seg) == 2 and seg[0] == seg[1]):
                ei = len(edges); xz = [proj(*c) for c in seg]
                for c, p in zip(seg, xz): coordEdge.setdefault(c, []).append((ei, p))
                edges.append([vid(seg[0]), vid(seg[-1]), wi, dp(xz, 0.6)])
            start = i

def length(pts): return sum(math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1]) for i in range(len(pts)-1))
def project(pts, p):
    best = (1e18, 0); acc = 0
    for i in range(len(pts)-1):
        ax, az = pts[i]; bx, bz = pts[i+1]; dx, dz = bx-ax, bz-az; L2 = dx*dx+dz*dz or 1e-9
        t = max(0, min(1, ((p[0]-ax)*dx+(p[1]-az)*dz)/L2)); qx, qz = ax+dx*t, az+dz*t
        d = (p[0]-qx)**2+(p[1]-qz)**2
        if d < best[0]: best = (d, acc+t*math.sqrt(L2))
        acc += math.sqrt(L2)
    return best[1]
def bearing_at(pts, s, d):
    """unit travel direction at arc s along edge, for travel dir d"""
    acc = 0
    for i in range(len(pts)-1):
        L = math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
        if acc+L >= s or i == len(pts)-2:
            return ((pts[i+1][0]-pts[i][0])/(L or 1)*d, (pts[i+1][1]-pts[i][1])/(L or 1)*d)
        acc += L

# ---- point features ----
stops = []; zebras = []; giveways = []; minis = []
sigPts = []
def feat_edges(c): return coordEdge.get(key(c), [])
for f in F:
    g = f['geometry']; p = f['properties']
    if g['type'] != 'Point': continue
    hw = p.get('highway'); c = g['coordinates']; on = feat_edges(c)
    if not on: continue
    xz = proj(*key(c))
    if hw == 'traffic_signals' or (hw == 'crossing' and p.get('crossing') in ('traffic_signals', 'controlled')):
        sigPts.append((xz, on, (p.get('traffic_signals:direction') or p.get('direction') or '').lower(), hw))
    elif hw == 'crossing':
        cr = p.get('crossing'); ref = p.get('crossing_ref')
        if ref in ('zebra', 'parallel') or cr in ('zebra', 'marked', 'uncontrolled'):
            ei, _ = on[0]; zebras.append([ei, round(project(edges[ei][3], xz)*10)])
    elif hw in ('give_way', 'stop'):
        d = (p.get('direction') or '').lower()
        for ei, _ in on[:1]:
            pts = edges[ei][3]; s = project(pts, xz); L = length(pts)
            dirs = [1] if d == 'forward' else [-1] if d == 'backward' else ([1] if s > L/2 else [-1])
            for dd in dirs: giveways.append([ei, round(s*10), dd, 1 if hw == 'stop' else 0])
    elif hw == 'mini_roundabout':
        minis.append([round(xz[0]*10), round(xz[1]*10)])

# signals -> stop lines
roadSig = [s for s in sigPts if s[3] == 'traffic_signals']
def near_signal(xz):
    return any(math.hypot(xz[0]-q[0][0], xz[1]-q[0][1]) < 25 for q in roadSig)
vertSet = set(vert.values())
for xz, on, d, hw in sigPts:
    if hw != 'traffic_signals' and near_signal(xz): continue
    c_on_vertex = len(on) > 1
    if c_on_vertex:
        # junction-node signal: a stop line on every approach into the node
        for ei, _ in on:
            a, b, wi, pts = edges[ei]; L = length(pts); ow = ways[wi][4]
            back = min(9, L*0.4)
            vx = pts[0] if math.hypot(pts[0][0]-xz[0], pts[0][1]-xz[1]) < 0.5 else pts[-1]
            atStart = vx is pts[0]
            # approach direction: towards the node
            dd = -1 if atStart else 1
            if ow and dd == -1: continue
            s = back if atStart else L-back
            stops.append([ei, s, dd])
    else:
        ei, _ = on[0]; a, b, wi, pts = edges[ei]; L = length(pts); s = project(pts, xz); ow = ways[wi][4]
        dirs = [1] if d == 'forward' else [-1] if d == 'backward' else ([1] if ow else [1, -1])
        if ow: dirs = [1]
        for dd in dirs:
            stops.append([ei, max(0.5, min(L-0.5, s-1.5*dd)), dd])

# cluster stops for coordinated phases
spos = []
for ei, s, dd in stops:
    pts = edges[ei][3]; acc = 0; P = pts[0]
    for i in range(len(pts)-1):
        L = math.hypot(pts[i+1][0]-pts[i][0], pts[i+1][1]-pts[i][1])
        if acc+L >= s: t = (s-acc)/(L or 1); P = (pts[i][0]+(pts[i+1][0]-pts[i][0])*t, pts[i][1]+(pts[i+1][1]-pts[i][1])*t); break
        acc += L
    spos.append(P)
cl = [-1]*len(stops); nc = 0
for i in range(len(stops)):
    if cl[i] >= 0: continue
    cl[i] = nc; q = [i]
    while q:
        j = q.pop()
        for k in range(len(stops)):
            if cl[k] < 0 and math.hypot(spos[j][0]-spos[k][0], spos[j][1]-spos[k][1]) < 40: cl[k] = nc; q.append(k)
    nc += 1
ref = {}; out_stops = []
for i, (ei, s, dd) in enumerate(stops):
    bx, bz = bearing_at(edges[ei][3], s, dd); ang = math.atan2(bz, bx)
    if cl[i] not in ref: ref[cl[i]] = ang
    diff = abs((ang-ref[cl[i]]+math.pi/2) % math.pi - math.pi/2)
    grp = 0 if diff < math.pi/4 else 1
    out_stops.append([ei, round(s*10), dd, cl[i], grp])

# roundabout islands: connected components of roundabout edges
par = list(range(len(vlist)))
def fnd(x):
    while par[x] != x: par[x] = par[par[x]]; x = par[x]
    return x
for a, b, wi, pts in edges:
    if ways[wi][6]: par[fnd(a)] = fnd(b)
comp = collections.defaultdict(list); compW = collections.defaultdict(list)
for a, b, wi, pts in edges:
    if ways[wi][6]: comp[fnd(a)] += pts; compW[fnd(a)].append(ways[wi][5])
rbs = []
for k, pts in comp.items():
    cx = sum(p[0] for p in pts)/len(pts); cz = sum(p[1] for p in pts)/len(pts)
    r = sum(math.hypot(p[0]-cx, p[1]-cz) for p in pts)/len(pts)
    if r < 3 or r > 120: continue
    w = max(compW[k]); rbs.append([round(cx*10), round(cz*10), round(r*10), round(w*10)])

out = {
    'version': 1, 'source': 'OpenStreetMap contributors (ODbL), via Overpass Turbo export',
    'origin': [LAT0, LON0], 'kx': KX, 'kz': KZ,
    'classes': ROAD, 'names': nameList,
    'ways': ways,
    'nodes': [v for c in vlist for v in (round(proj(*c)[0]*10), round(proj(*c)[1]*10))],
    'edges': [[a, b, wi, [round(v*10) for p in pts for v in p]] for a, b, wi, pts in edges],
    'stops': out_stops, 'zebras': zebras, 'giveways': giveways, 'minis': minis, 'rbs': rbs,
}
json.dump(out, open(OUT, 'w'), separators=(',', ':'))
print('ways', len(ways), 'nodes', len(vlist), 'edges', len(edges), 'stops', len(out_stops), 'clusters', nc,
      'zebras', len(zebras), 'giveways', len(giveways), 'minis', len(minis), 'rbs', len(rbs))
print('origin', LAT0, LON0, 'total km', round(sum(length(e[3]) for e in edges)/1000, 1))
