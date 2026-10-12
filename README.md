# Cambridge Learner Drive

A 3D mock UK driving test that runs in the browser on Cambridge's real road network.

Learn with a course of short lessons, then take mock tests on full routes. Each learner gets a profile that tracks which lessons they have passed and their mock test results.

## What's in it

- **Course.** 26 modules in six units, each with a goal, Highway Code rule and its own pass check:
  - *Getting started:* moving off and stopping, speed limits, emergency stop
  - *Junctions and traffic lights:* turning left and right into side roads, traffic lights, stopping at amber, emerging left and right from a side road, turning right at lights
  - *Roundabouts:* mini-roundabout, 1st, 2nd and 3rd exits, a big two-lane roundabout
  - *Sharing the road:* zebra crossings, passing cyclists, pedestrian light crossings, turning left across a cycle lane
  - *Faster roads:* the two-second rule, a 60 mph country road, a 70 mph dual carriageway
  - *Theory and show me, tell me:* quizzes on show me, tell me, road signs, stopping distances and priority. These are unofficial practice questions written for this project, not the DVSA theory test question bank.

## Demo build

For demos the Info screen is removed (its markup is kept in `info-sheet.release.html` for the release version) and the code is shipped as one minified file:

```sh
npm i esbuild
node tools/build_demo.mjs . dist
```

Deploy the `dist` folder.
