# Cambridge Learner Drive: tester feedback (13 Oct 2026)

Testers A (course units 1–3) and D (phone UX, visuals, performance) stopped early because of the usage limit, so there are no reports from them.

Full reports from B and C are in the conversation. Their logs and screenshots are under `feedback/B/` and `feedback/C/`.

## To fix (in priority order)

1. **Car top speed is about 38 mph.** In `car.js`, acceleration `3.3*(1-v/27)` balances drag `0.0042*v|v|` at 17 m/s. The 60 and 70 mph lessons can't be driven. Fix: raise acceleration, lower drag.
2. **Progress tracking uses the nearest route point, not the nearest segment** (`test.js` `progress()`).
   - Mitcham's Corner jumps ahead or re-routes falsely, and can be "solved" without driving the gyratory.
   - The mill mock re-routes falsely 3 times.
   - Fix: nearest segment, cap how far progress can jump per tick, and re-apply callouts after a re-route.
3. **Histon Interchange says 1st exit instead of 2nd.** `split_areas.mjs` drops the A14 slip roads. Keep trunk links that touch a roundabout, and compare instruction text in the self-check.
4. **Milton island covers the carriageway.** Islands are drawn as circles (`world.js` ~110–114). Build each island from the ring's inner edge.
5. **Traffic deadlocks.**
   - The dual lesson starts on a roundabout: `ringBusy` plus a stopped player never clears.
   - The ghost logic doesn't bypass the player or the ring, and oncoming cars freeze on narrow roads (`width 2.2`).
   - Move the dual start onto Babraham Road.
6. **The learner is blamed for being hit.**
   - NPCs look only 20 m ahead, so they rear-end the learner at speed.
   - Side-road and mini traffic never gives way.
   - Lane snapping makes NPCs slide sideways.
   - The collision fault in `test.js` doesn't check who hit whom.
7. **False "did not give way" at roundabouts with traffic lights** (`test.js` 82–85). Ignore stationary cars and entries with signals.
8. **Re-routing sends the learner back with no "turn round" instruction.** Forbid an immediate U-turn in `reroute()` / `shortestPath`.
9. **The guide path runs over mini-roundabout centres** (1.4–1.6 m away), causing the "drove over the centre" fault. Route the guide round the disc and move the marker off it.
10. **Puzzle card allowance contradicts focus-fail.** Every puzzle's focus includes Junctions, Positioning and Signals, so 1 fault fails it. Change the card text or the rule.
11. **Scenarios that don't really test the skill.**
    - `cyclist` scenario always returns `ok`: no left-hook check.
    - Dutch roundabout has no outer cycle ring.
    - Fulbourn's yield car never arrives.
    - Signalling at roundabouts is never marked.
12. **Quizzes:** almost every answer is B and the longest option. Shuffle the options and even out their lengths. Show me, tell me has no "show me" items. Q9 in signs: add "in England" (Wales defaults to 20).
13. **Rule citations.**
    - ped-crossing → Rule 199 (puffin).
    - pz-eastroad → Rule 185; the quoted sentence isn't in the Code.
    - pz-milton → Rule 187.
    - Update wording: 163 "up to 30mph", 195 (2022 "waiting" line), 126, 175 ("collision"), cycle-left's second sentence is H3.
14. **Routes don't match their titles.**
    - follow: 72% at 30 mph, and the lead car does about 20 mph.
    - dual: only 39% is dual carriageway.
    - country: starts on 20/40 roads.
    - Mock "pull up" comes 0.9–1.5 km early, and mock waypoints snap 200–670 m off their coordinates.
15. **Result sheet.**
    - Doesn't name non-focus faults.
    - "Puzzle complete" shows even on a fail.
    - "Clean drive" shows with 1 fault.
    - The pull-up banner stays visible under the sheet.
16. **Other items.**
    - Puffin crossing has no pedestrian or markings.
    - No lane markings on signal roundabouts.
    - "Unnamed road" shows on the Four Lamps ring.
    - The 70 tile icon should use the national speed limit sign.
    - Wrong HUD tip on Madingley dual (Rule 143 → 137).
17. **Legal.**
    - Add a visible OGL attribution line. (It was removed with the Info screen for the demo.)
    - The RX-7 model's licence is Sketchfab Standard, Initial D fan art: check whether the raw glTF can be redistributed, or swap in a CC0 car.

## What worked
- Tier unlocking, stars and mock pass/fail rules.
- Exit counts at Dutch, Four Lamps, East Road and Milton.
- The double mini gets a single instruction.
- Mock instruction lists have no turn-rounds or duplicates.
- Scripted events at the zebra, puffin crossing and cyclist work.
- Quiz flow works.
- No console errors.
