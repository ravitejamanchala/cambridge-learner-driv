// Tile icons for lessons and puzzles: 40×40 SVG, drawn in the lobby's palette (UK sign blue, red, amber, ink).
const B = '#2563c9', R = '#d2232a', INK = '#3b2416', W = '#fff', A = '#ffb21a', G = '#2fbf71', P = '#ef4f97';
const svg = (body) => `<svg viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;
const blue = (body) => svg(`<circle cx="20" cy="20" r="17" fill="${B}"/>${body}`);
const arrow = (d) => `<path d="${d}" fill="none" stroke="${W}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
const rbArrows = (exit) => blue(`<circle cx="20" cy="20" r="6.5" fill="none" stroke="${W}" stroke-width="2.6"/>` +
  arrow('M20 35v-8') + (exit === 'L' ? arrow('M13.5 20H5M8.5 16.5 5 20l3.5 3.5') : exit === 'A' ? arrow('M20 13.5V5M16.5 8.5 20 5l3.5 3.5') : arrow('M26.5 20H35M31.5 16.5 35 20l-3.5 3.5')));

export const ICONS = {
  car: svg(`<rect x="5" y="17" width="30" height="11" rx="4" fill="${G}"/><path d="M10 17l3.5-6.5h13L30 17z" fill="#8fd9b1"/><circle cx="12" cy="29" r="3.6" fill="${INK}"/><circle cx="28" cy="29" r="3.6" fill="${INK}"/><rect x="17" y="19.5" width="6" height="5.5" rx="1" fill="${W}"/><path d="M19 20.5v3.5h2.6" stroke="${R}" stroke-width="1.6" fill="none"/>`),
  speed: svg(`<circle cx="20" cy="20" r="16" fill="${W}" stroke="${R}" stroke-width="4.5"/><text x="20" y="25.5" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="15" fill="${INK}">20</text>`),
  estop: svg(`<path d="M13 4h14l9 9v14l-9 9H13l-9-9V13z" fill="${R}"/><text x="20" y="24.5" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="11" fill="${W}">STOP</text>`),
  left: blue(arrow('M26 32V21a4 4 0 0 0-4-4H10M15 11.5 9.5 17l5.5 5.5')),
  right: blue(arrow('M14 32V21a4 4 0 0 1 4-4h12M25 11.5l5.5 5.5-5.5 5.5')),
  lights: svg(`<rect x="12" y="3" width="16" height="34" rx="5" fill="${INK}"/><circle cx="20" cy="10.5" r="4" fill="${R}"/><circle cx="20" cy="20" r="4" fill="#5a4a3a"/><circle cx="20" cy="29.5" r="4" fill="${G}"/>`),
  amber: svg(`<rect x="12" y="3" width="16" height="34" rx="5" fill="${INK}"/><circle cx="20" cy="10.5" r="4" fill="#5a4a3a"/><circle cx="20" cy="20" r="4.6" fill="${A}"/><circle cx="20" cy="20" r="7" fill="${A}" opacity=".25"/><circle cx="20" cy="29.5" r="4" fill="#5a4a3a"/>`),
  mini: blue(`<circle cx="20" cy="20" r="9.5" fill="none" stroke="${W}" stroke-width="2.6"/><path d="M20 10.5a9.5 9.5 0 0 1 9.2 7.1M29.5 23a9.5 9.5 0 0 1-12.6 5.9M11.3 24a9.5 9.5 0 0 1 4-12.4" stroke="${W}" stroke-width="2.6" fill="none"/><path d="M28 13.6l1.4 4.3-4.3.6M14.2 30.5l2.8-1.5-1.6-3.8M12.9 14.2l2.4-2.6 2.5 2.8" stroke="${W}" stroke-width="2.4" fill="none" stroke-linejoin="round"/>`),
  mini2: blue(`<circle cx="13.5" cy="20" r="5.5" fill="none" stroke="${W}" stroke-width="2.6"/><circle cx="26.5" cy="20" r="5.5" fill="none" stroke="${W}" stroke-width="2.6"/><circle cx="13.5" cy="20" r="1.6" fill="${W}"/><circle cx="26.5" cy="20" r="1.6" fill="${W}"/>`),
  'rb-left': rbArrows('L'), 'rb-ahead': rbArrows('A'), 'rb-right': rbArrows('R'),
  zebra: svg(`<rect x="3" y="12" width="34" height="16" rx="2" fill="#4a4f55"/>${[0, 1, 2, 3, 4].map(i => `<rect x="${5.5 + i * 6.4}" y="14" width="3.6" height="12" fill="${W}"/>`).join('')}<rect x="4" y="3" width="2.4" height="10" fill="${INK}"/><circle cx="5.2" cy="4.5" r="3.4" fill="${A}"/>`),
  bike: svg(`<circle cx="10.5" cy="25" r="6.5" fill="none" stroke="${INK}" stroke-width="2.6"/><circle cx="29.5" cy="25" r="6.5" fill="none" stroke="${INK}" stroke-width="2.6"/><path d="M10.5 25 17 14h10l2.5 11M17 14l5.5 11h-12M15.5 10.5h4.5M27 14l-1.5-4h3.5" stroke="${P}" stroke-width="2.6" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`),
  dutch: svg(`<circle cx="20" cy="20" r="17" fill="#c9433a"/><circle cx="20" cy="20" r="12" fill="${B}"/><circle cx="20" cy="20" r="5" fill="none" stroke="${W}" stroke-width="2.4"/><circle cx="20" cy="20" r="14.5" fill="none" stroke="${W}" stroke-width="1" stroke-dasharray="2 2"/>`),
  rb5: blue(`<circle cx="20" cy="20" r="6" fill="none" stroke="${W}" stroke-width="2.6"/>${[0, 72, 144, 216, 288].map(a => `<path d="M20 14V4" transform="rotate(${a} 20 20)" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/>`).join('')}`),
  rblights: blue(`<circle cx="16" cy="22" r="6.5" fill="none" stroke="${W}" stroke-width="2.6"/><path d="M16 35v-6.5M16 15.5V8M3 22h6.5" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/><rect x="26" y="7" width="8" height="19" rx="2.5" fill="${INK}"/><circle cx="30" cy="11.5" r="2.2" fill="${R}"/><circle cx="30" cy="16.5" r="2.2" fill="${A}"/><circle cx="30" cy="21.5" r="2.2" fill="${G}"/>`),
  gyratory: blue(`<rect x="11" y="11" width="18" height="18" rx="4" fill="none" stroke="${W}" stroke-width="2.6"/><path d="M24 8l5 3-3 5M16 32l-5-3 3-5" stroke="${W}" stroke-width="2.4" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`),
  interchange: svg(`<circle cx="20" cy="20" r="17" fill="#1f7a46"/><ellipse cx="20" cy="20" rx="11" ry="8.5" fill="none" stroke="${W}" stroke-width="2.6"/><path d="M3 20h34" stroke="${A}" stroke-width="3.2"/><path d="M20 3v8M20 29v8" stroke="${W}" stroke-width="2.6"/>`),
  lock: svg(`<rect x="10" y="18" width="20" height="16" rx="4" fill="${INK}"/><path d="M14 18v-4a6 6 0 0 1 12 0v4" fill="none" stroke="${INK}" stroke-width="3.2"/><circle cx="20" cy="26" r="2.4" fill="${W}"/>`)
};
export const LESSON_ICON = { 'move-off': 'car', speed: 'speed', estop: 'estop', 'turn-left': 'left', 'turn-right': 'right', lights: 'lights', amber: 'amber', mini: 'mini', 'rb-left': 'rb-left', 'rb-ahead': 'rb-ahead', 'rb-right': 'rb-right', zebra: 'zebra', cyclists: 'bike' };
export const STAR = (on) => `<svg viewBox="0 0 20 20" class="${on ? 'on' : ''}"><path d="M10 1.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z"/></svg>`;
