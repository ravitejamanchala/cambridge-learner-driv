// Theory modules: short multiple-choice quizzes. Same shape as a lesson (see course.js) plus `questions`;
// `a` is the index of the right option. Pass mark: `pass` (fraction correct). Wording is paraphrased from
// the DVSA "show me, tell me" questions and The Highway Code (Crown copyright, Open Government Licence).
const Q = (q, options, a, why) => ({ q, options, a, why });

export const QUIZZES = [
  { id: 'q-showme', unit: 'theory', title: 'Show me, tell me', road: 'Quiz · 12 questions', pass: 0.8,
    goal: 'At the start of the test the examiner asks one "tell me" question; during the drive you are asked one "show me" question. Get 10 of 12 right to pass.',
    steps: ['Read every option before you answer', 'Wrong answers show the right one and why', 'Retry as often as you like'],
    rule: { n: 'DVSA', t: 'Getting a show me, tell me question wrong gives you 1 driving fault on the real test.' },
    questions: [
      Q('Tell me how you would check that the brakes are working before starting a journey.', ['Pump the pedal five times with the engine off', 'Brakes should not feel spongy or slack; test them as you set off, and the car should not pull to one side', 'Look at the brake fluid colour', 'Listen for a click when you press the pedal'], 1, 'Test them as you set off: no sponginess, no slack, no pulling to one side.'),
      Q('Where would you find the recommended tyre pressures, and how should they be checked?', ['On the tyre wall; check them after a long drive', 'In the manufacturer’s guide; use a reliable gauge, check when the tyres are cold, include the spare, and refit the valve caps', 'Any garage sign; check by pressing the tyre', 'On the windscreen sticker; check once a year'], 1, 'Manufacturer’s guide, a reliable gauge, cold tyres, spare included, caps back on.'),
      Q('How do you make sure your head restraint is correctly adjusted?', ['Lowest position so it does not block the rear view', 'Rigid part at least as high as your eyes or the top of your ears, and as close to the back of your head as is comfortable', 'Tilted fully forward', 'Level with your shoulders'], 1, 'It protects your neck in a crash, so it must be high and close.'),
      Q('What is the legal minimum tread depth for car tyres?', ['1.0 mm', '1.6 mm across the central three-quarters of the tread, all the way round', '2.0 mm on the outer edges', '3.0 mm anywhere on the tyre'], 1, '1.6 mm across the central three-quarters of the breadth, around the entire circumference. Also check for cuts and bulges.'),
      Q('How would you check that the direction indicators are working?', ['Listen for the ticking only', 'Switch on the hazard warning lights and walk round the car', 'Ask the examiner', 'Look at the dashboard arrows only'], 1, 'Hazard lights flash all the indicators at once, so one walk round checks them all.'),
      Q('How would you check the brake lights are working on this car?', ['You cannot without a second person', 'Press the brake pedal and use reflections in windows, garage doors or a shop window, or ask someone to help', 'Check the fuse box', 'Turn on the headlights'], 1, 'Reflections work on your own; a helper works too.'),
      Q('How would you know if there was a problem with the anti-lock braking system (ABS)?', ['The car pulls to the left', 'A warning light comes on in the dashboard', 'The brake pedal goes hard', 'The horn stops working'], 1, 'If the ABS warning light stays on, get it checked.'),
      Q('When should you use a rear fog light?', ['Whenever it is dark', 'When visibility is seriously reduced, generally to less than 100 metres', 'In heavy traffic', 'When it is raining lightly'], 1, 'Switch it off when visibility improves, or it dazzles drivers behind and hides your brake lights.'),
      Q('How do you know the headlights are on main beam?', ['A green light on the dashboard', 'A blue warning light on the dashboard', 'The indicators flash', 'An orange light'], 1, 'Blue light = main beam. Dip them for oncoming traffic and when following another car.'),
      Q('With the bonnet open, how would you check the engine has enough oil?', ['Look at the oil filler cap', 'Use the dipstick: the oil level should be between the minimum and maximum marks', 'Check the coolant tank', 'Start the engine and watch the smoke'], 1, 'Pull the dipstick, wipe it, push it back in, pull again and read the level.'),
      Q('Show me (while driving) how you would wash and clean the front windscreen.', ['Stop and wipe it with a cloth', 'Use the windscreen washer and wiper control', 'Open the window and lean out', 'Turn on the rear demister'], 1, 'Operate the washer and wipers. Show me questions are asked while you drive, so do it without looking away from the road for long.'),
      Q('Show me (while driving) how you would switch on your dipped headlights.', ['Flash the main beam', 'Operate the light switch to dipped beam and check the dashboard indicator', 'Turn on the hazard lights', 'Switch on the front fog lights'], 1, 'Use the light switch; a green dashboard light shows dipped headlights are on.')
    ] },
  { id: 'q-signs', unit: 'theory', title: 'Road signs', road: 'Quiz · 10 questions', pass: 0.8,
    goal: 'Signs have shapes and colours with meanings. Learn the shapes and most signs read themselves.',
    steps: ['Circles give orders', 'Triangles warn', 'Rectangles inform'],
    rule: { n: 'Know your traffic signs', t: 'Signs giving orders are mostly circular; red rings or circles tell you what you must not do, blue circles tell you what you must do.' },
    questions: [
      Q('What does a circular sign with a red ring usually mean?', ['A warning', 'An order telling you what you must not do', 'Information about a route', 'A tourist attraction'], 1, 'Red circles are prohibitions: speed limits, no entry, no right turn.'),
      Q('What does a blue circular sign mean?', ['Something you must do (a positive instruction)', 'A motorway', 'Parking', 'A warning'], 0, 'Blue circles give mandatory instructions, like "turn left" or "keep left".'),
      Q('What shape are most warning signs?', ['Circle', 'Red-bordered triangle', 'Blue rectangle', 'Octagon'], 1, 'Triangles warn of hazards ahead: bends, crossings, roundabouts.'),
      Q('Which sign is octagonal?', ['Give way', 'STOP', 'No entry', 'Roundabout ahead'], 1, 'The STOP sign is the only octagon so you can recognise it even from behind or covered in snow.'),
      Q('The give-way sign is…', ['A red-bordered triangle pointing down', 'A blue circle', 'A red circle with a white bar', 'A white rectangle'], 0, 'An upside-down triangle; you often see a matching triangle painted on the road.'),
      Q('A red circle with a white horizontal bar means…', ['No stopping', 'No entry for vehicular traffic', 'End of restriction', 'One-way street'], 1, 'You often see it at the exit end of one-way streets.'),
      Q('A white circle with a black diagonal stripe means…', ['No overtaking', 'The national speed limit applies', 'Road closed', 'End of the motorway'], 1, '60 mph on single carriageways and 70 mph on dual carriageways and motorways, for cars.'),
      Q('What is the national speed limit for a car on a single carriageway road?', ['50 mph', '60 mph', '70 mph', '40 mph'], 1, '60 mph for cars and motorcycles on single carriageways.'),
      Q('In England, on a road with street lights and no speed limit signs, the limit is usually…', ['20 mph', '30 mph', '40 mph', '60 mph'], 1, '30 mph in England unless signs say otherwise (in Wales the default is 20 mph). Much of central Cambridge is signed 20.'),
      Q('What colour are signs on primary routes (not motorways)?', ['Blue with white text', 'Green with white and yellow text', 'White with black text', 'Brown'], 1, 'Green for primary routes, blue for motorways, white for local roads, brown for tourist signs.')
    ] },
  { id: 'q-stopping', unit: 'theory', title: 'Stopping distances', road: 'Quiz · 8 questions', pass: 0.75,
    goal: 'Stopping distance = thinking distance + braking distance. The faster you go, the more braking distance grows.',
    steps: ['Thinking distance grows with speed', 'Braking distance grows much faster', 'Double the gaps on wet roads; up to ten times on ice'],
    rule: { n: 'Rule 126', t: 'Typical stopping distances: 12 m at 20 mph, 23 m at 30, 36 m at 40, 53 m at 50, 73 m at 60, 96 m at 70.' },
    questions: [
      Q('What is the typical overall stopping distance at 30 mph?', ['12 metres', '23 metres', '36 metres', '53 metres'], 1, '9 m thinking + 14 m braking = 23 m, about six car lengths.'),
      Q('What is the typical overall stopping distance at 20 mph?', ['6 metres', '12 metres', '23 metres', '18 metres'], 1, '6 m thinking + 6 m braking = 12 m, about three car lengths.'),
      Q('What is the typical overall stopping distance at 70 mph?', ['53 metres', '73 metres', '96 metres', '120 metres'], 2, '21 m thinking + 75 m braking = 96 m, about 24 car lengths.'),
      Q('What is the typical thinking distance at 40 mph?', ['9 metres', '12 metres', '15 metres', '24 metres'], 1, 'At 40 mph thinking distance is about 12 m, braking about 24 m: 36 m in all.'),
      Q('What is the typical overall stopping distance at 60 mph?', ['53 metres', '73 metres', '96 metres', '36 metres'], 1, '18 m thinking + 55 m braking = 73 m.'),
      Q('How much longer can stopping distances be on wet roads?', ['No difference', 'At least double', 'Ten per cent more', 'Half as long'], 1, 'Allow at least double; on ice it can be ten times as far.'),
      Q('What is the minimum gap to the car in front on a fast dry road?', ['One second', 'Two seconds', 'One car length', 'Five metres'], 1, 'Two seconds on dry roads, at least four in the wet.'),
      Q('What increases your thinking distance?', ['Driving more slowly', 'Being tired, distracted or having drunk alcohol', 'New tyres', 'A downhill road'], 1, 'Anything that slows your reactions makes you travel further before you even start braking.')
    ] },
  { id: 'q-priority', unit: 'theory', title: 'Who goes first?', road: 'Quiz · 8 questions', pass: 0.75,
    goal: 'Priority rules at junctions, crossings and roundabouts, including the 2022 Highway Code changes for people walking and cycling.',
    steps: ['The 2022 hierarchy puts those most at risk first', 'Give way does not mean you can stop paying attention', 'Never assume someone will give way to you'],
    rule: { n: 'Rule H1–H3', t: 'Those in charge of vehicles that can cause the greatest harm have the greatest responsibility to reduce the danger they pose to others.' },
    questions: [
      Q('At a junction, a pedestrian is waiting to cross the side road you want to turn into. What should you do?', ['Turn first, you have priority', 'Give way to them', 'Sound your horn', 'Flash your lights to let them cross'], 1, 'Since 2022, you should give way to people crossing or waiting to cross a road you are turning into.'),
      Q('At a roundabout, who normally has priority?', ['Traffic joining from the left', 'Traffic coming from your right', 'The bigger vehicle', 'Whoever arrives first'], 1, 'Give priority to traffic approaching from your right unless signs, markings or lights say otherwise.'),
      Q('You are turning left and a cyclist is going straight on in the cycle lane beside you. What should you do?', ['Turn in front of them quickly', 'Give way and let them go ahead', 'Signal and turn: you signalled first', 'Sound your horn'], 1, 'Do not cut across cyclists going ahead when you turn (Rule H3).'),
      Q('Someone has stepped onto a zebra crossing. What must you do?', ['Carry on if you think you can get past them', 'Give way to them', 'Wave them across', 'Flash your headlights'], 1, 'You must give way once someone has moved onto a zebra crossing.'),
      Q('At a junction with no road markings, who has priority?', ['The car on the bigger road', 'Nobody has priority: take care and be ready to give way', 'Whoever signals first', 'Traffic on the right always'], 1, 'Unmarked junctions give nobody priority. Slow down and look.'),
      Q('What does a flashing amber light at a pelican crossing mean?', ['Stop and wait', 'Give way to pedestrians on the crossing; go if it is clear', 'Speed up before red', 'The lights are broken'], 1, 'Flashing amber: go only if nobody is still crossing.'),
      Q('How much room should you give a cyclist when overtaking at up to 30 mph?', ['50 cm', 'At least 1.5 metres', 'One car width', 'It does not matter if they are in a cycle lane'], 1, 'At least 1.5 m at up to 30 mph, more at higher speeds.'),
      Q('An emergency vehicle with blue lights is behind you at red traffic lights. What should you do?', ['Drive through the red light to clear the way', 'Stay where you are unless you can move safely and legally', 'Brake hard', 'Mount the pavement'], 1, 'Do not break the law (red light, bus lane) to let them past; move only if it is safe and legal.')
    ] }
];
