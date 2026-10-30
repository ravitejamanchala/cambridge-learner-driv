# Cambridge inspection data

`cambridge.json.gz` contains versioned normalized JSON built from OpenStreetMap data, © OpenStreetMap contributors, under the [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Regional extract by [Geofabrik](https://download.geofabrik.de/europe/united-kingdom/england/cambridgeshire.html). This adapted database is offered under ODbL 1.0; preserve attribution and comply with its database/share-alike requirements when redistributing or publishing adaptations. Individual OSM data contents are available under the Database Contents License.

The adjacent JSON receipt records its compressed checksum and immutable dataset version. The expanded index records the upstream source URL, checksum, date, CRS, complete delivery inventory and individual file checksums. `validation.json` records known defects. Data is **not accepted** and is bundled only into the diagnostic/PR preview build, not production.

To unpack locally and inspect the machine-readable database:

```sh
npm run world:inspector
python3 -m http.server 8000 --directory dist-world-inspector
```

Open `/world-inspector.html`, or read `dist-world-inspector/world-data/cambridge/index.json`. The raw regional PBF URL and reproducible generation steps are in `docs/world-data-pipeline.md`. This bundle contains no Roadarium code, proprietary assets or Google imagery.
