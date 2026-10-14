# Theme and home showroom

The approved home composition uses a blue background, a large white car name behind the car, teal progress/lesson cards, pink actions and prize icons, and cream round buttons. The redundant Your car home button and car-selection labels were removed. Getting started remains bottom left; the selected lesson/info card remains above the smaller Start button. All sheets, quizzes, settings, pause and reports share the same colours. Storage keys and real map names retain their existing values so learner progress and routes remain compatible.

The home radio carousel and Settings garage share one asynchronous selection function. Only a successful, current request changes the active vehicle, saved preference, title and selected state. A failed load keeps the previous car and shows a retry message. Arrow keys and Home/End navigate the carousel. Off-screen car choices scroll horizontally on smaller screens.

`js/showroom.js` renders a separate clone of the selected car into a transparent canvas above the title. Its slow rotation never changes the player model or driving camera. Rendering pauses when a sheet is open, the browser tab is hidden, or driving starts. Reduced-motion preferences use a still view and disable entry transitions. The main world renderer skips obscured lobby frames. Packaged `models/car-*.png` images, rendered from the same eight models, serve as carousel thumbnails and as the home fallback if the showroom cannot initialize or loses its context. Images are about 800 KB in total.

Credits is available through Settings and retains OpenStreetMap attribution and licence links. No traffic grading or vehicle physics changes are part of this UI release.
