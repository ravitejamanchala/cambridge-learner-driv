# Refined map renderer

The separate 1 km tile tool has been removed. Its geometry and markings now power the existing **My routes** flow; there is no second editor, mode selector or tile-preview shortcut.

1. Open **My routes** and search for a place.
2. Place start A and finish B, then choose **Generate route**.
3. Choose **Save & drive**, or use **Drive** on an existing saved route.

The simulator retains its UI, building assets, car physics, live traffic and local route storage. Built-in course and mock worlds retain their rendering. Personal drives share continuous road buffers, pavement subtraction, corrected approaches and source/inferred markings, split into nearby rendering chunks. The full route is prepared before driving, without a 1 km clipping boundary or provider requests while driving.

Saved entries are local recipes with a bounded source cache; evicted source data may need to be fetched again before driving. Untagged widths, heights and markings are estimates. Exact yellow boxes, road text and parking bays appear only where the base source provides them. The prototype-only supplementary marking endpoint and its failed live import check were removed along with the tool. Existing live search/routing/base-map checks remain enabled.

The shared geometry modules and internal synthetic renderer harness remain for regression testing. They are not exposed as an app tool or bundled as a separate tile worker. Earlier tile screenshots under `docs/evidence/one-km-tile/` document development comparisons; current route evidence is under `docs/evidence/my-routes-refined/`.

## Run and verify

```sh
npm ci
npm test
node tools/build_demo.mjs . dist-preview --preview
npm run dev:routes -- dist-preview 8000
TEST_SITE=dist-preview node tests/personal-routes-browser.mjs
node tests/tile-markings-browser.mjs
```

Open `http://127.0.0.1:8000/` and choose My routes. Browser interaction tests use deterministic providers and real simulator physics; hosted provider checks run separately in CI.

## CityGen3D manual review

Reviewed the uploaded **CityGen3D v1.20** manual. Page numbers below refer to its printed page numbers.

- **Requirements (p. 3–6):** CityGen3D is a Unity asset requiring Unity 6000.0.66f2 or later and package setup. The manual is documentation, not the asset package. It is not a JavaScript library that can be installed in this simulator. This prototype uses our code and assets; it does not claim to run CityGen3D.
- **Selection and origin (p. 8–11):** a visible map selection establishes the origin; neighbouring tiles retain that origin. Data is fetched with a 100 m margin and complete referenced geometry. Small areas are recommended for iteration. This is the strongest approach to adopt first: one visible tile with an explicit boundary and a separate data buffer.
- **Data versus generator (p. 11–13):** source processing is separate from generating the 3D scene. Our prototype follows that separation with a worker-produced tile and a replaceable renderer.
- **Terrain (p. 14–16):** flat tiles are the starting point. Elevation comes from another dataset, such as NASADEM (~30 m resolution), rather than OSM. Elevation is deferred here.
- **Roads (p. 22–24):** CityGen3D forms non-road blocks and treats intervening terrain as road space; markings are separate. Gap hatching may require manual orientation. This is useful evidence for continuous surfaces, not proof that the tool knows every real lane marking. We reuse our joined road surfaces; we have not recreated its proprietary generator or changed lane rules.
- **Buildings (p. 25–37):** footprints determine shape, with blueprints/prefabs chosen using tags, land use and size. Low-poly batching reduces draw calls. It cannot recover unrecorded facade details merely from an OSM outline. Our first version preserves footprints/holes and batches simple extrusions, with estimated heights identified.
- **Runtime (p. 38–41):** scene streaming and floating-origin management address large worlds. Neither is necessary for this bounded single tile. The stable projection and buffer leave room for adjacent tiles later.
- **Builds (p. 47–48):** the manual describes standalone Unity builds and excluding editor-only components. It does not establish that its editor generation workflow can run inside our existing WebGL app.

**Assessment:** adopt the small-tile workflow now. Evaluate the actual licensed Unity package separately only if an engine migration becomes the goal. A manual alone cannot establish its speed, accuracy or suitability for our mobile browsers.
