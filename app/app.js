/* countcal — implementation of the Claude Design prototype (Calorie Home.dc.html).
   Layout and colour come from the prototype verbatim; this file supplies the state the
   prototype faked with props and a seeded hash, backed by real logged entries. */

'use strict';

// ── constants carried over from the prototype ────────────────────────────────
const MEALS_CFG = {
  '7D':  { n: 7,  step: 1,  dot: 31, dg: 2, cg: 10 },
  '30D': { n: 30, step: 1,  dot: 9,  dg: 1, cg: 4 },
  '90D': { n: 30, step: 3,  dot: 9,  dg: 1, cg: 4 },
  '1Y':  { n: 12, step: 30, dot: 11, dg: 2, cg: 7 }
};

const STATS_RANGES = {
  '7D':  { n: 7,  step: 1, gap: 10,  w: '26px',  cap: '13px 13px 0 0' },
  '30D': { n: 30, step: 1, gap: 4,   w: '100%',  cap: '4px 4px 0 0' },
  '90D': { n: 90, step: 1, gap: 1.5, w: '100%',  cap: '1.5px 1.5px 0 0' },
  '1Y':  { n: 52, step: 7, gap: 2.5, w: '100%',  cap: '2.5px 2.5px 0 0' }
};

const RANGES = ['7D', '30D', '90D', '1Y'];
const ROWS = 6;              // meal dots per column
const GOAL_AT = 0.86;        // goal rule pinned at 86% of chart height in every range

// Both dials are pinned at a fixed point on the band and grow counter-clockwise, so the
// round cap rides the leading edge rather than the tail. At the sweeps the prototype drew
// (180.2deg home, 152deg calculator) every layer lands on its hand-placed position to
// within a fifth of a pixel.
const RING_C = 299.5;         // centre of the 599x599 ring box
const BAND_R = 217.1375;      // centre radius of the ring band
const CAP_R = 82.35;          // half the band width
const CAP_HALF = Math.asin(CAP_R / BAND_R) * 180 / Math.PI;  // arc a cap covers, ~22.3deg
const HOME_ARC_ANCHOR = 48.2;
// Tail cap sits tangent to the vertical centreline at the bottom of the ring: its left
// edge lands on the centre x, rather than the cap straddling 6 o'clock.
const CALC_ARC_ANCHOR = 180 - CAP_HALF;
const CALC_RING_C = { x: 203.5, y: 356.5 };  // ring centre in screen coords on calculator
const SNAP_MARGIN = 5;   // degrees of clearance around type on the band

const SEG_MAP = {
  '0': 'abcdef', '1': 'bc', '2': 'abdeg', '3': 'abcdg', '4': 'bcfg',
  '5': 'acdfg', '6': 'acdefg', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg'
};
const SEG_ON = '#FF0000', SEG_OFF = '#3A0C0A';
const BAR_CLIP = 'polygon(0% 50%,17% 0%,83% 0%,100% 50%,83% 100%,17% 100%)';
const PIP_CLIP = 'polygon(50% 0%,100% 17%,100% 83%,50% 100%,0% 83%,0% 17%)';
const SEG_GEO = {
  a: [5, 0, 24, 7, BAR_CLIP],
  b: [27, 4, 7, 16, PIP_CLIP],
  c: [27, 24, 7, 16, PIP_CLIP],
  d: [5, 37, 24, 7, BAR_CLIP],
  e: [0, 24, 7, 16, PIP_CLIP],
  f: [0, 4, 7, 16, PIP_CLIP],
  g: [5, 18.5, 24, 7, BAR_CLIP]
};

// ── persistent state ─────────────────────────────────────────────────────────
const STORE_KEY = 'countcal.v1';

const store = load();

function load() {
  const empty = { entries: [], goal: 1900 };
  let raw;
  try { raw = localStorage.getItem(STORE_KEY); } catch (e) { return empty; }
  if (!raw) return empty;
  let parsed;
  try { parsed = JSON.parse(raw); } catch (e) { return empty; }
  const entries = Array.isArray(parsed && parsed.entries) ? parsed.entries : [];
  return {
    entries: entries
      .map(e => ({ v: Math.round(Number(e && e.v)), t: Number(e && e.t) }))
      .filter(e => Number.isFinite(e.v) && e.v > 0 && Number.isFinite(e.t))
      .sort((a, b) => a.t - b.t),
    goal: Number.isFinite(parsed && parsed.goal) ? parsed.goal : 1900
  };
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ }
}

// ── ephemeral state ──────────────────────────────────────────────────────────
const ui = {
  screen: 'home',
  day: 0,                    // days back from today that Home is showing
  picker: false,
  calMonth: null,            // first of the month the calendar is showing
  display: '0', pending: null, op: null, fresh: true,
  view: 'calc', selTile: null,
  range: '7D', sel: null, mealSel: null
};

const PICK_SIZE = 123;       // the badge's diameter, reused for every day circle
const PICK_STEP = 92;        // so consecutive circles overlap by 31px
const PICK_VIEW = 491;       // four circles plus the faded fifth
const PICK_DAYS = 6;         // today plus six, a full week of named days

// ── derived data: real entries only ──────────────────────────────────────────
let dayIndex = new Map();

function dayKey(d) { return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }

function reindex() {
  dayIndex = new Map();
  for (const e of store.entries) {
    const d = new Date(e.t);
    const k = dayKey(d);
    let bucket = dayIndex.get(k);
    if (!bucket) { bucket = { cal: 0, times: [] }; dayIndex.set(k, bucket); }
    bucket.cal += e.v;
    bucket.times.push(d.getHours() + d.getMinutes() / 60);
  }
  for (const b of dayIndex.values()) b.times.sort((a, c) => a - c);
}

function dayAt(d) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt; }
function dayData(d) { return dayIndex.get(dayKey(dayAt(d))) || null; }
function dayCal(d) { const b = dayData(d); return b ? b.cal : 0; }
function mealsAt(d) { const b = dayData(d); return b ? Math.min(ROWS, b.times.length) : 0; }
function dayTimes(d) { const b = dayData(d); return b ? b.times.slice(0, ROWS) : []; }

const goal = () => store.goal;
const viewLogged = () => dayCal(ui.day);
const viewEntries = () => {
  const k = dayKey(dayAt(ui.day));
  return store.entries.filter(e => dayKey(new Date(e.t)) === k);
};

/** Days back from today, or null if the date is in the future. */
function daysBack(date) {
  const a = new Date(date); a.setHours(0, 0, 0, 0);
  const b = new Date(); b.setHours(0, 0, 0, 0);
  const n = Math.round((b - a) / 86400000);
  return n < 0 ? null : n;
}

function dayLabel(d) {
  const dt = dayAt(d);
  // A weekday name is unambiguous only inside the week the picker offers; past
  // that - days reached through the calendar - it has to be a date.
  if (d <= PICK_DAYS) return dt.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() + '.';
  return (dt.getMonth() + 1) + '/' + dt.getDate();
}

// Entries land on the day Home is showing, so backfilling a missed meal goes where you
// are looking rather than always onto today.
function logEntry(v) {
  store.entries.push({ v: v, t: dayAt(ui.day).getTime() });
  store.entries.sort((a, b) => a.t - b.t);
  save();
  reindex();
}

function removeEntry(t) {
  const i = store.entries.findIndex(e => e.t === t);
  if (i < 0) return;
  store.entries.splice(i, 1);
  save();
  reindex();
}

// ── helpers ──────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const nf = v => v.toLocaleString('en-US');
const mon = d => dayAt(d).toLocaleDateString('en-US', { month: 'short' }).toLowerCase();

function hhmm(h) {
  const hr = Math.round(clamp(h, 0, 23.4)) % 24;
  return (hr % 12 || 12) + (hr >= 12 ? 'PM' : 'AM');
}

function clock(t) {
  const d = new Date(t);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function el(tag, style, text) {
  const n = document.createElement(tag);
  if (style) n.style.cssText = style;
  if (text != null) n.textContent = text;
  return n;
}

function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

/** Point on the dial band's centre circle at a CSS conic angle (0deg = up, clockwise). */
function bandPoint(deg, radius) {
  const r = (deg * Math.PI) / 180;
  return { x: RING_C + radius * Math.sin(r), y: RING_C - radius * Math.cos(r) };
}

function conicMask(from, sweep) {
  return 'conic-gradient(from ' + from + 'deg,#000 0 ' + sweep +
         'deg,rgba(0,0,0,0) ' + (sweep + 0.7) + 'deg 360deg)';
}

function capMask(pt) {
  return 'radial-gradient(circle ' + CAP_R + 'px at ' + pt.x.toFixed(2) + 'px ' +
         pt.y.toFixed(2) + 'px,#000 99%,rgba(0,0,0,0) 100%)';
}

/** Box of an element in screen coordinates, walking up to the screen root. */
function screenBox(el) {
  let x = 0, y = 0, n = el;
  const stop = $('screen-calc');
  while (n && n !== stop) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return [x, y, x + el.offsetWidth, y + el.offsetHeight];
}

/**
 * One forbidden sweep interval per piece of type on the band: between these the arc edge
 * would cut through it. Kept separate rather than unioned, because the readout and the
 * CALC label sit at different angles and one merged interval would forbid a needlessly
 * wide band. SNAP_MARGIN is the clearance either side, so the edge never merely grazes.
 *
 * Solved per corner, because the leading cap is a circle: how far past the wedge edge it
 * reaches depends on the radius the corner sits at (~22.3deg at the band centre, but only
 * ~18.5deg out at the readout's top corners).
 */
function coverIntervals() {
  return [
    { box: $('calc-pct-ink'), paint: $('calc-pct') },
    { box: $('calc-title'), paint: $('calc-title') }
  ].map(t => {
    const [x0, y0, x1, y1] = screenBox(t.box);
    let enter = Infinity, exit = -Infinity;
    for (const x of [x0, x1]) {
      for (const y of [y0, y1]) {
        const dx = x - CALC_RING_C.x, dy = CALC_RING_C.y - y;
        const r = Math.hypot(dx, dy) || 1;
        const theta = Math.atan2(dx, dy) * 180 / Math.PI;
        const cosd = clamp((r * r + BAND_R * BAND_R - CAP_R * CAP_R) / (2 * r * BAND_R), -1, 1);
        const s = CALC_ARC_ANCHOR - theta - Math.acos(cosd) * 180 / Math.PI;
        enter = Math.min(enter, s);
        exit = Math.max(exit, s);
      }
    }
    return { paint: t.paint, enter: enter - SNAP_MARGIN, exit: exit + SNAP_MARGIN };
  });
}

function placeCap(el, pt) {
  el.style.left = (pt.x - CAP_R).toFixed(2) + 'px';
  el.style.top = (pt.y - CAP_R).toFixed(2) + 'px';
}

// ── stage scaling ────────────────────────────────────────────────────────────
const stage = $('stage');
const backdrop = $('backdrop');
let scale = 1, offsetY = 0;

function layout() {
  const vv = window.visualViewport;
  const vw = Math.round((vv && vv.width) || window.innerWidth);
  const vh = Math.round((vv && vv.height) || window.innerHeight);
  scale = Math.min(vw / 402, vh / 874);
  const ox = (vw - 402 * scale) / 2;
  offsetY = (vh - 874 * scale) / 2;
  stage.style.transform = 'translate(' + ox + 'px,' + offsetY + 'px) scale(' + scale + ')';
  stage.classList.add('ready');
  paintBackdrop();
}

function paintBackdrop() {
  if (ui.screen === 'home') backdrop.style.background = '#FF0000';
  else if (ui.screen === 'calc') backdrop.style.background = '#270E0E';
  else if (ui.screen === 'calendar') backdrop.style.background = '#C0C3B0';
  else {
    // Stats is two-tone: sage above the red meals panel, which starts at y=500.
    const split = offsetY + 500 * scale;
    backdrop.style.background =
      'linear-gradient(to bottom,#C0C3B0 0,#C0C3B0 ' + split + 'px,#FF0000 ' + split + 'px,#FF0000 100%)';
  }
}

// ── routing ──────────────────────────────────────────────────────────────────
function go(screen) {
  // The calculator always opens on the keypad, never on whatever view was left behind.
  if (screen === 'calc') {
    ui.view = 'calc';
    ui.selTile = null;
  }
  if (screen !== 'home') ui.picker = false;
  ui.screen = screen;
  for (const s of ['home', 'calc', 'stats', 'calendar']) {
    $('screen-' + s).classList.toggle('active', s === screen);
  }
  paintBackdrop();
  render();
}

// ══════════════════════════ HOME ══════════════════════════
function renderHome() {
  const g = goal();
  const logged = viewLogged();
  const pct = clamp(logged / g, 0, 1);
  const sweep = pct * 360;

  $('home-left-val').textContent = String(Math.round(g - logged));
  $('home-max').textContent = g + ' cal maximum.';
  $('home-day').textContent = dayLabel(ui.day);
  renderPicker();

  const lead = HOME_ARC_ANCHOR - sweep;
  const on = pct > 0;
  const mask = conicMask(lead, sweep);
  const cap = bandPoint(lead, BAND_R);

  const fill = $('home-arc-fill');
  fill.style.display = on ? 'block' : 'none';
  fill.style.webkitMask = mask;
  fill.style.mask = mask;

  const tail = bandPoint(HOME_ARC_ANCHOR, BAND_R);
  const capEl = $('home-arc-cap');
  capEl.style.display = on ? 'block' : 'none';
  placeCap(capEl, cap);
  $('home-arc-tail').style.display = on ? 'block' : 'none';

  // The bright tick row is clipped to the filled wedge plus a cap at each end.
  const layers = mask + ',' + capMask(cap) + ',' + capMask(tail);
  const clip = $('home-tick-clip');
  clip.style.display = on ? 'block' : 'none';
  clip.style.webkitMaskImage = layers;
  clip.style.maskImage = layers;
  clip.style.webkitMaskComposite = 'source-over,source-over';
  clip.style.maskComposite = 'add,add';
}

const DAY_OPT_STYLE =
  'position:relative;width:' + PICK_SIZE + 'px;height:' + PICK_SIZE + 'px;border-radius:50%;' +
  'box-sizing:border-box;background:#FF0000;border:3px solid #270E0E;color:#270E0E;' +
  'display:flex;align-items:center;justify-content:center;flex:none;' +
  'font:900 21px/1 Archivo,sans-serif;letter-spacing:-.03em;' +
  'margin-bottom:' + (PICK_SIZE - PICK_STEP) * -1 + 'px;';

function renderPicker() {
  const open = ui.picker;
  $('home-picker').style.display = open ? 'block' : 'none';
  $('home-picker-backdrop').style.display = open ? 'block' : 'none';
  $('home-cal-btn').style.display = open ? 'flex' : 'none';
  // The stack's first circle lands on the badge, so the badge itself steps aside.
  $('home-day-btn').style.visibility = open ? 'hidden' : 'visible';
  if (!open) return;

  const host = $('home-picker-scroll');
  clear(host);
  const last = PICK_DAYS + 1;
  // The overlap means the stack is only last*PICK_STEP + PICK_SIZE tall no matter how
  // the circles are counted. Pad it until the last one can scroll clear of the faded
  // slot into the fourth, where it is legible and tappable.
  host.style.paddingBottom =
    (PICK_VIEW + (last - 3) * PICK_STEP - (last + 1) * PICK_STEP) + 'px';
  for (let i = 0; i <= last; i++) {
    const day = i <= PICK_DAYS ? i : null;
    const opt = el('div', DAY_OPT_STYLE + 'z-index:' + (last - i),
      day === null ? 'LOG.' : dayLabel(day));
    opt.className = 'day-opt';
    opt.addEventListener('click', () => {
      ui.picker = false;
      if (day === null) { ui.calMonth = monthStart(dayAt(ui.day)); go('calendar'); return; }
      ui.day = day;
      render();
    });
    host.appendChild(opt);
  }
  host.scrollTop = 0;
}

// ══════════════════════════ CALENDAR ══════════════════════════
function monthStart(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }

// Shortened only where the full name is long enough to need it.
const CAL_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUNE',
                    'JULY', 'AUG', 'SEPT', 'OCT', 'NOV', 'DEC'];

function renderCalendar() {
  const m = ui.calMonth || (ui.calMonth = monthStart(dayAt(ui.day)));
  $('cal-month').textContent = CAL_MONTHS[m.getMonth()];
  $('cal-year').textContent = m.getFullYear();

  // The masthead reads the selected day, not the month being paged through.
  const sel = dayAt(ui.day);
  $('cal-daynum').textContent = sel.getDate();
  $('cal-downame').textContent = sel.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase();

  const dow = $('cal-dow');
  clear(dow);
  for (const l of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) {
    dow.appendChild(el('div',
      "text-align:center;color:rgba(39,14,14,.4);font:600 9px/1 'IBM Plex Mono',monospace;" +
      'letter-spacing:.1em', l));
  }

  const grid = $('cal-grid');
  clear(grid);
  const pad = new Date(m.getFullYear(), m.getMonth(), 1).getDay();
  const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
  for (let i = 0; i < pad; i++) grid.appendChild(el('div', 'aspect-ratio:1'));

  for (let n = 1; n <= days; n++) {
    const date = new Date(m.getFullYear(), m.getMonth(), n);
    const bucket = dayIndex.get(dayKey(date));
    const back = daysBack(date);
    const future = back === null;
    const selected = !future && back === ui.day;

    // A logged day is a solid disc; everything else is the faint ground the
    // reference uses, so the month reads as a pattern before it reads as dates.
    // The selected day takes the accent, the one red thing on a sage screen.
    const cell = el('div',
      'aspect-ratio:1;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
      "box-sizing:border-box;font:600 12px/1 'IBM Plex Mono',monospace;transition:transform .1s;" +
      (selected ? 'background:#FF0000;color:#270E0E;'
        : bucket ? 'background:#270E0E;color:#C0C3B0;'
        : future ? 'background:rgba(39,14,14,.07);color:rgba(39,14,14,.24);'
                 : 'background:rgba(39,14,14,.15);color:rgba(39,14,14,.6);'), String(n));
    if (!future) {
      cell.className = 'cal-cell';
      cell.addEventListener('click', () => { ui.day = back; go('home'); });
    }
    grid.appendChild(cell);
  }

  // Never page past the current month. The glyph stays put and only dims, so the
  // pair does not go lopsided on the month you are almost always looking at.
  const now = monthStart(new Date());
  $('cal-next').classList.toggle('off', m >= now);
}

function shiftMonth(delta) {
  const m = ui.calMonth || monthStart(new Date());
  const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
  if (next > monthStart(new Date())) return;
  ui.calMonth = next;
  render();
}

// ══════════════════════════ CALCULATOR ══════════════════════════
function fmt(n) {
  if (!isFinite(n)) return '0';
  return String(Math.round(n * 100) / 100).slice(0, 8);
}

function apply(a, b, op) {
  if (op === '+') return a + b;
  if (op === '-') return a - b;
  if (op === '*') return a * b;
  return b;
}

function digit(d) {
  if (ui.fresh) { ui.display = d === '.' ? '0.' : d; ui.fresh = false; return render(); }
  if (d === '.' && ui.display.indexOf('.') > -1) return;
  if (ui.display.replace('-', '').replace('.', '').length >= 4) return;
  ui.display = ui.display === '0' && d !== '.' ? d : ui.display + d;
  render();
}

function setOp(op) {
  const cur = parseFloat(ui.display) || 0;
  const next = ui.op != null && !ui.fresh ? apply(ui.pending, cur, ui.op) : cur;
  ui.pending = next;
  ui.op = op;
  ui.display = fmt(next);
  ui.fresh = true;
  render();
}

/** Returns true only when an entry was actually logged (not when an expression resolved). */
function equals() {
  if (ui.op != null) {
    const cur = parseFloat(ui.display) || 0;
    ui.display = fmt(apply(ui.pending, cur, ui.op));
    ui.pending = null;
    ui.op = null;
    ui.fresh = true;
    render();
    return false;
  }
  const val = Math.round(parseFloat(ui.display) || 0);
  if (!val) return false;
  logEntry(val);
  ui.display = '0';
  ui.fresh = true;
  render();
  return true;
}

function del() {
  if (ui.fresh) { ui.display = '0'; ui.fresh = true; return render(); }
  const d = ui.display.slice(0, -1);
  ui.display = d === '' || d === '-' ? '0' : d;
  ui.fresh = d === '';
  render();
}

function clearCalc() {
  ui.display = '0';
  ui.pending = null;
  ui.op = null;
  ui.fresh = true;
  render();
}

function renderSegments(str) {
  const host = $('calc-seg');
  clear(host);
  for (const ch of String(str).replace(/[^0-9]/g, '')) {
    const on = SEG_MAP[ch] || '';
    const cell = el('div', 'position:relative;width:34px;height:44px;flex:none');
    for (const k of 'abcdefg') {
      const [l, t, w, h, clipPath] = SEG_GEO[k];
      cell.appendChild(el('div',
        'position:absolute;left:' + l + 'px;top:' + t + 'px;width:' + w + 'px;height:' + h +
        'px;background:' + (on.indexOf(k) > -1 ? SEG_ON : SEG_OFF) + ';clip-path:' + clipPath));
    }
    host.appendChild(cell);
  }
}

function renderCalc() {
  const g = goal();
  const logged = viewLogged();
  const cur = parseFloat(ui.display) || 0;
  const preview = ui.op != null && !ui.fresh ? apply(ui.pending, cur, ui.op) : cur;
  const pct = clamp((logged + Math.max(preview, 0)) / g, 0, 1);

  $('calc-pct-ink').textContent = Math.round(pct * 100) + '%';
  renderSegments(ui.display);

  // Keep the arc's leading edge out of the type on the band. Half-covered, a word has no
  // single readable colour; snapped clear of it, one flat colour always works.
  let sweep = pct * 360;
  const intervals = coverIntervals();
  const merged = intervals
    .map(i => [i.enter, i.exit])
    .sort((a, b) => a[0] - b[0])
    .reduce((acc, cur) => {
      const last = acc[acc.length - 1];
      if (last && cur[0] <= last[1]) last[1] = Math.max(last[1], cur[1]);
      else acc.push(cur.slice());
      return acc;
    }, []);
  for (const [lo, hi] of merged) {
    if (sweep > lo && sweep < hi) {
      sweep = sweep - lo < hi - sweep ? lo : hi;
      break;
    }
  }
  // Each piece of type takes its colour from what ends up behind it, independently.
  for (const i of intervals) {
    i.paint.style.color = sweep >= i.exit ? '#270E0E' : '#FF0000';
  }

  const lead = CALC_ARC_ANCHOR - sweep;
  const on = pct > 0;
  const mask = conicMask(lead, sweep);
  const cap = bandPoint(lead, BAND_R);

  const fill = $('calc-arc-fill');
  fill.style.display = on ? 'block' : 'none';
  fill.style.webkitMask = mask;
  fill.style.mask = mask;

  // Leading cap rides the sweep; the tail cap is pinned at the anchor.
  const capEl = $('calc-arc-cap');
  capEl.style.display = on ? 'block' : 'none';
  placeCap(capEl, cap);
  $('calc-arc-tail').style.display = on ? 'block' : 'none';

  const entries = viewEntries().slice(-16);

  // stripe marks: the leading triangle is static markup, one parallelogram per entry
  const marks = $('calc-marks');
  while (marks.children.length > 1) marks.removeChild(marks.lastChild);
  for (let i = 0; i < entries.length; i++) {
    marks.appendChild(el('div', 'width:7px;flex:none;background:#FF0000;transform:skewX(-45deg)'));
  }

  const isCalc = ui.view === 'calc';
  $('calc-keypad').style.display = isCalc ? 'grid' : 'none';
  $('calc-history').style.display = isCalc ? 'none' : 'flex';
  $('calc-view-toggle').textContent = isCalc ? 'HISTORY' : 'CALCULATOR';
  if (!isCalc) renderHistory(entries);
}

function renderHistory(entries) {
  const host = $('calc-history');
  clear(host);
  host.style.paddingRight = entries.length < 3 ? entries.length * 60 + 'px' : '0px';

  if (entries.length === 0) {
    host.appendChild(el('div',
      "color:#FF0000;font:600 11px/1 'IBM Plex Mono',monospace;letter-spacing:.16em;padding:6px 0",
      'NO ENTRIES TODAY'));
    return;
  }

  const flex = entries.length < 3 ? 'none' : '1 1 0';
  const width = entries.length < 3 ? '172.67px' : 'auto';

  entries.forEach(e => {
    const on = ui.selTile === e.t;
    const tile = el('div',
      'position:relative;flex:' + flex + ';width:' + width + ';min-width:0;margin-right:-60px;' +
      'clip-path:polygon(60px 0,100% 0,calc(100% - 60px) 100%,0 100%);display:flex;' +
      'flex-direction:column;align-items:center;justify-content:center;gap:2px;overflow:hidden;' +
      'transition:background .1s,color .1s;background:' + (on ? '#000000' : '#FF0000') +
      ';color:' + (on ? '#FF0000' : '#270E0E'));
    tile.className = 'tile';
    tile.appendChild(el('div',
      "font:800 62px/.82 'Big Shoulders Display',sans-serif;letter-spacing:-.02em", String(e.v)));
    tile.appendChild(el('div',
      "font:600 10px/1 'IBM Plex Mono',monospace;letter-spacing:.2em", 'CAL'));
    tile.appendChild(el('div',
      "position:absolute;left:9px;bottom:13px;font:600 12px/1 'IBM Plex Mono',monospace;letter-spacing:.1em",
      clock(e.t)));
    tile.addEventListener('click', () => {
      ui.selTile = ui.selTile === e.t ? null : e.t;
      render();
    });
    tile.addEventListener('dblclick', () => {
      removeEntry(e.t);
      ui.selTile = null;
      render();
    });
    host.appendChild(tile);
  });
}

// ══════════════════════════ STATS ══════════════════════════
function buckets(range, offset) {
  const cfg = STATS_RANGES[range];
  const span = cfg.n * cfg.step;
  const out = [];
  for (let i = 0; i < cfg.n; i++) {
    const d = span * offset + (cfg.n - 1 - i) * cfg.step;
    let sum = 0;
    for (let k = 0; k < cfg.step; k++) sum += dayCal(d + k);
    out.push({ d: d, v: Math.round(sum / cfg.step) });
  }
  return out;
}

function mealIdxForDay(d) {
  const c = MEALS_CFG[ui.range];
  const i = c.n - 1 - Math.floor(d / c.step);
  return i >= 0 && i < c.n ? i : null;
}

function barIdxForDay(d) {
  const c = STATS_RANGES[ui.range];
  const m = MEALS_CFG[ui.range];
  if (m.step > c.step * 2) return null;
  const i = c.n - 1 - Math.floor(d / c.step);
  return i >= 0 && i < c.n ? i : null;
}

/** Representative meal times for a bucket: slot r averaged over the days that have one. */
function bucketTimes(d, step) {
  const perDay = [];
  for (let k = 0; k < step; k++) {
    const t = dayTimes(d + k);
    if (t.length) perDay.push(t);
  }
  if (!perDay.length) return [];
  const out = [];
  for (let r = 0; r < ROWS; r++) {
    const vals = perDay.map(t => t[r]).filter(v => v != null);
    if (!vals.length) break;
    out.push(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  return out;
}

function renderStats() {
  const g = goal();
  const range = ui.range;
  const cfg = STATS_RANGES[range];
  const cur = buckets(range, 0);
  const n = cur.length;
  const barScale = g / GOAL_AT;
  const sel = ui.sel;
  const selBar = sel != null ? cur[sel] : null;
  const curAvg = Math.round(cur.reduce((a, b) => a + b.v, 0) / n);

  $('stats-hero-caption').textContent = selBar
    ? (cfg.step === 1
        ? dayAt(selBar.d).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() +
          ' ' + dayAt(selBar.d).getDate() + ' ' + mon(selBar.d).toUpperCase()
        : 'WEEK OF ' + dayAt(selBar.d).getDate() + ' ' + mon(selBar.d).toUpperCase())
    : 'AVERAGE PER ' + range.replace('D', ' DAYS').replace('1Y', 'YEAR');
  $('stats-hero-value').textContent = nf(selBar ? selBar.v : curAvg);
  $('stats-goal-value').textContent = nf(g);
  $('stats-goal-line').style.bottom = (GOAL_AT * 100).toFixed(2) + '%';
  $('stats-range-btn').textContent = range;

  // bars
  const barHost = $('stats-bars');
  clear(barHost);
  barHost.style.gap = cfg.gap + 'px';
  cur.forEach((b, i) => {
    const slot = el('div',
      'flex:1 1 0;min-width:0;height:100%;display:flex;align-items:flex-end;justify-content:center;cursor:pointer');
    const fill = sel == null
      ? (b.v > g ? '#FF0000' : '#270E0E')
      : (sel === i ? '#FF0000' : '#A9AE99');
    slot.appendChild(el('div',
      'width:' + cfg.w + ';max-width:100%;height:' +
      Math.min(100, (b.v / barScale) * 100).toFixed(2) + '%;background:' + fill +
      ';border-radius:' + cfg.cap));
    slot.addEventListener('click', () => {
      if (ui.sel === i) { ui.sel = null; ui.mealSel = null; }
      else { ui.sel = i; ui.mealSel = mealIdxForDay(b.d); }
      render();
    });
    barHost.appendChild(slot);
  });

  // x axis
  const xHost = $('stats-xlabels');
  clear(xHost);
  const labelStyle = "position:absolute;top:0;white-space:nowrap;font:600 9px/1 'IBM Plex Mono',monospace;letter-spacing:.1em;color:#4A5046";
  if (range === '7D') {
    cur.forEach((b, i) => {
      xHost.appendChild(el('div',
        labelStyle + ';left:' + colPos(i, n, cfg.gap) + ';transform:translateX(-50%)',
        i === n - 1 ? 'today' : dayAt(b.d).toLocaleDateString('en-US', { weekday: 'narrow' })));
    });
  } else {
    const mid = Math.floor(n / 2);
    xHost.appendChild(el('div', labelStyle + ';left:0%',
      dayAt(cur[0].d).getDate() + ' ' + mon(cur[0].d)));
    xHost.appendChild(el('div', labelStyle + ';left:50%;transform:translateX(-50%)',
      dayAt(cur[mid].d).getDate() + ' ' + mon(cur[mid].d)));
    xHost.appendChild(el('div', labelStyle + ';left:100%;transform:translateX(-100%)', 'today'));
  }

  renderMeals();
}

function colPos(i, n, gap) {
  return 'calc((100% - ' + ((n - 1) * gap) + 'px) * ' + ((i + 0.5) / n).toFixed(5) +
         ' + ' + (i * gap) + 'px)';
}

function renderMeals() {
  const range = ui.range;
  const cfg = MEALS_CFG[range];
  const sel = ui.mealSel;
  const n = cfg.n;

  const cols = [];
  for (let i = 0; i < n; i++) {
    const d = (n - 1 - i) * cfg.step;
    let sum = 0;
    for (let k = 0; k < cfg.step; k++) sum += mealsAt(d + k);
    cols.push({ d: d, v: Math.min(ROWS, Math.round(sum / cfg.step)) });
  }
  const times = cols.map(c => bucketTimes(c.d, cfg.step));
  const selCol = sel != null ? cols[sel] : null;
  const dimmed = sel != null;
  // 7D prints the times inside its larger dots; denser ranges use the detail panel.
  const inDots = cfg.step === 1 && cfg.dot >= 20;

  // top labels
  const labelHost = $('stats-meal-labels');
  clear(labelHost);
  const ls = "position:absolute;top:0;white-space:nowrap;font:600 9px/1 'IBM Plex Mono',monospace;letter-spacing:.1em;opacity:.7";
  if (range === '7D' || range === '1Y') {
    cols.forEach((c, i) => {
      labelHost.appendChild(el('div',
        ls + ';left:' + colPos(i, n, cfg.cg) + ';transform:translateX(-50%)', String(c.v)));
    });
  } else {
    const mid = Math.floor(n / 2);
    labelHost.appendChild(el('div', ls + ';left:0%',
      dayAt(cols[0].d).getDate() + ' ' + mon(cols[0].d)));
    labelHost.appendChild(el('div', ls + ';left:50%;transform:translateX(-50%)',
      dayAt(cols[mid].d).getDate() + ' ' + mon(cols[mid].d)));
    labelHost.appendChild(el('div', ls + ';left:100%;transform:translateX(-100%)', 'today'));
  }

  // dot matrix
  const colHost = $('stats-meal-cols');
  clear(colHost);
  colHost.style.gap = cfg.cg + 'px';
  cols.forEach((c, i) => {
    const on = sel === i;
    const fill = on ? '#000000' : dimmed ? 'rgba(39,14,14,.34)' : '#270E0E';
    const off = on ? 'rgba(0,0,0,.2)' : dimmed ? 'rgba(39,14,14,.12)' : 'rgba(39,14,14,.22)';
    const col = el('div',
      'position:relative;flex:1 1 0;min-width:0;display:flex;flex-direction:column;align-items:center;gap:' +
      cfg.dg + 'px;padding-bottom:26px;cursor:pointer');
    for (let r = 0; r < ROWS; r++) {
      const lit = r < c.v;
      const dot = el('div',
        'position:relative;width:' + cfg.dot + 'px;height:' + cfg.dot +
        'px;border-radius:50%;background:' + (lit ? fill : off) + ';flex:none');
      const label = on && lit && inDots && times[i][r] != null ? hhmm(times[i][r]) : '';
      dot.appendChild(el('div',
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;white-space:nowrap;font:600 10.5px/1 'IBM Plex Mono',monospace;letter-spacing:0;color:" +
        (label ? '#FF0000' : 'transparent'), label));
      col.appendChild(dot);
    }
    col.addEventListener('click', () => {
      if (ui.mealSel === i) { ui.mealSel = null; ui.sel = null; }
      else { ui.mealSel = i; ui.sel = barIdxForDay(c.d); }
      render();
    });
    colHost.appendChild(col);
  });

  // selected-day detail panel (30D and denser)
  const panel = $('stats-sel-times');
  const showPanel = selCol != null && !inDots;
  panel.style.display = showPanel ? 'flex' : 'none';
  if (showPanel) {
    panel.style.top = (37 + ROWS * (cfg.dot + cfg.dg) + 14) + 'px';
    $('stats-sel-caption').textContent = selCol.v + (selCol.v === 1 ? ' MEAL' : ' MEALS');
    const list = $('stats-sel-list');
    clear(list);
    times[sel].forEach((h, r) => {
      const item = el('div', 'display:flex;flex-direction:column;gap:4px;color:#FF0000');
      item.appendChild(el('div',
        "font:600 9.5px/1 'IBM Plex Mono',monospace;letter-spacing:.14em;color:#FF6A58",
        String(r + 1).padStart(2, '0')));
      item.appendChild(el('div',
        'font:900 29px/.82 Archivo,sans-serif;letter-spacing:-.035em', hhmm(h)));
      list.appendChild(item);
    });
  }

  // average meal times hero
  const avgTimes = [];
  for (let r = 0; r < ROWS; r++) {
    const vals = times.map(t => t[r]).filter(v => v != null);
    if (vals.length >= Math.max(2, cols.length * 0.5)) {
      avgTimes.push(hhmm(vals.reduce((a, b) => a + b, 0) / vals.length));
    }
  }
  $('stats-meals-big').textContent = avgTimes.length ? avgTimes.slice(0, 2).join(', ') : 'NO DATA';
  $('stats-meals-caption').textContent = 'AVERAGE MEAL TIMES PER ' +
    (range === '1Y' ? 'YEAR' : range.replace('D', ' DAYS'));
}

// ── render ───────────────────────────────────────────────────────────────────
function render() {
  if (ui.screen === 'home') renderHome();
  else if (ui.screen === 'calc') renderCalc();
  else if (ui.screen === 'calendar') renderCalendar();
  else renderStats();
}

// ── wiring ───────────────────────────────────────────────────────────────────
$('home-day-btn').addEventListener('click', () => { ui.picker = true; render(); });
$('home-picker-backdrop').addEventListener('click', () => { ui.picker = false; render(); });
$('home-cal-btn').addEventListener('click', () => {
  ui.calMonth = monthStart(dayAt(ui.day));
  go('calendar');
});
$('cal-back-btn').addEventListener('click', () => go('home'));
$('cal-prev').addEventListener('click', () => shiftMonth(-1));
$('cal-next').addEventListener('click', () => shiftMonth(1));

$('home-stats-btn').addEventListener('click', () => go('stats'));
$('home-open-calc').addEventListener('click', () => go('calc'));
$('stats-home-btn').addEventListener('click', () => go('home'));

$('calc-close').addEventListener('click', () => { clearCalc(); go('home'); });
// The dial doubles as "log it and get out" — resolving a pending expression keeps you here.
$('calc-dial-btn').addEventListener('click', () => { if (equals()) go('home'); });
$('calc-view-toggle').addEventListener('click', () => {
  ui.view = ui.view === 'calc' ? 'history' : 'calc';
  ui.selTile = null;
  render();
});

$('calc-keypad').addEventListener('click', e => {
  const btn = e.target.closest('[data-key]');
  if (!btn) return;
  const k = btn.dataset.key;
  if (k === 'del') del();
  else if (k === 'eq') equals();
  else digit(k);
});

$('stats-range-btn').addEventListener('click', () => {
  ui.range = RANGES[(RANGES.indexOf(ui.range) + 1) % RANGES.length];
  ui.sel = null;
  ui.mealSel = null;
  render();
});

// hardware keyboard, as the prototype supported
window.addEventListener('keydown', e => {
  if (ui.screen !== 'calc') return;
  const k = e.key;
  if (k >= '0' && k <= '9') digit(k);
  else if (k === '.') digit('.');
  else if (k === '+' || k === '-' || k === '*') setOp(k);
  else if (k === 'Enter' || k === '=') equals();
  else if (k === 'Backspace') del();
  else if (k === 'Escape') clearCalc();
  else return;
  e.preventDefault();
});

window.addEventListener('resize', layout);
window.addEventListener('orientationchange', layout);
if (window.visualViewport) window.visualViewport.addEventListener('resize', layout);

// A day boundary crossed while the app sits open would otherwise leave stale totals.
let lastDay = dayKey(new Date());
setInterval(() => {
  const now = dayKey(new Date());
  if (now !== lastDay) { lastDay = now; reindex(); render(); }
}, 60000);

reindex();
layout();
go('home');

// The calculator measures its readout to place the arc. Before the webfont lands that
// measurement uses fallback metrics, so redo it once the real face is in.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
