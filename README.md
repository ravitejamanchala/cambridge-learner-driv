# Learner Drive

A 3D mock UK driving test that runs in the browser on Cambridge's real road network.

Learn with a course of short lessons, then take mock tests on full routes. Each learner gets a profile that tracks which lessons they have passed and their mock test results.

## What's in it

- **Signing in.** Where the build is configured with an account service, learners sign in before driving and their progress is saved to the account. A build without one (local development, the demo build) still runs as a guest on this device.
- **Course.** 39 modules in seven units (including control exercises), each with a goal, Highway Code rule and its own pass check:
  - *Getting started:* moving off and stopping, speed limits, emergency stop
  - *Junctions and traffic lights:* turning left and right into side roads, traffic lights, stopping at amber, emerging left and right from a side road, turning right at lights
  - *Roundabouts:* mini-roundabout, 1st, 2nd and 3rd exits, a big two-lane roundabout
  - *Sharing the road:* zebra crossings, passing cyclists, pedestrian light crossings, turning left across a cycle lane, letting a blue light vehicle past
  - *Faster roads:* the two-second rule, a 60 mph country road, a 70 mph dual carriageway
  - *Manoeuvres and parking:* parallel parking at the kerb, between two parked cars on a real street
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
npm run test:parking
npm run test:devices
npm run test:cars
npm run test:drive
```

`npm run test:drive` covers the hold-to-look cameras and the blue light vehicle. Browser checks require Python and Chromium (set `CHROMIUM_PATH` if needed). They use the exact Three.js version from npm in place of CDN requests. The app itself continues to use the existing CDN assets.

The first development batch adds cockpit preparation, engine start/stop, explicit mirror inputs, controlled stopping and acceleration/deceleration. The second batch adds assessed steering through bends and automatic forward/reverse exercises with a working P/R/N/D selector. The third batch replaces the earlier closed bay-parking area with assessed parallel parking at the kerb of Elm Road, between two parked cars, reached by driving there along the road. Existing lesson IDs and saved learner progress are preserved; the retired `forward-bay`, `reverse-bay` and `leave-bay` records are simply no longer used. See [the audit and roadmap](docs/development/audit-and-roadmap.md) for actual coverage and remaining work towards 80+ lessons and secure AI coaching.

### Looking around

Hold <kbd>Z</kbd> to look left and <kbd>X</kbd> to look right, in the chase view or the driver view. This swings the camera only: the car carries on where it is pointed, so you can check a roundabout or a junction without steering into it. <kbd>B</kbd> still records an all-round check of the mirrors and blind spot, which is what the examiner marks. On a touch screen the two buttons beside the eye do the same, held down.

## Demo build

The static build ships the application as one minified file. Map attribution is accessible from Settings → Credits:

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

The garage offers eight cars, including seven supplied models, and saves the selected car locally. Street pedestrians use four supplied civilian models with idle/walk animations and a primitive fallback. Traffic spawning checks the actual spawn position and keeps respawns away from the forward view. Bot runs accept and export replay seeds. See [traffic and model validation](docs/development/traffic-and-models.md) for conversion and remaining simulation defects.

The blue, teal and pink interface is shared by the home screen, course, mock tests, puzzles, quizzes, settings, pause and results. Choose a car directly from the home carousel; the showroom turns gently and stops animating when a menu is open, during driving, in a hidden tab, or when reduced motion is enabled. See [theme and showroom notes](docs/development/theme-and-showroom.md).
