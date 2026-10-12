# Cambridge Learner Drive

A 3D mock UK driving test that runs in the browser on Cambridge's real road network.

Learn with a course of short lessons, then take mock tests on full routes. Each learner gets a profile that tracks which lessons they have passed and their mock test results.

## What's in it

- **Course.** 13 lessons in four units, each on a real Cambridge road with a goal, Highway Code rule and its own pass check:
  - *Getting started:* moving off and stopping, speed limits (Histon Road 30 → 20), emergency stop
  - *Junctions and traffic lights:* turning left, turning right, traffic lights, stopping at amber (the light is scripted to change as you approach)
  - *Roundabouts:* mini-roundabout, 1st exit (left), 2nd exit (ahead), 3rd exit (right) at the Perne Road roundabout
  - *Sharing the road:* zebra crossings (a pedestrian steps out), passing cyclists (1.5 m rule)
- **Mock tests.** Five full routes marked like the real test: 15 or fewer driving faults and no serious faults is a pass.
- **Learner profiles.** Name-based profiles stored in the browser (`localStorage`). `js/profile.js` is the single place to swap in a backend such as Supabase or Firebase for real accounts.

- **Real roads.** 548 km of Cambridge streets from OpenStreetMap, with real speed limits, traffic lights, zebra crossings, roundabouts, one-way streets and cycle lanes.
- **Five test routes.** Examiner instructions are generated from the road layout ("Get into the left-hand lane. At the roundabout, take the 1st exit onto Chesterton Road."). Going off the route triggers a re-route.
- **UK markings and signs.** Give-way lines and triangles, SLOW, speed-limit roundels and terminal signs, no entry, lane arrows, Belisha beacons.
- **Traffic.** Cars that hold their lane and curve through junctions, cyclists in cycle lanes, pedestrians at zebras, UK light sequence including red-and-amber.
- **Marking.** Speed, positioning, one-way, red/amber lights, roundabout priority, zebras, signalling, lane discipline, cycle lanes, 1.5 m clearance for cyclists, collisions.
- **Views.** Chase, driver's seat and draggable overhead view; heading-up route map you can drag and zoom.

- **Lobby.** A full-screen landscape game lobby: learner level and XP, course progress card, the selected lesson or route, and PLAY. Settings for steering sensitivity, camera and shadows.

Controls: W/↑ accelerate, S/↓ brake (hold to reverse), A/D steer, Q/E indicators, C change view, Esc pause. Touch controls appear on phones (landscape).

## Run locally

It is a static site with ES modules, so serve it over HTTP:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Project layout

| Path | What it does |
| --- | --- |
| `js/course.js` | Units, lessons, scripted events (amber, zebra, cyclist, emergency stop) and pass checks. Add a lesson here. |
| `js/hub.js` | Game-style lobby: learner chip and XP, course, mock test, Highway Code and learner sheets, PLAY |
| `js/profile.js` | Learner profiles and progress (localStorage) |
| `js/config.js` | Routes, car model, handling, traffic numbers, colours. Start here to add a route. |
| `js/net.js` | Road network: lookups, lanes, routing, instruction generation |
| `js/world.js` | Road surfaces, markings, signals, chunk loading, sun and shadows |
| `js/city.js` | Buildings, roofs, awnings, lamps, trees |
| `js/signs.js` | UK road markings and upright signs |
| `js/traffic.js` | Traffic lights, cars, cyclists, pedestrians |
| `js/car.js` | Player car physics and models |
| `js/test.js` | The examiner: progress, re-routing, fault marking |
| `js/ui.js` | HUD, route map, tiles |
| `js/main.js` | Wiring, input, cameras, loop. `window.cambridgeDrive.addInput()` is the hook for a steering wheel |
| `data/cambridge.json` | Road network built from OpenStreetMap |
| `tools/build_net.py` | Rebuilds `data/cambridge.json` from an Overpass Turbo GeoJSON export |
| `tools/restyle_rx7.py` | Repaints the car texture and packs the model |

### Adding a route

Add an entry to `ROUTES` in `js/config.js` with waypoints (`lat`, `lon`, and the road name to snap to). The route and its instructions are built automatically.

### Updating the map

Export roads from [Overpass Turbo](https://overpass-turbo.eu) as GeoJSON, then:

```sh
python3 tools/build_net.py export.geojson data/cambridge.json
```

## Credits and licences

- Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under the [Open Database Licence](https://opendatacommons.org/licenses/odbl/). `data/cambridge.json` is a derived database and is shared under the same licence.
- Learner car based on [RX7 FD](https://sketchfab.com/3d-models/rx7-fd-redsuns-keisuke-takahashi-b76c1a819fd34cd6b139dceb705d2e8e) by [Pudim Abestado](https://sketchfab.com/pudimabestado), Sketchfab Standard licence; repainted with team decals removed.
- Lobby layout and style inspired by a game lobby UI concept by JACK UI.
- Rules paraphrased from The Highway Code (Department for Transport, Crown copyright, Open Government Licence).
- Built with [three.js](https://threejs.org) (MIT). Fonts: Fredoka, Geist and Geist Mono (SIL Open Font Licence).

This is a practice aid, not a substitute for lessons with an approved driving instructor. Highway Code rules are paraphrased.
