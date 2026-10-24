# Motorway worlds and free drive (issue #6)

Recorded with `node tools/record_evidence.mjs motorway` on 2026-10-23: the real application,
stepped at 20 frames a second and captured frame by frame, so each clip plays at true speed. The car is driven by the
same steady driver the browser checks use.

## Three lanes chase and driver

Three lanes each way: central reservation and barrier, hard shoulder, 2 m / 7 m lane lines, traffic keeping to its lanes. Chase view, then the driver's view.

[01-three-lanes-chase-and-driver.mp4](01-three-lanes-chase-and-driver.mp4) · 22 s · 0.5 MB

## Two lanes

The two-lane world: same circuit, narrower carriageways, the cruise held at 70 mph.

[02-two-lanes.mp4](02-two-lanes.mp4) · 14 s · 0.4 MB

## Passing a junction

Passing a junction: the blue junction sign with its number and destination, the broken edge line along the deceleration lane, and the instruction box counting down to the next junction. The car carries on by.

[03-passing-a-junction.mp4](03-passing-a-junction.mp4) · 24 s · 0.6 MB

## Leave at a junction and rejoin

Leaving at a junction instead: off down the slip road, slowing for the roundabout, and a route back onto the circuit built from wherever the car is. Free drive never calls this off-route.

[04-leave-at-a-junction-and-rejoin.mp4](04-leave-at-a-junction-and-rejoin.mp4) · 48 s · 1.5 MB

## Pause resume and end of drive summary

Pause and resume after the lap has rolled over, then End drive: a summary of the session that says plainly nothing was added to the record.

[05-pause-resume-and-end-of-drive-summary.mp4](05-pause-resume-and-end-of-drive-summary.mp4) · 22 s · 0.5 MB

## Memory and frame time

A 14-minute drive right round the circuit, with memory and frame time sampled as it goes: [benchmark.md](benchmark.md).
