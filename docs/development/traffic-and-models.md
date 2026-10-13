# Traffic and supplied models

Seven supplied OBJ/MTL cars are converted to embedded GLBs with `python3 tools/convert_cars.py`; source files are retained under models/source but excluded from deployment. The garage loads selections asynchronously, preserves the previous car on failure, supports retry, and stores the selected ID alongside existing preferences. Car dimensions are normalized; handling and assessment remain shared across models.

`tools/convert_humans.py` imports the supplied Humans_Master.fbx using Blender, exports Casual, Casual2, Suit and Worker civilians with Idle/Walk animations, and repairs the imported zero-alpha materials. Example: `blender -b -t 2 --python tools/convert_humans.py -- /path/Humans_Master.fbx`. Runtime skeletons are independent and animate according to crossing state. Primitive pedestrians remain available when assets cannot load.

Traffic now validates the final spawn point, places meshes before showing them, excludes nearby forward respawns, turns around at two-way dead ends, stops vehicle fronts before red lines, and observes earlier junction/cycle priority. Route progress, approach-lane capture and stop-line membership checks were corrected without relaxing fault limits. Bot following uses route geometry and cyclist clearance; replay seeds reset traffic independently per run and are exported with release provenance.

## Validation and remaining defects

Unit checks cover asset structure/opacity, safe spawn positions, stop-line grading, lane capture, physical route progress, cyclist following and deterministic traffic. Browser checks cover selection of all cars, persistence, failed-load recovery, independent animated pedestrians, parking and mobile/desktop controls.

Additional seeded road audits are diagnostic and currently expose unresolved traffic deadlocks and clearance faults. The latest 15 mock runs passed 14, with one Cherry Hinton stall. A 27-run puzzle audit passed 19: Fulbourn stalled once, Dutch roundabout stalled three times, five-arm roundabout stalled three times, and one Mitcham run failed cyclist clearance. These checks are not described as passing and should guide the next traffic batch. The historical uploaded CSVs did not include replay seeds, so their individual trajectories cannot be exactly reproduced.
