# Editor import fixtures

`editor-route.json` is a synthetic straight-road editor export produced with the admin's native OSM converter, used for isolated browser tests.

`admin-cambridge-route.json` is an actual browser download from SlayDriveAdmin's route builder, generated from its frozen Cambridge OSM test data and driving-route fixture. It deliberately preserves the old descriptive `road` labels (`Route start`, `Route checkpoint`, `Route destination`) to exercise compatibility with previously exported files. It contains no learner records. Road/building data is © OpenStreetMap contributors, licensed under ODbL: https://www.openstreetmap.org/copyright. The test route covers about 95 metres, 16 original road segments and 25 building footprints. The full unchanged envelope is used to verify import, native road anchoring, scene rendering, spawn and JSON round trips.
