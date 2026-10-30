# Google overlay and experimental vision review

PR #25, `feature/roadarium-world-and-assets`. Main/production are unchanged.

## Use the overlay

Open `https://pr-25.learner-drive-app.pages.dev/?bots`, load **Cambridge example** (or your own My routes practice drive), pause the bot if running, then click **Google overlay**. The dialog displays our generated carriageway polygons, source centre lines, generated lane/stop paint, yellow-box/KEEP CLEAR extents, building footprints and mapped parking footprints on the official Google Maps satellite view. Extent outlines are identified as such; KEEP CLEAR letter geometry is not represented by its extent polygon. It does not invent absent markings.

Pan/zoom the Google map; the overlay uses the simulator's geographic projection and follows the map. Use opacity, layer checkboxes and Hide overlay to compare. Click a feature to inspect source tags, width estimates and other evidence. At most 1,500 currently visible overlay features are drawn; zoom in when the counter reports more. Google's attribution remains in its own map container. Our OSM attribution is separate. No Google pixels are read, downloaded, cached, exported or sent to a model.

### Google key configuration

Enable **Maps JavaScript API** and billing in your Google Cloud project. Create a browser key restricted to that API and HTTP referrers such as `https://pr-25.learner-drive-app.pages.dev/*` (add only the other preview origins you intend to use).

For a session, enter that restricted key in the overlay dialog, never in chat. It is not saved in localStorage or exported with map data. For configured previews, add the GitHub **cloudflare environment variable** `GOOGLE_MAPS_BROWSER_KEY` and rerun the PR preview build. It is an intentionally public, restricted browser key in `maps-config.js`, not a backend/service-account secret. Do not put privileged credentials in it. Local builds also accept that environment variable. Without a key, the app and Bot lab still work and the overlay shows setup instructions plus an external Google Maps link.

No Google key was available to this local runtime. GitHub returned HTTP 403 when listing the environment's variable/secret metadata, so remote key presence could not be independently checked. We have not created a Google billing project or changed credentials. Authentication failures are visible; correct configuration and reload the page.

[Google Maps Platform terms](https://cloud.google.com/maps-platform/terms), section 3.2.3(c), prohibit creating content by tracing/digitizing roadways from its satellite map. [Map Tiles API policies](https://developers.google.com/maps/documentation/tile/policies) restrict image analysis/machine interpretation. This integration displays our independent geometry for visual review; it does not provide Google-derived automated map extraction.

## What the Cambridge audit establishes

The existing world inspector now has **Audit every city tile** and **Export audit**. It checks every declared tile using the dataset reader's size/hash verification and deduplicates owner features. CLI equivalent:

```sh
node tools/world/accuracy-audit.mjs PATH_TO_EXPANDED_CITY_DATASET report.json
```

Audit of dataset `52fdf092cb5e518587df60f81ee649591e457ede6b761af903e7ecf17563bef9`:

| Finding | Count |
|---|---:|
| Tiles checked | 102 / 102 |
| Road features | 9,987 |
| Usable width tags | 240 |
| Estimated/unknown widths | 9,747 |
| Independently verified widths | 0 |
| Lane-paint present / absent / unknown tags | 45 / 820 / 9,122 |
| Roads with parking tags | 234 |
| Parking width tags | 0 |
| Normalized road-marking / parking-space features | 0 / 0 |

These are source-coverage counts, not an accuracy score. In the underlying regional raw extract, 48 `amenity=parking_space` elements exist but the current normalized dataset does not classify them: that is an importer gap, not proof that Cambridge has no parking bays. The dataset remains `accepted:false`. Widths, paint, parking layout, source dates, registration and legal lane rules still need independent evidence. No default 2 m parking strip or guessed yellow box was inserted to make the map look complete.

The OpenAerialMap metadata query for bbox `[0.05,52.15,0.22,52.27]` returned zero results on 2026-10-30. This is one provider/area search, not proof that no suitable imagery exists anywhere. Mapillary supplies street-level photographs, not orthophotos; applying the orthophoto transform to a Mapillary photo would be incorrect.

## Vision prototype: proposals, not automatic corrections

`tools/vision/propose.py` runs the Apache-2.0 **CIDAS/clipseg-rd64-refined** model against an independently licensed, north-up orthophoto. The download helper pins revision `999e0328d9e10b484360c477313983f9afdd7050` and verifies the model's published LFS SHA-256. Model weights are not shipped to the web app. The CLI runs locally/server-side on CPU and requires a separate Python environment:

```sh
python3 -m venv /tmp/slaydrive-vision
/tmp/slaydrive-vision/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch==2.5.1
/tmp/slaydrive-vision/bin/pip install -r tools/vision/requirements.txt
python3 tools/vision/download-model.py /tmp/slaydrive-model
/tmp/slaydrive-vision/bin/python tools/vision/propose.py image.png manifest.json --model /tmp/slaydrive-model --output new-proposals.json
```

Example manifest (replace every source/geographic field with actual evidence):

```json
{"source":{"provider":"Your permitted imagery source","license":"Your actual licence","attribution":"Required attribution","capturedAt":"YYYY-MM-DD","allowsDerivedData":true},"crs":"EPSG:4326","northUpOrthophoto":true,"bounds":[0.1,52,0.101,52.001]}
```

Bounds are `[west,south,east,north]`, not route start/finish. The manifest is supplied metadata, not independently validated registration. Oblique street photographs need a calibrated camera/ground transform and are rejected by this workflow. Images are bounded to 4 megapixels; the model works at 352 pixels, so interpolating its mask does not recover small painted details. Output records the image hash, model hash, attribution, raw uncalibrated scores, geographic proposals and limitations. It uses exclusive file creation to preserve earlier runs.

Import the JSON through **Import licensed-image vision proposals** in the overlay. Orange polygons are labelled unverified, and no simulator geometry/learner assessment is changed. This comparison layer can be removed or replaced. The generic model is not trained or validated specifically for UK road markings and does not justify automatic corrections.

### Actual validation evidence

277 JavaScript tests passed; production and preview builds passed. The new browser test covers overlay setup, official-API adapter calls with a test double, geographic coordinates, visibility, opacity, and proposal import. **Real Google imagery was not verified without a configured key.** Existing generated-map driving checks remain included. The inspector browser test covers running/export availability of the tile audit.

Two Python tests validate manifest requirements and mask-to-geographic polygon/hole conversion. Actual CPU model inference ran on an original synthetic road image, producing 17 proposals: 6 road-surface, 4 lane-marking, 3 parking-bay, 2 KEEP CLEAR, 1 yellow-box and 1 arrow. The scene contained no KEEP CLEAR, yellow box or arrow: those four proposals are false positives. This negative evidence is why automatic application remains disabled. The run proves the model integration executes, **not Cambridge accuracy**. A suitable licensed Cambridge reference and a labelled UK evaluation set are still required before setting any automatic correction threshold.
