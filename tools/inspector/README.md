# Road Inspector

A map of every road in a generated area, coloured by whether its speed limit was
read from OpenStreetMap or guessed from the road class. Tap a road to see what the
sim knows about it: limit and its provenance, class, lanes, direction, cycle lane
type, carriageway width.

Built to answer one question nobody could answer from the code alone — is the
generated map actually right? Someone who knows the roads can check it in a minute.

Open `index.html` over HTTP (it fetches `cities/`), e.g.

    node ../map-engine/bin/serve.mjs . 8077

`cities/manifest.json` lists the cities. A city is `"status": "ready"` once its
JSON exists; everything else shows in the picker as not built yet. Add a city by
generating its area files with the map engine and dropping the merged JSON in.

Cambridge today: 9,926 road segments, 2,101 of them (21%) on a guessed limit.
