# Yellow box junctions and KEEP CLEAR (issue #5)

Recorded with `node tools/record_evidence.mjs boxes` on 2026-10-25: the real application,
stepped at 20 frames a second and captured frame by frame, so each clip plays at true speed unless it says otherwise.
The careful drives use the Bot lab's reference driver (`js/bots.js`, the one `npm run test:bots` checks every lesson with), which waits before a box or KEEP CLEAR until there is room beyond it. The careless one uses the scriptable driver from `npm run test:boxes`, which just follows the car in front.

## Waiting at the line for room

Straight on over the yellow box at Station Road, the light green. Traffic is queueing beyond the box, so the driver waits at the line, outside the box, until the queue moves off and there is room for the whole car on the other side, then crosses without stopping.

[01-waiting-at-the-line-for-room.mp4](01-waiting-at-the-line-for-room.mp4) · 24 s · 1.1 MB

## Waiting in the box to turn right

Turning right at the same box with the exit clear: the driver moves forward into the box to the turning point and waits there for the oncoming traffic to pass, which Rule 174 allows, then turns. Nothing is marked.

[02-waiting-in-the-box-to-turn-right.mp4](02-waiting-in-the-box-to-turn-right.mp4) · 20 s · 1.3 MB

## Stopping short of keep clear

High Street, a queue ahead. The driver stops short of the KEEP CLEAR across the mouth of Orchard Way, and a car waiting in Orchard Way turns right into the gap; then the queue moves off.

[03-stopping-short-of-keep-clear.mp4](03-stopping-short-of-keep-clear.mp4) · 22 s · 0.6 MB

## Following the queue into the box

The careless version of clip 1: following the car in front into the box with no room beyond it, and stopping inside, across the junction. Marked at once as a serious fault (Rule 174).

[04-following-the-queue-into-the-box.mp4](04-following-the-queue-into-the-box.mp4) · 22 s · 1.1 MB

## What it is marked for

The result of that drive: not passed, the serious fault named, and the lesson's own feedback saying what went wrong.

[05-what-it-is-marked-for.mp4](05-what-it-is-marked-for.mp4) · 8 s · 0.0 MB
