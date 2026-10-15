import { LESSONS, UNITS } from './course.js';
// Keep old lesson records and assessment handlers, but hide these exercises from the learner menu.
export const HIDDEN_LESSON_IDS = new Set(['cockpit-drill','engine-control','automatic-drive','automatic-reverse','steering-control','forward-bay','reverse-bay','leave-bay']);
export const VISIBLE_LESSONS = LESSONS.filter(l=>!HIDDEN_LESSON_IDS.has(l.id));
export const VISIBLE_UNITS = UNITS.filter(u=>VISIBLE_LESSONS.some(l=>l.unit===u.id));
