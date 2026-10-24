# Learner Drive

A 3D mock UK driving test in the browser. `README.md` covers what it is and how to run it.

## Read these first

- **[docs/development/ui-guidelines.md](docs/development/ui-guidelines.md)** — house rules for anything
  the learner sees while driving: keep the view clear, say less, one control per manoeuvre, never steer
  the car from the camera, and put the detail in the feedback after the run. Check it before adding a
  panel, a message or a control.
- **[docs/development/reference/](docs/development/reference/)** — screenshots of a commercial UK
  driving simulator, kept as the bar to clear. The interface guidelines say what we took from it and
  where we deliberately differ.
- [docs/screenshots.md](docs/screenshots.md) — one picture per case, regenerated with
  `node tools/screenshots.mjs`.

## Shape of the project

- `js/` is the simulator: `main.js` wires it together, `test.js` is the examiner, `course.js` the
  lessons, `traffic.js` the other road users, `world.js` the scenery.
- `tools/layouts.mjs` draws the practice layouts; `node tools/split_areas.mjs` rebuilds `data/areas`
  after changing routes, lessons, puzzles or layouts. The area files are committed.
- `tests/` holds unit checks (`npm test`) and browser suites that drive the real application.

## Working here

- **Learner Drive is dopamine-driven.** Every feature needs a clear goal, progress you can feel, an
  earned payoff and a reason to go again — and every reward must come from what the drive measured.
  The checklist is at the top of the interface guidelines; run it and record it in each pull request.

- Run the checks listed at the end of the interface guidelines before calling a change done.
- Keep existing lesson IDs stable: learner progress is stored against them.
- Assessment is measured, never flattering. Nothing may turn a fail into a pass after the fact.
