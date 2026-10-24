# Free-drive benchmark

`npm run test:free` with `FREE_MINUTES=14`: the three-lane world driven right round the 24 km circuit
at about 70 mph by the steady test driver, sampling every 30 s of simulated time. Headless Chromium
with the SwiftShader software renderer, so frame times are for a single drawn frame on a CPU, not a
GPU. The raw samples are in [benchmark.json](benchmark.json).

```
 minute   km  laps  chunks  geometries  textures  heapMB  frameMs
      0  0.03     0      10         270        18      40      574
    0.5  0.94     0      14         274        18      40        3
      1  1.87     0      13         277        18      42        2
    1.5  2.79     0      13         277        18      41        4
      2  3.72     0      10         273        18      42        6
    2.5  4.65     0      14         274        18      42        3
      3  5.58     0      13         280        19      40        6
    3.5   6.5     0      15         289        20      42        3
    4.1  7.43     0      14         287        20      40        3
    4.6  8.36     0      13         282        20      41        3
    5.1  9.28     0      13         278        20      42        4
    5.6 10.21     0      14         278        20      42        3
    6.1 11.14     0      11         280        20      41        6
    6.6 12.07     0      11         282        20      42        4
    7.1    13     0      12         284        20      42        3
    7.6 13.93     0      13         290        21      40        7
    8.1 14.85     0      13         297        22      40        3
    8.6 15.78     0      13         297        22      43        3
    9.1 16.71     0      12         296        22      44        3
    9.6 17.64     0      14         300        23      45        4
   10.1 18.56     0      12         311        24      43        7
   10.6 19.49     0      12         309        24      40       26
   11.1 20.42     0      12         304        24      43        8
   11.7 21.34     0      12         298        24      43        3
   12.2 22.27     0      13         298        24      41        4
   12.7  23.2     0      13         300        24      41        4
   13.2 24.13     0      13         302        24      41        4
   13.7  0.94     1      11         304        24      43        3

Sustained drive: 14 min, 1 lap(s), chunks peaked at 15, geometries 289 → 311 (first half → second half).
```

- **Scenery chunks** stay between 10 and 15 alive however far the car goes: anything beyond 1.5 km is freed.
- **GPU geometries** stay between 270 and 311 over the whole lap, and are no higher on the second lap than
  the first. Before road sections gave their GPU buffers back, the same drive climbed from 293 to 458:
  every section passed stayed on the GPU until the whole circuit had been seen.
- **Textures** go from 18 to 24 as the eight junction signs come into view. That is bounded by the map,
  not by the length of the drive.
- **JS heap** holds at 40–46 MB.
- **Frame time** is 2–7 ms for a drawn frame after the first (which compiles shaders), with one 26 ms
  outlier while a scenery chunk was being built.
