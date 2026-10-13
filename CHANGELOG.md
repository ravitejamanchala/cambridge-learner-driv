# Changelog

## v1.0.1 (13 Oct 2026): fixes from tester feedback
- Car can now reach 70 mph (it topped out at 38 mph); about 0–60 in 10 s.
- Examiner progress follows the nearest route segment and can't jump ahead to a parallel road (Mitcham's Corner, Mill Road re-routes).
- Re-routing no longer sends you straight back the way you came, and keeps hand-written instructions (callouts).
- Histon Interchange: A14 slip roads kept, so it's the 2nd exit again; the map splitter now checks instruction text, not just counts.
- Roundabout islands follow the ring's real shape (Milton's oval no longer covers the road).
- Traffic: gives way to you at side roads and minis, looks further ahead at speed, passes oncoming learners on narrow roads, and stand-offs clear.
- Marking:
  - No fault for being hit from behind or while stopped.
  - No false "didn't give way" at roundabouts with traffic lights.
  - Amber is only faulted if you could have stopped.
  - Roundabout signals are now marked.
  - The cycle lane lesson fails a left hook.
- Puzzles fail only for not giving way or running a red; other faults count towards the tier allowance (the card says so).
- Results list every fault; "Clean drive" shows only when there were none; the drive ends at the flag.
- The HUD says "Follow the road ahead" until the pull-up is close, and shows the lesson's own rule at the start.
- Quizzes: options shuffled every attempt; two show me questions added; the England/Wales default limit clarified.
- Highway Code fixes: puffin crossing is Rule 199, Rule 185 for the signal roundabout, Rule 187 for Milton, updated 126/163/195 wording, "collision" not "accident".
- Lesson routes:
  - Roundabout lessons start about 200 m away.
  - The right-at-lights and emerge-left lessons end after the taught junction.
  - Dual carriageway and country road start on the fast sections.
- The lobby stat pills have labels.
- Fixed a crash in map areas with no traffic lights.
- Guide arrows go round mini-roundabout discs.
