# Mobile and desktop controls

The new lesson controls now use the existing cream surfaces, display typography,
lavender selected states, pink action buttons, rounded corners and shadows.
Scenario selection uses the same form styling and is omitted for lessons with
only one scenario.

Parking shows the three relevant selector positions, one existing look-round
action, and the parking brake or engine action when required. Preparation
acknowledgements appear one step at a time in the dedicated cockpit and engine lessons. The separate
mirror inputs stay in the mirror lesson. Manual parking assessment appears only
after the car is secured; valid manoeuvres still complete automatically.

Touch buttons fit narrow portrait screens without overlapping; landscape lesson
controls sit above the steering group, leaving the centre driving view clear. Mobile parking fault feedback
sits above the controls. Touch input is available on hybrid touch devices too.
Switching tabs, losing focus or pausing clears held inputs.

Validation: 32 unit tests, browser lesson/progress regression, parking physics and
assessment regression, and a device browser test at 320×568, 390×844, 844×390,
768×1024 and 1440×900. Device checks use Chromium touch input for simultaneous
steering/pedal input and keyboard events for desktop, inspect target size and
overlap, and verify focus-loss release. Local asset substitution in these tests
does not validate the public CDN. Physical iOS/Android testing remains useful.
