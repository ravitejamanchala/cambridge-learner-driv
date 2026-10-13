# Cambridge Learner Drive

A 3D mock UK driving test that runs in the browser on Cambridge's real road network.

Learn with a course of short lessons, then take mock tests on full routes. Each learner gets a profile that tracks which lessons they have passed and their mock test results.

## What's in it

- **Course.** 37 modules in six units (including eight new control exercises), each with a goal, Highway Code rule and its own pass check:
  - *Getting started:* moving off and stopping, speed limits, emergency stop
  - *Junctions and traffic lights:* turning left and right into side roads, traffic lights, stopping at amber, emerging left and right from a side road, turning right at lights
  - *Roundabouts:* mini-roundabout, 1st, 2nd and 3rd exits, a big two-lane roundabout
  - *Sharing the road:* zebra crossings, passing cyclists, pedestrian light crossings, turning left across a cycle lane
  - *Faster roads:* the two-second rule, a 60 mph country road, a 70 mph dual carriageway
  - *Theory and show me, tell me:* quizzes on show me, tell me, road signs, stopping distances and priority. These are unofficial practice questions written for this project, not the DVSA theory test question bank.

## Development and checks

```sh
npm ci
npm run dev
```

On your own machine, open `http://localhost:8000`. In cloud onboarding, the server is used for internal checks; this UI does not provide a localhost preview. The project remains on the v1.1 branch.

```sh
npm test
npm run build
npm run test:browser
```

Browser checks require Python and Chromium (set `CHROMIUM_PATH` if needed). They use the exact Three.js version from npm in place of CDN requests. The app itself continues to use the existing CDN assets.

The first development batch adds cockpit preparation, engine start/stop, explicit mirror inputs, controlled stopping and acceleration/deceleration. The second batch adds assessed steering through bends and automatic forward/reverse exercises with a working P/R/N/D selector. Existing lesson IDs and saved learner progress are preserved. See [the audit and roadmap](docs/development/audit-and-roadmap.md) for actual coverage and remaining work towards 80+ lessons and secure AI coaching.

## Demo build

For demos the Info screen is removed (its markup is kept in `info-sheet.release.html` for the release version) and the code is shipped as one minified file:

```sh
npm ci
node tools/build_demo.mjs . dist
```

Deploy the `dist` folder.

## GitHub Pages publication

After reviewing and committing changes on `v1.1`, publish the generated static build with:

```sh
python3 tools/publish_pages.py
```

This runs checks/build, pushes the built assets to `gh-pages`, and uses the existing `gh` authentication to enable branch-based Pages hosting. It does not switch your source checkout or overwrite `main`. Publishing requires Git push and GitHub Pages settings permissions; if the latter are unavailable, enable Pages in repository Settings → Pages using `gh-pages` and `/ (root)`. `release.json` identifies the published source commit and lesson count.
