"""Original synthetic PBF: a crossing road has no nodes inside the city buffer."""

import json, pathlib, subprocess, tempfile, unittest
import osmium


class RegionalSelectionTest(unittest.TestCase):
    def test_crossing_containing_and_dependencies(self):
        with tempfile.TemporaryDirectory() as folder:
            root = pathlib.Path(folder)
            config = {"origin": [52.205, 0.119], "bufferMetres": 10}
            (root / "config.json").write_text(json.dumps(config))
            projection = json.loads(
                subprocess.check_output(
                    [
                        "node",
                        "--input-type=module",
                        "-e",
                        "import {projection} from './js/world-data/projection.js';console.log(JSON.stringify(projection([52.205,.119])))",
                    ]
                )
            )
            (root / "projection.json").write_text(json.dumps(projection))
            header = osmium.io.Header()
            header.set("osmosis_replication_timestamp", "2026-01-01T00:00:00Z")
            writer = osmium.SimpleWriter(str(root / "fixture.osm.pbf"), header=header)
            metadata = {"version": 1, "timestamp": "2026-01-01T00:00:00Z"}
            points = {
                1: (-50, -50),
                2: (50, -50),
                3: (50, 50),
                4: (-50, 50),
                5: (-500, 0),
                6: (500, 0),
                7: (-700, 700),
                8: (700, 700),
                9: (-400, -400),
                10: (400, -400),
                11: (400, 400),
                12: (-400, 400),
                13: (0, 0),
            }
            for id, (x, z) in points.items():
                location = (
                    projection["origin"][1] + x / projection["kx"],
                    projection["origin"][0] - z / projection["kz"],
                )
                writer.add_node(
                    osmium.osm.mutable.Node(id=id, location=location, **metadata)
                )
            for id, nodes, tags in [
                (1, [1, 2, 3, 4, 1], {}),
                (2, [5, 6], {"highway": "residential"}),
                (3, [7, 8], {"highway": "service"}),
                (4, [9, 10, 11, 12, 9], {"landuse": "grass"}),
            ]:
                writer.add_way(
                    osmium.osm.mutable.Way(id=id, nodes=nodes, tags=tags, **metadata)
                )
            writer.add_relation(
                osmium.osm.mutable.Relation(
                    id=100,
                    members=[("w", 1, "outer")],
                    tags={
                        "type": "boundary",
                        "boundary": "administrative",
                        "admin_level": "8",
                    },
                    **metadata
                )
            )
            writer.add_relation(
                osmium.osm.mutable.Relation(
                    id=101,
                    members=[("w", 2, "from"), ("n", 13, "via"), ("w", 3, "to")],
                    tags={"type": "restriction", "restriction": "no_left_turn"},
                    **metadata
                )
            )
            writer.close()
            subprocess.run(
                [
                    "python3",
                    "tools/world/extract-region.py",
                    str(root / "fixture.osm.pbf"),
                    str(root / "config.json"),
                    str(root / "projection.json"),
                    str(root / "out"),
                    "--boundary",
                    "100",
                ],
                check=True,
                capture_output=True,
            )
            report = json.loads((root / "out/selection.json").read_text())
            data = json.loads((root / "out/regional.json").read_text())
            self.assertEqual(report["missingDependencies"], [])
            self.assertEqual(report["selectionErrors"], [])
            ids = {(e["type"], e["id"]) for e in data["elements"]}
            self.assertIn(("way", 2), ids, "crossing without interior vertices")
            self.assertIn(("way", 4), ids, "polygon containing entire city")
            self.assertIn(("way", 3), ids, "restriction dependency outside city")
            self.assertIn(("node", 7), ids, "complete downward dependency")
            self.assertIn("relation/100", data["relationAreas"])


if __name__ == "__main__":
    unittest.main()
