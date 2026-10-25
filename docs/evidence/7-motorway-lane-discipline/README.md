# Motorway lane discipline, overtaking and following (issue #7)

Recorded with `node tools/record_evidence.mjs lanes` on 2026-10-24: the real application,
stepped at 20 frames a second and captured frame by frame, so each clip plays at true speed unless it says otherwise.
The careful drives use the Bot lab's reference driver (`js/bots.js`, the one `npm run test:bots` checks every lesson with); the careless one uses the scriptable driver from `npm run test:motorway`.

## Overtake and move back

Keep left, overtake, move back (three lanes). Once the faster car in the middle lane has gone by, catching a slower vehicle: right mirror and a look over the shoulder, signal, out into a clear lane, past, and back to the left once the vehicle passed is more than two seconds behind. The lane strip by the instruction box shows the lanes that are right for you (amber) and the one you are in (marked underneath).

[01-overtake-and-move-back.mp4](01-overtake-and-move-back.mp4) · 45 s · 1.7 MB

## Waiting for a safe gap

Overtaking when the next lane is busy (two lanes). A lorry ahead and a stream of faster cars passing on the right: the driver drops back to two seconds behind the lorry and waits, then goes once the stream has passed and the next car is far enough back that nobody has to brake.

[02-waiting-for-a-safe-gap.mp4](02-waiting-for-a-safe-gap.mp4) · 52 s · 1.9 MB

## Following as traffic slows

Following distance at 70. The traffic in every lane slows from 60 to about 42 mph and speeds up again; the driver stays at least two seconds behind the car ahead the whole way and does not dive into the next lane, which is moving no faster.

[03-following-as-traffic-slows.mp4](03-following-as-traffic-slows.mp4) · 45 s · 1.5 MB

## Across three lanes for an exit

Getting into lane for your exit. From the right-hand lane with traffic in the other two: one lane at a time, settling in each, easing off to drop into a gap rather than forcing one, in the left-hand lane well before the 300-yard point, then off along the slip road. The instruction box counts down to J2 · Ashwell.

[04-across-three-lanes-for-an-exit.mp4](04-across-three-lanes-for-an-exit.mp4) · 40 s (80 s of driving at 2× speed) · 1.9 MB

## Careless pull out and what it is marked for

The careless version of clip 2: straight out without a mirror check or a signal, just as the first of the faster cars arrives. Then the result, with every fault named for what it was, and the lane change itemised in the feedback.

[05-careless-pull-out-and-what-it-is-marked-for.mp4](05-careless-pull-out-and-what-it-is-marked-for.mp4) · 20 s · 0.5 MB

## Feedback after a careful run

The result after the careful run of clip 1: passed, nothing marked, and the feedback itemises each lane change with what was checked first and the gap it was made into, how long was spent out of the left-hand lane and why.

[06-feedback-after-a-careful-run.mp4](06-feedback-after-a-careful-run.mp4) · 8 s · 0.0 MB
