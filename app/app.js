/* intake — implementation of the Claude Design prototype (Calorie Home.dc.html).
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

// The chart's own box, and the two grey rules the design runs above it - the only
// things a goal rule can ever end up level with, since it is the one thing on the
// screen that leaves the chart to reach them.
const CHART_TOP = 236;
const CHART_H = 248;
const RULE_YS = [198, 234];
const RULE_SEP = 8;          // clear ground left between the red and the grey it displaces
const RISER_GAP = 3;         // and between a step's riser and the two lines it steps between

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
const STORE_KEY = 'intake.v1';
// What the app was called when the first day was logged into it. A name is the app's
// business and none of the log's, so anything written under the old one is picked up
// and carried over the first time this one is written.
const WAS_KEY = 'countcal.v1';

const store = load();

function load() {
  let raw;
  try {
    raw = localStorage.getItem(STORE_KEY);
    if (raw == null) raw = localStorage.getItem(WAS_KEY);
  } catch (e) { return normalize(null); }
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { /* unreadable is the same as absent */ }
  return normalize(parsed);
}

/**
 * Anything claiming to be a store, turned into one - whatever came out of storage, and
 * whatever came out of a file someone handed the app. Nothing downstream ever has to ask
 * whether a figure is a number or a date is a date.
 */
function normalize(parsed) {
  const item = e => ({ v: Math.round(Number(e && e.v)), t: Number(e && e.t) });
  const real = e => Number.isFinite(e.v) && e.v > 0 && Number.isFinite(e.t);
  const list = k => (Array.isArray(parsed && parsed[k]) ? parsed[k] : []);

  const goal = Number.isFinite(parsed && parsed.goal) ? Math.round(parsed.goal) : 1900;
  // Every maximum the day has ever been held to, so a past day can still be read
  // against the figure it was actually kept to. t is when the figure took effect; the
  // first one reaches back to the beginning, since there was nothing before it.
  const goals = list('goals')
    .map(g => ({ t: Number(g && g.t), v: Math.round(Number(g && g.v)) }))
    .filter(g => Number.isFinite(g.t) && g.v > 0)
    .sort((a, b) => a.t - b.t);
  if (!goals.length) goals.push({ t: 0, v: goal });
  else if (goals[goals.length - 1].v !== goal) goals.push({ t: Date.now(), v: goal });

  return {
    // m is the meal an entry belongs to. Anything logged before meals existed stands
    // alone, which is what it counted as then too.
    entries: list('entries')
      .map(e => { const o = item(e); o.m = Number.isFinite(Number(e && e.m)) ? Number(e.m) : o.t; return o; })
      .filter(real)
      .sort((a, b) => a.t - b.t),
    goal: goal,
    goals: goals,
    open: list('open').map(item).filter(real).sort((a, b) => a.t - b.t),
    // The month the log begins at. Null until the app has had a first run to remember.
    start: Number.isFinite(parsed && parsed.start) ? parsed.start : null
  };
}

// A write can fail for reasons the app cannot do anything about - private browsing, an
// origin the browser has blocked, a full disk. It goes on working either way, since a
// session that still counts is better than one that refuses to; but a day that is not
// being kept must never look like a day that is.
let saveBroken = false;

function save() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    // Only once it is safely under the new name, and never before.
    if (localStorage.getItem(WAS_KEY) != null) localStorage.removeItem(WAS_KEY);
    setSaveBroken(false);
  } catch (e) {
    setSaveBroken(true);
  }
}

function setSaveBroken(on) {
  if (on === saveBroken) return;
  saveBroken = on;
  $('alarm').style.display = on ? 'flex' : 'none';
}

/** Writes and removes a key of its own: the question is whether writing works at all,
    and the answer must not be bought at the price of the one thing worth keeping. */
function probeStorage() {
  try {
    localStorage.setItem(STORE_KEY + '.probe', '1');
    localStorage.removeItem(STORE_KEY + '.probe');
    setSaveBroken(false);
  } catch (e) {
    setSaveBroken(true);
  }
}

/**
 * Storage an origin has not been granted persistence for is "best effort": when the
 * device runs short of room the browser evicts it, oldest-used first, without asking.
 * Asking to be exempt costs nothing when it is refused, and is granted silently by some
 * browsers on the strength of the app being installed or used often.
 *
 * It is not a guarantee of anything. It does not survive the browser's data being
 * cleared, and on WebKit a site left alone for seven days is cleared regardless - which
 * is what adding the app to the home screen, rather than this, is the answer to.
 */
function askToPersist() {
  const s = navigator.storage;
  if (!s || !s.persist || !s.persisted) return;
  s.persisted().then(has => (has ? true : s.persist())).catch(() => {});
}

// ── ephemeral state ──────────────────────────────────────────────────────────
const ui = {
  screen: 'home',
  day: 0,                    // days back from today that Home is showing
  picker: false,
  settings: false,           // the sheet is up, over whatever screen is behind it
  calMonth: null,            // first of the month the calendar is showing
  animHome: false,           // the day's total just changed, so the dial has a way to go
  display: '0', pending: null, op: null, fresh: true,
  view: 'calc', selTile: null,
  showTotal: false,          // the dial reads the meal so far, not what was typed
  histX: 0,                  // pixels the history row is dragged left of its start
  range: '7D',
  selDay: null, mealSelDay: null,   // selection keyed by day, so a slide cannot shift it
  scrub: 0                   // days the stats window is dragged back from its rest position
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
    if (!bucket) { bucket = { cal: 0, meals: new Map() }; dayIndex.set(k, bucket); }
    bucket.cal += e.v;
    // Calories count every ingredient, but a meal counts once, timed from when it began.
    if (!bucket.meals.has(e.m)) {
      const m = new Date(e.m);
      bucket.meals.set(e.m, m.getHours() + m.getMinutes() / 60);
    }
  }
  for (const b of dayIndex.values()) b.times = [...b.meals.values()].sort((a, c) => a - c);
}

function dayAt(d) { const dt = new Date(); dt.setDate(dt.getDate() - d); return dt; }
function dayData(d) { return dayIndex.get(dayKey(dayAt(d))) || null; }
function dayCal(d) { const b = dayData(d); return b ? b.cal : 0; }
function mealsAt(d) { const b = dayData(d); return b ? Math.min(ROWS, b.times.length) : 0; }
function dayTimes(d) { const b = dayData(d); return b ? b.times.slice(0, ROWS) : []; }

const goal = () => store.goal;

/** The maximum that was in force on a given day, which is what that day was kept to. */
function goalOn(d) {
  if (d <= 0) return store.goal;
  const end = dayAt(d);
  end.setHours(23, 59, 59, 999);
  let v = store.goals[0].v;
  for (const g of store.goals) {
    if (g.t > end.getTime()) break;
    v = g.v;
  }
  return v;
}

function setGoal(v) {
  const n = Math.round(v);
  if (!(n > 0) || n === store.goal) return;
  store.goal = n;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = store.goals[store.goals.length - 1];
  // One change per day. A figure tapped out a digit at a time is one decision, and a
  // history of 1, 19, 190, 1900 would say nothing about what any day was held to.
  if (last && last.t >= today.getTime()) last.v = n;
  else store.goals.push({ t: Date.now(), v: n });
  save();
}

/** The month the log begins at, remembered the first time anything needs to know. */
function ensureStart() {
  if (Number.isFinite(store.start)) return;
  const first = store.entries.length ? new Date(store.entries[0].t) : new Date();
  store.start = monthStart(first).getTime();
  save();
}

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

// ── the meal being built ─────────────────────────────────────────────────────
// = adds an ingredient; nothing reaches the day's total until the dial commits the
// meal. Ingredients keep their own figures - the meal is only how they are grouped.

const viewOpen = () => {
  const k = dayKey(dayAt(ui.day));
  return store.open.filter(e => dayKey(new Date(e.t)) === k);
};

const openTotal = () => viewOpen().reduce((a, e) => a + e.v, 0);

/** A stamp on the day Home is showing, nudged until no other item shares it. */
function stamp() {
  let t = dayAt(ui.day).getTime();
  while (store.entries.some(e => e.t === t) || store.open.some(e => e.t === t)) t++;
  return t;
}

function addIngredient(v) {
  const n = Math.round(v);
  if (!(n > 0)) return false;
  store.open.push({ v: n, t: stamp() });
  save();
  return true;
}

/** The whole meal goes through at once, its ingredients sharing the id of the first. */
function commitItems(items) {
  if (!items.length) return false;
  const id = items[0].t;
  const drop = new Set(items.map(e => e.t));
  for (const it of items) store.entries.push({ v: it.v, t: it.t, m: id });
  store.open = store.open.filter(e => !drop.has(e.t));
  store.entries.sort((a, b) => a.t - b.t);
  save();
  reindex();
  return true;
}

function commitMeal() { return commitItems(viewOpen()); }

/**
 * A meal still open when the day turns over was eaten on the day it was started, so the
 * turn of the day is what finishes it. Without this it would simply stop being visible:
 * the calculator only ever shows the meal belonging to the day on show, and tomorrow is
 * a different day. Run when the clock crosses midnight, and again on the way up, since
 * the app is far more often closed over midnight than open across it.
 */
function closeStaleMeals() {
  const today = dayKey(new Date());
  const byDay = new Map();
  for (const e of store.open) {
    const k = dayKey(new Date(e.t));
    if (k === today) continue;
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(e);
  }
  let closed = false;
  for (const items of byDay.values()) closed = commitItems(items) || closed;
  return closed;
}

/** Throws away the meal being built, and only that: another day's is not this one's. */
function cancelMeal() {
  const items = viewOpen();
  if (!items.length) return;
  const drop = new Set(items.map(e => e.t));
  store.open = store.open.filter(e => !drop.has(e.t));
  save();
}

/** Deletes an ingredient wherever it lives - a committed meal, or the open one. */
function removeEntry(t) {
  const i = store.entries.findIndex(e => e.t === t);
  if (i >= 0) {
    store.entries.splice(i, 1);
    save();
    reindex();
    return;
  }
  const j = store.open.findIndex(e => e.t === t);
  if (j >= 0) { store.open.splice(j, 1); save(); }
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
    { box: $('calc-title'), paint: $('calc-title') },
    // Sits over the lower left of the band, so a full ring swallows it completely.
    { box: $('calc-view-toggle'), paint: $('calc-view-toggle') }
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
// ── sliding between screens ──────────────────────────────────────────────────
// Where each screen sits relative to Home, which is all the direction of a slide is:
// a screen further right arrives from the right. It matches the swipes by
// construction, so reaching a screen by button looks the same as reaching it by hand.
const SCREENS = ['home', 'calc', 'stats', 'calendar'];
const SCREEN_AT = { stats: -1, home: 0, calc: 1, calendar: 1 };
const SLIDE_MS = 260;
const stillMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
let slideTimer = 0;
document.documentElement.style.setProperty('--slide-ms', SLIDE_MS + 'ms');

function endSlide() {
  clearTimeout(slideTimer);
  stage.classList.remove('sliding');
  for (const s of SCREENS) {
    $('screen-' + s).classList.remove('leaving', 'from-left', 'from-right', 'to-left', 'to-right');
  }
}

function startSlide(from, to) {
  endSlide();                                  // whatever was mid-flight gives way
  if (stillMotion && stillMotion.matches) return;
  const step = SCREEN_AT[to] - SCREEN_AT[from];
  if (!step) return;                           // side by side: nothing to slide past
  const out = $('screen-' + from);
  const inn = $('screen-' + to);
  out.classList.add('leaving', step > 0 ? 'to-left' : 'to-right');
  inn.classList.add(step > 0 ? 'from-right' : 'from-left');
  stage.classList.add('sliding');
  slideTimer = setTimeout(endSlide, SLIDE_MS);
}

function go(screen) {
  const from = ui.screen;
  // The calculator always opens on the keypad, never on whatever view was left behind.
  if (screen === 'calc') {
    ui.view = 'calc';
    calcJump = true;             // arriving at a figure, not watching one change
    disarmTile();
    ui.histX = 0;
    histSlider.stop();
    // A meal left open - across a reload, even - is picked back up where it stood.
    ui.display = '0';
    ui.pending = null;
    ui.op = null;
    ui.fresh = true;
    ui.showTotal = openTotal() > 0;
  }
  if (screen !== 'home') ui.picker = false;
  // Stats always opens where it rests: a scrub is a way of looking around, not a place.
  if (screen === 'stats') {
    statsSlider.stop();
    ui.scrub = 0; ui.selDay = null; ui.mealSelDay = null;
  }
  ui.screen = screen;
  for (const s of SCREENS) {
    $('screen-' + s).classList.toggle('active', s === screen);
  }
  // Drawn while on show and before the slide starts: the calculator measures its own
  // type to place the arc, and a hidden screen measures as nothing at all.
  render();
  if (from !== screen) startSlide(from, screen);
  paintBackdrop();
}

// ── the arc, moving ──────────────────────────────────────────────────────────
// A dial that jumps tells you where it ended up; one that travels tells you how far it
// moved, which is the thing it is there to say. The value runs towards its target
// rather than along a path of fixed length, so a figure typed a digit at a time
// redirects it mid-flight instead of restarting it from wherever it had got to.
const ARC_MS = 520;

function makeEase(paint) {
  let cur = null, target = 0, raf = 0, wait = 0, last = 0;

  function frame(now) {
    const dt = Math.min(64, now - last);
    last = now;
    cur += (target - cur) * (1 - Math.pow(0.001, dt / ARC_MS));
    if (Math.abs(target - cur) < 0.05) cur = target;
    paint(cur);
    if (cur !== target) raf = requestAnimationFrame(frame);
  }

  const self = {
    /** Travels there - or lands there, with nowhere to travel from, or motion turned off. */
    to(v, jump) {
      clearTimeout(wait);
      cancelAnimationFrame(raf);
      target = v;
      if (cur === null || jump || (stillMotion && stillMotion.matches)) {
        cur = v;
        paint(cur);
        return;
      }
      if (cur === target) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    },
    /** Stays put for a moment first, so the screen it is on lands before it moves. */
    hold(v, ms) {
      clearTimeout(wait);
      cancelAnimationFrame(raf);
      if (cur === null) return self.to(v, true);
      wait = setTimeout(() => self.to(v), ms);
    },
    at: () => cur
  };
  return self;
}

// ══════════════════════════ HOME ══════════════════════════
function paintHomeArc(sweep) {
  const on = sweep > 0.05;
  const lead = HOME_ARC_ANCHOR - sweep;
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

const homeArc = makeEase(paintHomeArc);

function renderHome() {
  const g = goal();
  const logged = viewLogged();

  // Left of the maximum, or past it. "Left: -212" is a double negative to read through;
  // the word carries the sign so the figure never has to.
  $('home-left-cap').textContent = logged > g ? 'Over:' : 'Left:';
  $('home-left-val').textContent = String(Math.abs(Math.round(g - logged)));
  $('home-max').textContent = g + ' cal maximum.';
  $('home-day').textContent = dayLabel(ui.day);
  renderPicker();

  const target = clamp(logged / g, 0, 1) * 360;
  // Only a meal just committed has anywhere to travel from; every other way onto this
  // screen is arriving at a figure, not watching one change.
  if (ui.animHome) {
    ui.animHome = false;
    homeArc.hold(target, SLIDE_MS);
  } else {
    homeArc.to(target, true);
  }
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

/** The earliest month the calendar will page back to: where the log is set to begin,
    or the month of the oldest entry if something older than that was imported. */
function calFloor() {
  const set = monthStart(new Date(Number.isFinite(store.start) ? store.start : Date.now()));
  if (!store.entries.length) return set;
  const first = monthStart(new Date(store.entries[0].t));
  return first < set ? first : set;
}

/** The latest the log may be said to begin: never past this month, and never past
    something already logged, which moving it forward would put out of reach. */
function startCeil() {
  const now = monthStart(new Date());
  if (!store.entries.length) return now;
  const first = monthStart(new Date(store.entries[0].t));
  return first < now ? first : now;
}

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
  for (const l of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
    dow.appendChild(el('div',
      "text-align:center;color:rgba(39,14,14,.4);font:600 9px/1 'IBM Plex Mono',monospace;" +
      'letter-spacing:.1em', l));
  }

  const grid = $('cal-grid');
  clear(grid);
  // Weeks run Monday to Sunday, so the week is one block and the weekend closes it
  // rather than being split across the two ends of the row. getDay() counts from
  // Sunday, which is one column too far left here.
  const pad = (new Date(m.getFullYear(), m.getMonth(), 1).getDay() + 6) % 7;
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

  // Never page past the current month, or back past where the log begins. The glyph
  // stays put and only dims, so the pair does not go lopsided on the month you are
  // almost always looking at.
  const now = monthStart(new Date());
  $('cal-next').classList.toggle('off', m >= now);
  $('cal-prev').classList.toggle('off', m <= calFloor());
}

function shiftMonth(delta) {
  const m = ui.calMonth || monthStart(new Date());
  const next = new Date(m.getFullYear(), m.getMonth() + delta, 1);
  if (next > monthStart(new Date()) || next < calFloor()) return;
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
  ui.showTotal = false;
  if (ui.fresh) { ui.display = d === '.' ? '0.' : d; ui.fresh = false; return render(); }
  if (d === '.' && ui.display.indexOf('.') > -1) return;
  if (ui.display.replace('-', '').replace('.', '').length >= 4) return;
  ui.display = ui.display === '0' && d !== '.' ? d : ui.display + d;
  render();
}

function setOp(op) {
  ui.showTotal = false;
  const cur = parseFloat(ui.display) || 0;
  const next = ui.op != null && !ui.fresh ? apply(ui.pending, cur, ui.op) : cur;
  ui.pending = next;
  ui.op = op;
  ui.display = fmt(next);
  ui.fresh = true;
  render();
}

/** Returns true only when an ingredient was added (not when an expression resolved). */
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
  if (!val || !addIngredient(val)) return false;
  ui.display = '0';
  ui.fresh = true;
  ui.showTotal = true;        // the dial now reads the meal, not this ingredient
  render();
  return true;
}

/** What the typed figure would add if it were committed now. */
function typedValue() {
  if (ui.showTotal) return 0;
  const cur = parseFloat(ui.display) || 0;
  return ui.op != null && !ui.fresh ? apply(ui.pending, cur, ui.op) : cur;
}

function del() {
  ui.showTotal = false;
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
  ui.showTotal = false;
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

// Measured once per render and held for the frames in between: the arc's edge decides
// each piece of type's colour as it passes, and measuring on every frame would put a
// layout in the middle of an animation.
let calcZones = [];
let calcJump = true;

function paintCalcArc(sweep) {
  // Each piece of type takes its colour from what ends up behind it, independently.
  for (const i of calcZones) i.paint.style.color = sweep >= i.exit ? '#270E0E' : '#FF0000';

  const on = sweep > 0.05;
  const lead = CALC_ARC_ANCHOR - sweep;
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
}

const calcArc = makeEase(paintCalcArc);

function renderCalc() {
  const g = goal();
  const logged = viewLogged();
  // The meal in hand counts toward the ring while it is being built, even though it
  // has not reached the day's total yet - that is what committing it does.
  // The ring can only say 100%, but the readout says what it actually is.
  const raw = (logged + openTotal() + Math.max(typedValue(), 0)) / g;
  const pct = clamp(raw, 0, 1);

  $('calc-pct-ink').textContent = Math.round(raw * 100) + '%';
  renderSegments(ui.showTotal ? String(openTotal()) : ui.display);

  // Keep the arc's leading edge out of the type on the band. Half-covered, a word has no
  // single readable colour; snapped clear of it, one flat colour always works. Only
  // where it comes to rest, though - on the way there it crosses whatever it crosses.
  let sweep = pct * 360;
  calcZones = coverIntervals();
  const merged = calcZones
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
  calcArc.to(sweep, calcJump);
  calcJump = false;

  const entries = viewEntries().concat(viewOpen()).slice(-16);

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
  if (!isCalc) renderHistory();
}

// How long a tapped tile stays armed. Long enough not to be a race, short enough that
// a tile left black is never stale: when the window shuts the tile goes back to red,
// so what you see is always what a second tap would do.
const ARM_MS = 1200;
let armTimer = 0;
document.documentElement.style.setProperty('--arm-ms', ARM_MS + 'ms');

function armTile(t) {
  clearTimeout(armTimer);
  ui.selTile = t;
  armTimer = setTimeout(() => {
    if (ui.selTile !== t) return;
    ui.selTile = null;
    render();
  }, ARM_MS);
}

function disarmTile() {
  clearTimeout(armTimer);
  ui.selTile = null;
}

// The parallelogram's slant, which is also how far each tile is pulled back over the
// last so the two interlock instead of leaving a wedge of ground between them.
const TILE_W = 172.67;
const TILE_SLANT = 60;
const TILE_GAP = 8;
const TILE_PITCH = TILE_W - TILE_SLANT + TILE_GAP;
const HIST_W = 354;          // the strip, the canvas less its 24px margins

const BRACKET_H = 34;        // headroom cut off the top of the tiles for the meal bars

/** The day's ingredients in meals, oldest first, with the meal still open at the end. */
function mealRows() {
  const byMeal = new Map();
  for (const e of viewEntries()) {
    if (!byMeal.has(e.m)) byMeal.set(e.m, []);
    byMeal.get(e.m).push(e);
  }
  const rows = [...byMeal.entries()].sort((a, b) => a[0] - b[0]).map(g => g[1]);
  const open = viewOpen();
  if (open.length) rows.push(open.slice());
  return rows;
}

function histCount() { return viewEntries().length + viewOpen().length; }

function histContent() {
  const n = histCount();
  return n ? (n - 1) * TILE_PITCH + TILE_W : 0;
}

/** How far the row can be dragged; zero while it still fits, which disables the drag. */
function histOverflow() {
  return Math.max(0, histContent() - HIST_W);
}

function renderHistory() {
  const host = $('calc-history');
  clear(host);
  const rows = mealRows();

  if (!histCount()) {
    host.appendChild(el('div',
      "color:#FF0000;font:600 11px/1 'IBM Plex Mono',monospace;letter-spacing:.16em;padding:6px 0",
      'NO ENTRIES TODAY'));
    return;
  }

  // Centred while the row fits, hard left once it overruns - so a short day still sits
  // where it used to, and a long one starts at the beginning and runs off the edge.
  const over = histOverflow();
  ui.histX = clamp(ui.histX, 0, over);
  const track = el('div',
    'position:absolute;top:0;bottom:0;left:' + (over ? 0 : (HIST_W - histContent()) / 2).toFixed(2) +
    'px;width:' + histContent().toFixed(2) + 'px;will-change:transform;' +
    'transform:translateX(' + (-ui.histX).toFixed(2) + 'px)');
  const strip = el('div',
    'position:absolute;left:0;right:0;top:' + BRACKET_H + 'px;bottom:0;display:flex;' +
    'align-items:stretch;gap:' + TILE_GAP + 'px');
  track.appendChild(strip);
  host.appendChild(track);

  let at = 0;
  rows.forEach((items, mi) => {
    // A tile's top edge runs from its slant to its full width, so a meal's bar spans
    // from the first tile's top left corner to the last one's top right.
    const x0 = at * TILE_PITCH + TILE_SLANT;
    const x1 = (at + items.length - 1) * TILE_PITCH + TILE_W;
    const span = 'position:absolute;left:' + x0.toFixed(2) + 'px;width:' + (x1 - x0).toFixed(2) + 'px;';
    track.appendChild(el('div', span + 'top:' + (BRACKET_H - 9) + 'px;height:2px;background:#FF0000'));
    track.appendChild(el('div',
      span + "top:0;text-align:center;color:#FF0000;font:600 13px/1 'IBM Plex Mono',monospace;" +
      'letter-spacing:.1em', String(mi + 1)));
    at += items.length;
    renderTiles(items, strip);
  });
}

function renderTiles(entries, strip) {
  entries.forEach(e => {
    const on = ui.selTile === e.t;
    const tile = el('div',
      'position:relative;flex:none;width:' + TILE_W + 'px;margin-right:-' + TILE_SLANT + 'px;' +
      'clip-path:polygon(' + TILE_SLANT + 'px 0,100% 0,calc(100% - ' + TILE_SLANT +
      'px) 100%,0 100%);display:flex;' +
      'flex-direction:column;align-items:center;justify-content:center;gap:2px;overflow:hidden;' +
      'transition:background .1s,color .1s;background:' + (on ? '#000000' : '#FF0000') +
      ';color:' + (on ? '#FF0000' : '#270E0E'));
    tile.className = on ? 'tile armed' : 'tile';
    tile.appendChild(el('div',
      "font:800 62px/.82 'Big Shoulders Display',sans-serif;letter-spacing:-.02em", String(e.v)));
    tile.appendChild(el('div',
      "font:600 10px/1 'IBM Plex Mono',monospace;letter-spacing:.2em", 'CAL'));
    tile.appendChild(el('div',
      "position:absolute;left:9px;bottom:13px;font:600 12px/1 'IBM Plex Mono',monospace;letter-spacing:.1em",
      clock(e.t)));
    // Two deliberate taps rather than a double-click. The browser pairs a double-click
    // by target, and the first tap rebuilds this row, so the node it landed on is gone
    // before the second arrives - which is why deleting only worked about half the time.
    tile.addEventListener('click', () => {
      if (ui.selTile === e.t) {
        disarmTile();
        removeEntry(e.t);
      } else {
        armTile(e.t);
      }
      render();
    });
    strip.appendChild(tile);
  });
}

// ══════════════════════════ STATS ══════════════════════════
// Today sits where Friday does in the seven-day view rather than hard against the right
// edge, so every range keeps the same slice of itself ahead of today. Both tracks hang
// off one window end, which is what keeps the sage chart and the red panel on the same
// days even though they bucket at different widths.
const TODAY_AT = 4.5 / 7;    // where Friday's slot centres in a row of seven

// Solving (n - f - 0.5) / n = TODAY_AT for the slot count f left ahead of today. Taking
// the share of slots instead would drift, because today's own slot counts on the left.
const futureSlots = cfg => Math.max(1, Math.round(cfg.n * (1 - TODAY_AT) - 0.5));

// ui.scrub is a real number of days and slides freely. Only the tracks' transform reads
// it continuously; every slot is still built on a whole day, so the pixels move with the
// finger while the data underneath stays on its grid. Slots either side of the visible
// run are built too, which is what the drag slides into, and what gets clipped.
const OVERSCAN = 6;

/** Slot width and centre-to-centre pitch for a track of n slots across the 354px chart. */
function pitchOf(n, gap) {
  const w = (354 - (n - 1) * gap) / n;
  return { w: w, pitch: w + gap };
}

/** The whole-slot position the DOM is built at; the remainder becomes the transform. */
function scrubBase() {
  const cfg = STATS_RANGES[ui.range];
  return Math.round(ui.scrub / cfg.step) * cfg.step;
}

/** Day index of the window's most recent slot. Negative days are in the future. */
function windowEnd(base) {
  const cfg = STATS_RANGES[ui.range];
  return (base == null ? scrubBase() : base) - futureSlots(cfg) * cfg.step;
}

/** How far the window may be dragged: back to the oldest entry, forward only a little. */
function scrubBounds() {
  const cfg = STATS_RANGES[ui.range];
  const span = cfg.n * cfg.step;
  const oldest = store.entries.length
    ? (daysBack(new Date(store.entries[0].t)) || 0) : 0;
  return {
    min: -Math.ceil(futureSlots(cfg) / 2) * cfg.step,
    max: Math.max(span, oldest + futureSlots(cfg) * cfg.step)
  };
}

function bucketAt(d, step) {
  let sum = 0;
  for (let k = 0; k < step; k++) sum += dayCal(d + k);
  return { d: d, v: Math.round(sum / step) };
}

/** The visible run only - overscan is for the drag to slide into, not to average in. */
function buckets(range) {
  const cfg = STATS_RANGES[range];
  const end = windowEnd();
  const out = [];
  for (let i = 0; i < cfg.n; i++) out.push(bucketAt(end + (cfg.n - 1 - i) * cfg.step, cfg.step));
  return out;
}

/** Start of the bucket of the given width that the day falls in. */
function bucketStart(d, step) {
  const end = windowEnd();
  return end + Math.floor((d - end) / step) * step;
}

/**
 * Dates every so many days rather than at the ends of the track: a tick tied to a day
 * survives the slide, where a label pinned to the left edge would just sit there while
 * the chart moved underneath it.
 */
function tickEvery(cfg) {
  return cfg.step * Math.max(1, Math.round(cfg.n / 6));
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

/**
 * Empties a host and gives it a track wide enough to hold the overscan on both sides,
 * hung far enough left that slot OVERSCAN lands where slot 0 used to. Everything the
 * drag moves lives on one of these, so sliding is one transform per track.
 */
function makeTrack(host, geom, extra) {
  clear(host);
  const total = host.dataset.slots;
  const track = el('div',
    'position:absolute;top:0;bottom:0;left:' + (-OVERSCAN * geom.pitch).toFixed(3) +
    'px;width:' + (total * geom.pitch).toFixed(3) + 'px;will-change:transform;' + (extra || ''));
  host.appendChild(track);
  return track;
}

function renderStats() {
  const g = goal();
  const range = ui.range;
  const cfg = STATS_RANGES[range];
  const base = scrubBase();
  const end = windowEnd(base);
  const geom = pitchOf(cfg.n, cfg.gap);
  const total = cfg.n + 2 * OVERSCAN;
  const barScale = g / GOAL_AT;
  const tick = tickEvery(cfg);
  domBase = base;

  updateHero();
  updateGoalLabel();
  $('stats-range-btn').textContent = range;

  const barHost = $('stats-bars');
  barHost.dataset.slots = total;
  const barTrack = makeTrack(barHost, geom,
    'display:flex;align-items:flex-end;gap:' + cfg.gap + 'px');

  const xHost = $('stats-xlabels');
  xHost.dataset.slots = total;
  const xTrack = makeTrack(xHost, geom);
  const labelStyle = "position:absolute;top:0;white-space:nowrap;font:600 9px/1 'IBM Plex Mono',monospace;letter-spacing:.1em;color:#4A5046";

  for (let j = 0; j < total; j++) {
    const b = bucketAt(end + (cfg.n - 1 + OVERSCAN - j) * cfg.step, cfg.step);
    const ahead = b.d < 0;
    const on = ui.selDay != null && b.d === ui.selDay;
    const slot = el('div',
      'width:' + geom.w.toFixed(3) + 'px;flex:none;height:100%;display:flex;' +
      'align-items:flex-end;justify-content:center' + (ahead ? '' : ';cursor:pointer'));
    slot.dataset.day = b.d;
    // Over or under is judged against the maximum that day was actually kept to, not
    // against whatever the figure has since been changed to.
    const fill = ui.selDay == null
      ? (b.v > goalOn(b.d) ? '#FF0000' : '#270E0E')
      : (on ? '#FF0000' : '#A9AE99');
    slot.appendChild(el('div',
      'width:' + cfg.w + ';max-width:100%;height:' +
      Math.min(100, (b.v / barScale) * 100).toFixed(2) + '%;background:' + fill +
      ';border-radius:' + cfg.cap));
    if (!ahead) {
      slot.addEventListener('click', () => {
        const off = ui.selDay === b.d;
        ui.selDay = off ? null : b.d;
        ui.mealSelDay = off ? null : bucketStart(b.d, MEALS_CFG[ui.range].step);
        render();
      });
    }
    barTrack.appendChild(slot);

    const text = range === '7D'
      ? (b.d === 0 ? 'today' : dayAt(b.d).toLocaleDateString('en-US', { weekday: 'narrow' }))
      : (b.d === 0 ? 'today'
        : b.d % tick === 0 ? dayAt(b.d).getDate() + ' ' + mon(b.d) : '');
    if (text) {
      xTrack.appendChild(el('div',
        labelStyle + ';left:' + (j * geom.pitch + geom.w / 2).toFixed(2) +
        'px;transform:translateX(-50%)', text));
    }
  }

  renderGoalRule(end, cfg, geom, total, g);
  renderMeals();
  applyScrub();
}

/**
 * The label annotates the rule where it comes in at the left edge, so it reads the
 * figure that stretch of days was actually kept to. While the maximum has never changed
 * inside the window that is simply the current one, at the height it has always sat at.
 */
function updateGoalLabel() {
  const cfg = STATS_RANGES[ui.range];
  const left = Math.round(ui.scrub) + (cfg.n - 1 - futureSlots(cfg)) * cfg.step;
  const v = goalOn(left);
  $('stats-goal-value').textContent = nf(v);
  $('stats-goal-line').style.bottom =
    (clamp((GOAL_AT * v) / goal(), 0, 1) * 100).toFixed(2) + '%';
}

/**
 * The goal rule, one piece per run of days that shared a maximum. While the figure has
 * never changed that is a single dashed line across the chart, exactly as before; once
 * it has, the rule steps at the day it moved, and the step is what says so.
 */
function renderGoalRule(end, cfg, geom, total, g) {
  const host = $('stats-goal-track');
  host.dataset.slots = total;
  const track = makeTrack(host, geom);
  // Measured on the bars' own scale, so the rule sits where a bar of that many
  // calories would end - which is what makes a bar poking above it mean anything.
  const pctOf = v => clamp((GOAL_AT * v) / g, 0, 1) * 100;
  const dayOf = j => end + (cfg.n - 1 + OVERSCAN - j) * cfg.step;

  // Where one stretch hands over to the next: the middle of the gap between their two
  // slots, which is where the riser stands. Both stretches run to it and stop, so the
  // step is the end of one line and the start of the other, not something that crosses
  // a dash halfway and leaves a stub of it on the far side. The track's own ends are
  // not handovers and simply run out.
  const edge = k => (k <= 0 ? 0
    : k >= total ? total * geom.pitch
    : k * geom.pitch - cfg.gap / 2);

  let from = 0;
  let held = goalOn(dayOf(0));
  for (let j = 1; j <= total; j++) {
    const v = j < total ? goalOn(dayOf(j)) : null;
    if (v === held) continue;
    const left = edge(from).toFixed(2);
    const wide = (edge(j) - edge(from)).toFixed(2);
    // A maximum far enough above the one in force now puts its rule level with one of
    // the grey lines above the chart. Two lines at the same height read as one line
    // broken up, so the grey gives way for the length of the red and picks up after:
    // laid on the same track, the break travels with the stretch it belongs to.
    const y = CHART_H * (1 - pctOf(held) / 100) - 2;
    if (RULE_YS.some(r => y < r + 1 - CHART_TOP && y + 2 > r - CHART_TOP)) {
      // Taken back past the red at both ends, so the two never come to a point where
      // they touch: the ground between them is what says where one stops and the other
      // starts, which a dash and a rule meeting end to end cannot.
      track.appendChild(el('div',
        'position:absolute;left:' + (edge(from) - RULE_SEP).toFixed(2) +
        'px;width:' + (edge(j) - edge(from) + 2 * RULE_SEP).toFixed(2) + 'px;top:' +
        y.toFixed(2) + 'px;height:2px;background:#C0C3B0'));
    }
    track.appendChild(el('div',
      'position:absolute;left:' + left + 'px;width:' + wide +
      'px;bottom:' + pctOf(held).toFixed(2) +
      '%;height:0;border-top:2px dashed #FF0000'));
    // Every stretch but the first is labelled where it starts, since the one label the
    // design pins at the left edge can only speak for the stretch it sits on.
    if (from > 0) {
      track.appendChild(el('div',
        'position:absolute;left:' + (edge(from) + 4).toFixed(2) + 'px;bottom:' +
        pctOf(held).toFixed(2) + '%;transform:translateY(50%);background:#C0C3B0;' +
        "padding:3px 6px 3px 4px;font:600 9px/1 'IBM Plex Mono',monospace;" +
        'letter-spacing:.1em;color:#FF0000;white-space:nowrap', nf(held)));
    }
    if (v != null) {
      // The riser marks the change; it is not a corner of either line. Left short of
      // both, it stays a third mark of its own - welded on, it reads as one line bent
      // in the middle, which is the one thing the step is there to say it is not.
      // Each line's ink sits in the 2px above the height it is drawn at.
      const a = pctOf(held), b = pctOf(v);
      const lo = (CHART_H * Math.min(a, b)) / 100 + 2 + RISER_GAP;
      const hi = (CHART_H * Math.max(a, b)) / 100 - RISER_GAP;
      if (hi > lo) {
        track.appendChild(el('div',
          'position:absolute;left:' + (edge(j) - 1).toFixed(2) + 'px;width:2px;bottom:' +
          lo.toFixed(2) + 'px;height:' + (hi - lo).toFixed(2) + 'px;background:#FF0000'));
      }
    }
    from = j;
    held = v;
  }
}

/** The one piece of the screen that reads the window rather than a single day. */
function updateHero() {
  const cfg = STATS_RANGES[ui.range];
  const cur = buckets(ui.range);
  // Slots ahead of today hold nothing by definition; averaging them in would just
  // scale the figure down by the width of the headroom.
  const real = cur.filter(b => b.d >= 0);
  const avg = real.length
    ? Math.round(real.reduce((a, b) => a + b.v, 0) / real.length) : 0;
  const selBar = ui.selDay != null ? bucketAt(ui.selDay, cfg.step) : null;

  $('stats-hero-caption').textContent = selBar
    ? (cfg.step === 1
        ? dayAt(selBar.d).toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() +
          ' ' + dayAt(selBar.d).getDate() + ' ' + mon(selBar.d).toUpperCase()
        : 'WEEK OF ' + dayAt(selBar.d).getDate() + ' ' + mon(selBar.d).toUpperCase())
    : 'AVERAGE PER ' + ui.range.replace('D', ' DAYS').replace('1Y', 'YEAR');
  $('stats-hero-value').textContent = nf(selBar ? selBar.v : avg);
}

function renderMeals() {
  const range = ui.range;
  const cfg = MEALS_CFG[range];
  const bcfg = STATS_RANGES[range];
  const n = cfg.n;
  const total = n + 2 * OVERSCAN;
  const geom = pitchOf(n, cfg.cg);
  const end = windowEnd();
  const tick = tickEvery(cfg);
  const dimmed = ui.mealSelDay != null;
  // 7D prints the times inside its larger dots; denser ranges use the detail panel.
  const inDots = cfg.step === 1 && cfg.dot >= 20;
  let selCol = null, selTimes = null;

  const labelHost = $('stats-meal-labels');
  labelHost.dataset.slots = total;
  const labelTrack = makeTrack(labelHost, geom);
  const ls = "position:absolute;top:0;white-space:nowrap;font:600 9px/1 'IBM Plex Mono',monospace;letter-spacing:.1em;opacity:.7";

  const colHost = $('stats-meal-cols');
  colHost.dataset.slots = total;
  const colTrack = makeTrack(colHost, geom,
    'display:flex;align-items:flex-start;gap:' + cfg.cg + 'px');

  for (let j = 0; j < total; j++) {
    const d = end + (n - 1 + OVERSCAN - j) * cfg.step;
    let sum = 0;
    for (let k = 0; k < cfg.step; k++) sum += mealsAt(d + k);
    const c = { d: d, v: Math.min(ROWS, Math.round(sum / cfg.step)) };
    const times = bucketTimes(c.d, cfg.step);
    const on = ui.mealSelDay != null && c.d === ui.mealSelDay;
    if (on) { selCol = c; selTimes = times; }

    const fill = on ? '#000000' : dimmed ? 'rgba(39,14,14,.34)' : '#270E0E';
    const off = on ? 'rgba(0,0,0,.2)' : dimmed ? 'rgba(39,14,14,.12)' : 'rgba(39,14,14,.22)';
    // A column whose every day is still ahead of today can never hold a meal, so it
    // does not answer to a tap. Columns that straddle today still do.
    const ahead = c.d + cfg.step - 1 < 0;
    const col = el('div',
      'position:relative;width:' + geom.w.toFixed(3) + 'px;flex:none;display:flex;' +
      'flex-direction:column;align-items:center;gap:' + cfg.dg +
      'px;padding-bottom:26px' + (ahead ? '' : ';cursor:pointer'));
    col.dataset.day = c.d;
    for (let r = 0; r < ROWS; r++) {
      const lit = r < c.v;
      const dot = el('div',
        'position:relative;width:' + cfg.dot + 'px;height:' + cfg.dot +
        'px;border-radius:50%;background:' + (lit ? fill : off) + ';flex:none');
      const label = on && lit && inDots && times[r] != null ? hhmm(times[r]) : '';
      dot.appendChild(el('div',
        "position:absolute;inset:0;display:flex;align-items:center;justify-content:center;white-space:nowrap;font:600 10.5px/1 'IBM Plex Mono',monospace;letter-spacing:0;color:" +
        (label ? '#FF0000' : 'transparent'), label));
      col.appendChild(dot);
    }
    if (!ahead) {
      col.addEventListener('click', () => {
        const drop = ui.mealSelDay === c.d;
        ui.mealSelDay = drop ? null : c.d;
        ui.selDay = drop || cfg.step > bcfg.step * 2
          ? null : bucketStart(c.d, bcfg.step);
        render();
      });
    }
    colTrack.appendChild(col);

    const text = range === '7D' || range === '1Y'
      ? String(c.v)
      : (c.d === 0 ? 'today'
        : c.d % tick === 0 ? dayAt(c.d).getDate() + ' ' + mon(c.d) : '');
    if (text) {
      labelTrack.appendChild(el('div',
        ls + ';left:' + (j * geom.pitch + geom.w / 2).toFixed(2) +
        'px;transform:translateX(-50%)', text));
    }
  }

  // selected-day detail panel (30D and denser)
  const panel = $('stats-sel-times');
  const showPanel = selCol != null && !inDots;
  panel.style.display = showPanel ? 'flex' : 'none';
  if (showPanel) {
    panel.style.top = (37 + ROWS * (cfg.dot + cfg.dg) + 14) + 'px';
    $('stats-sel-caption').textContent = selCol.v + (selCol.v === 1 ? ' MEAL' : ' MEALS');
    const list = $('stats-sel-list');
    clear(list);
    selTimes.forEach((h, r) => {
      const item = el('div', 'display:flex;flex-direction:column;gap:4px;color:#FF0000');
      item.appendChild(el('div',
        "font:600 9.5px/1 'IBM Plex Mono',monospace;letter-spacing:.14em;color:#FF6A58",
        String(r + 1).padStart(2, '0')));
      item.appendChild(el('div',
        'font:900 29px/.82 Archivo,sans-serif;letter-spacing:-.035em', hhmm(h)));
      list.appendChild(item);
    });
  }

  // Average meal times over the visible run. The overscan columns are built for the
  // drag to slide into and are off screen, so they do not get a say.
  const seen = [];
  for (let i = 0; i < n; i++) seen.push(bucketTimes(end + i * cfg.step, cfg.step));
  const avgTimes = [];
  for (let r = 0; r < ROWS; r++) {
    const vals = seen.map(t => t[r]).filter(v => v != null);
    if (vals.length >= Math.max(2, n * 0.5)) {
      avgTimes.push(hhmm(vals.reduce((a, b) => a + b, 0) / vals.length));
    }
  }
  $('stats-meals-big').textContent = avgTimes.length ? avgTimes.slice(0, 2).join(', ') : 'NO DATA';
  $('stats-meals-caption').textContent = 'AVERAGE MEAL TIMES PER ' +
    (range === '1Y' ? 'YEAR' : range.replace('D', ' DAYS'));
}

// ══════════════════════════ SETTINGS ══════════════════════════
// A sheet rather than a screen: it comes up over whatever you were looking at, and the
// strip of that screen left showing along the top is what says it can be pushed back
// down. Everything on it takes effect where it is set - there is nothing to save.

const SHEET_MS = 300;
const SHEET_DISMISS = 110;   // canvas px of travel that count as putting it away
const SHEET_FLICK = 0.35;    // or px per ms over a shorter push, which is a flick
const SHEET_FLICK_MIN = 40;  // but never on a nudge, however fast it happened to be
document.documentElement.style.setProperty('--sheet-ms', SHEET_MS + 'ms');
let sheetTimer = 0, flashTimer = 0;

function openSettings() {
  if (ui.settings) return;
  ui.settings = true;
  clearTimeout(sheetTimer);
  clearTimeout(flashTimer);
  setNote = null;
  const box = $('settings');
  box.style.display = 'block';
  renderSettings();
  void box.offsetWidth;      // laid out closed first, so it rises instead of appearing
  box.classList.add('open');
}

function closeSettings() {
  if (!ui.settings) return;
  closeAsk();
  commitGoal();
  ui.settings = false;
  const box = $('settings');
  box.classList.remove('open', 'dragging');
  $('settings-sheet').style.transform = '';   // back under the class's control
  const on = document.activeElement;
  if (on && on.blur) on.blur();
  clearTimeout(sheetTimer);
  sheetTimer = setTimeout(() => { if (!ui.settings) box.style.display = 'none'; }, SHEET_MS);
}

/** Ten years back, which is further than anyone will page and short of the epoch. */
function startFloor() {
  const d = monthStart(new Date());
  d.setFullYear(d.getFullYear() - 10);
  return d;
}

function shiftStart(delta) {
  const cur = monthStart(new Date(Number.isFinite(store.start) ? store.start : Date.now()));
  const next = new Date(cur.getFullYear(), cur.getMonth() + delta, 1);
  if (next > startCeil() || next < startFloor()) return;
  store.start = next.getTime();
  save();
  // The calendar may be sitting on a month that has just gone out of reach.
  if (ui.calMonth && ui.calMonth < calFloor()) ui.calMonth = calFloor();
  renderSettings();
  render();
}

const goalDigits = () => Math.round(Number(String($('set-goal').value).replace(/[^0-9]/g, '')));

/** Taken as it is typed, so the screen behind answers, but left alone otherwise: a
    half-typed figure is not a decision and must not be tidied up or clamped yet. */
function typeGoal() {
  const v = goalDigits();
  if (v > 0 && v <= 20000) { setGoal(v); render(); }
}

function commitGoal() {
  const v = goalDigits();
  setGoal(clamp(v > 0 ? v : goal(), 100, 20000));
  $('set-goal').value = nf(goal());
  render();
}

// ── asking first ──
// EXPORT can be done again. The other two cannot be taken back, and a word in a list is
// one tap away from the word above it, so neither goes ahead on the strength of a tap
// that landed on the sheet - they are asked in a panel of their own, over everything.
const SET_WORDS = { 'set-export': 'EXPORT', 'set-import': 'IMPORT', 'set-delete': 'DELETE' };
const ASK_MS = 180;
const ASKS = {
  'set-delete': {
    text: 'THIS WILL DELETE ALL STORED DATA.',
    note: 'IT CANNOT BE UNDONE',
    yes: 'DELETE'
  },
  'set-import': {
    text: 'THIS WILL REPLACE ALL STORED DATA.',
    note: 'WHATEVER IS IN THE FILE TAKES ITS PLACE',
    yes: 'REPLACE'
  }
};
document.documentElement.style.setProperty('--ask-ms', ASK_MS + 'ms');

let askWhich = null;         // which word is being asked about, if any
let askTimer = 0;
let setNote = null;          // { id, text } - what a word did, said briefly in its place

function openAsk(which) {
  const cfg = ASKS[which];
  if (!cfg) return;
  clearTimeout(askTimer);
  askWhich = which;
  $('ask-text').textContent = cfg.text;
  $('ask-note').textContent = cfg.note;
  $('ask-yes').textContent = cfg.yes;
  const box = $('ask');
  box.style.display = 'block';
  void box.offsetWidth;      // laid out shut first, so it comes up rather than appearing
  box.classList.add('open');
}

function closeAsk() {
  if (!askWhich) return;
  askWhich = null;
  const box = $('ask');
  box.classList.remove('open');
  clearTimeout(askTimer);
  askTimer = setTimeout(() => { if (!askWhich) box.style.display = 'none'; }, ASK_MS);
}

function flash(id, text) {
  clearTimeout(flashTimer);
  setNote = { id: id, text: text };
  renderSettings();
  flashTimer = setTimeout(() => { setNote = null; renderSettings(); }, 1800);
}

function exportData() {
  const d = new Date();
  const name = 'intake-' + d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' }));
  const a = el('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  flash('set-export', 'EXPORTED');
}

/**
 * Reads a file back in, in place of everything held rather than alongside it: what comes
 * out is exactly what went into the file, which is the only reading of a backup that can
 * be relied on. Returns how many entries it loaded, or null if the file was not ours.
 */
function importData(text) {
  let parsed = null;
  try { parsed = JSON.parse(text); } catch (e) { return null; }
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.entries)) return null;
  const inc = normalize(parsed);
  store.entries = inc.entries;
  store.open = inc.open;
  store.goal = inc.goal;
  store.goals = inc.goals;
  store.start = inc.start;          // null in an old file; the first run below settles it
  settle();
  return store.entries.length;
}

/** Everything held, thrown away. The maximum is a setting rather than something logged,
    so it stays - but the figures it used to be went with the days they applied to. */
function deleteData() {
  store.entries = [];
  store.open = [];
  store.goals = [{ t: 0, v: store.goal }];
  store.start = null;               // the log begins again from here
  settle();
}

/** Puts the app back on its feet after the whole store has been replaced under it. */
function settle() {
  save();
  reindex();
  ensureStart();
  disarmTile();
  ui.day = 0;
  ui.selDay = null;
  ui.mealSelDay = null;
  ui.scrub = 0;
  ui.histX = 0;
  ui.display = '0';
  ui.pending = null;
  ui.op = null;
  ui.fresh = true;
  ui.showTotal = openTotal() > 0;
  // The month on show may no longer be one the log reaches back to.
  if (ui.calMonth && ui.calMonth < calFloor()) ui.calMonth = calFloor();
}

function renderSettings() {
  for (const id of Object.keys(SET_WORDS)) {
    const note = setNote && setNote.id === id ? setNote.text : null;
    $(id).textContent = note || SET_WORDS[id];
  }

  const input = $('set-goal');
  if (document.activeElement !== input) input.value = nf(goal());
  const s = monthStart(new Date(Number.isFinite(store.start) ? store.start : Date.now()));
  $('set-start').textContent = CAL_MONTHS[s.getMonth()] + ' ' + s.getFullYear();
  $('set-start-prev').classList.toggle('off', s <= startFloor());
  $('set-start-next').classList.toggle('off', s >= startCeil());
}

// ── render ───────────────────────────────────────────────────────────────────
function render() {
  if (ui.screen === 'home') renderHome();
  else if (ui.screen === 'calc') renderCalc();
  else if (ui.screen === 'calendar') renderCalendar();
  else renderStats();
  if (ui.settings) renderSettings();
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

// The same circle in the same corner on every screen, so it is one thing in one place.
for (const id of ['home-settings-btn', 'cal-settings-btn', 'calc-settings-btn', 'stats-settings-btn']) {
  $(id).addEventListener('click', openSettings);
}
// No button to close it: the sheet is pushed back down, or the screen it came up over
// is tapped. Both are the same gesture read two ways, and neither is a control.
$('settings-scrim').addEventListener('click', closeSettings);

// The warning leads to the only thing that will keep a day when storage will not.
$('alarm').addEventListener('click', openSettings);
$('set-start-prev').addEventListener('click', () => shiftStart(-1));
$('set-start-next').addEventListener('click', () => shiftStart(1));
$('set-goal').addEventListener('input', typeGoal);
$('set-goal').addEventListener('change', commitGoal);
$('set-goal').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
$('set-export').addEventListener('click', exportData);

// Asked before the picker opens, not after a file has been chosen: by then the answer
// would be about a file, when the question is about everything already logged.
$('set-import').addEventListener('click', () => openAsk('set-import'));
$('set-delete').addEventListener('click', () => openAsk('set-delete'));

$('ask-no').addEventListener('click', closeAsk);
$('ask-scrim').addEventListener('click', closeAsk);

$('ask-yes').addEventListener('click', () => {
  const which = askWhich;
  closeAsk();
  if (which === 'set-delete') {
    deleteData();
    flash('set-delete', 'DELETED');
    render();
  } else if (which === 'set-import') {
    $('set-file').value = '';      // so choosing the same file twice still counts
    $('set-file').click();         // still inside the tap, which is what opens a picker
  }
});

$('set-file').addEventListener('change', e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const n = importData(String(reader.result));
    if (n === null) return flash('set-import', 'BAD FILE');
    flash('set-import', 'LOADED ' + n);
    render();
  };
  reader.onerror = () => flash('set-import', 'BAD FILE');
  reader.readAsText(file);
});

// Pushed back down rather than dismissed: the sheet tracks the finger, and lets go only
// if it was pushed far enough or fast enough to have been meant.
const sheet = $('settings-sheet');
let sheetFrom = null, sheetMoved = false;

sheet.addEventListener('pointerdown', e => {
  sheetMoved = false;
  // The figure is typed into the screen itself, so the field keeps its own gestures.
  sheetFrom = e.target.closest('#set-goal')
    ? null : { y: e.clientY, t: e.timeStamp, dy: 0, vel: 0 };
});

sheet.addEventListener('pointermove', e => {
  if (!sheetFrom) return;
  const dy = (e.clientY - sheetFrom.y) / (scale || 1);
  if (!sheetMoved) {
    if (dy < 5) return;                        // downward only; upward is not a gesture
    sheetMoved = true;
    $('settings').classList.add('dragging');
    try { sheet.setPointerCapture(e.pointerId); } catch (_) { /* gone already */ }
  }
  const shift = Math.max(0, dy);
  if (e.timeStamp > sheetFrom.t) {
    sheetFrom.vel = (shift - sheetFrom.dy) / (e.timeStamp - sheetFrom.t);
  }
  sheetFrom.dy = shift;
  sheetFrom.t = e.timeStamp;
  sheet.style.transform = 'translateY(' + shift.toFixed(2) + 'px)';
});

function releaseSheet(e) {
  const s = sheetFrom;
  sheetFrom = null;
  if (!s || !sheetMoved) return;
  try { sheet.releasePointerCapture(e.pointerId); } catch (_) { /* already gone */ }
  $('settings').classList.remove('dragging');
  if (s.dy > SHEET_DISMISS || (s.dy > SHEET_FLICK_MIN && s.vel > SHEET_FLICK)) closeSettings();
  else sheet.style.transform = '';            // springs back under the transition
}
sheet.addEventListener('pointerup', releaseSheet);
sheet.addEventListener('pointercancel', releaseSheet);

// A push that ends over something tappable must not also tap it.
sheet.addEventListener('click', e => {
  if (!sheetMoved) return;
  sheetMoved = false;
  e.stopPropagation();
  e.preventDefault();
}, true);

$('home-stats-btn').addEventListener('click', () => go('stats'));
$('home-open-calc').addEventListener('click', () => go('calc'));
$('stats-home-btn').addEventListener('click', () => go('home'));

// Leaving by the cross throws the meal away; nothing it held was ever committed.
$('calc-close').addEventListener('click', () => { cancelMeal(); clearCalc(); go('home'); });

// The dial finalises the meal. A figure typed but never added joins it first, so a
// single-ingredient meal is still one tap.
$('calc-dial-btn').addEventListener('click', () => {
  addIngredient(typedValue());
  // Nothing in hand is not a mistake to be refused: the dial is also the way back, and
  // a button that answers a press by doing nothing at all is just a broken one.
  if (commitMeal()) ui.animHome = true;
  go('home');
});
$('calc-view-toggle').addEventListener('click', () => {
  ui.view = ui.view === 'calc' ? 'history' : 'calc';
  disarmTile();
  ui.histX = 0;
  histSlider.stop();
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
  ui.selDay = null;
  ui.mealSelDay = null;
  ui.scrub = 0;              // slots change width, so an offset would not carry over
  statsSlider.stop();
  render();
});

// ── scrubbing the stats window ───────────────────────────────────────────────
// The chart and the meal panel drag as one: the content tracks the finger a slot at a
// time, and a drag that ends on a bar must not also select it.
/**
 * A free horizontal drag with a throw on release. The caller says what counts as a grab,
 * how a pixel of finger maps to its own units, where the limits are, and what to do when
 * the value moves; everything about tracking the finger and shedding speed lives here.
 *
 * The pointer is captured only once the gesture is unmistakably a drag. Capturing on the
 * press instead would retarget the click a plain tap ends with onto the zone, and the
 * thing under the finger would never hear about it.
 */
function makeSlider(zone, cfg) {
  let from = null, moved = false, glide = 0;

  // Returns false once a limit has been reached, which is what stops the throw dead
  // rather than letting it grind against the end.
  function to(v) {
    const b = cfg.limits();
    const next = clamp(v, b.min, b.max);
    if (next !== cfg.value()) cfg.move(next);
    return next === v;
  }

  zone.addEventListener('pointerdown', e => {
    cancelAnimationFrame(glide);
    moved = false;
    if (!e.target.closest(cfg.hit)) return;
    from = { x: e.clientX, v: cfg.value(), t: e.timeStamp, vel: 0 };
  });

  zone.addEventListener('pointermove', e => {
    if (!from) return;
    const dx = (e.clientX - from.x) / (scale || 1);
    if (!moved) {
      if (Math.abs(dx) < 4) return;
      moved = true;
      if (cfg.onGrab) cfg.onGrab();
      try { zone.setPointerCapture(e.pointerId); } catch (_) { /* gone already */ }
    }
    const before = cfg.value();
    to(from.v + dx * cfg.perPx());
    const dt = e.timeStamp - from.t;
    if (dt > 0) from.vel = (cfg.value() - before) / dt;
    from.t = e.timeStamp;
  });

  function release(e) {
    if (!from) return;
    let v = from.vel;
    const dragged = moved;
    from = null;
    if (!dragged) return;
    try { zone.releasePointerCapture(e.pointerId); } catch (_) { /* already gone */ }
    if (Math.abs(v) <= cfg.floor * 5) return;
    let last = performance.now();
    const tick = now => {
      const dt = Math.min(34, now - last);
      last = now;
      const room = to(cfg.value() + v * dt);
      v *= Math.pow(0.9975, dt);
      if (room && Math.abs(v) > cfg.floor) glide = requestAnimationFrame(tick);
    };
    glide = requestAnimationFrame(tick);
  }
  zone.addEventListener('pointerup', release);
  zone.addEventListener('pointercancel', release);

  // A drag that ends on something tappable must not also tap it.
  zone.addEventListener('click', e => {
    if (!moved) return;
    e.stopPropagation();
    e.preventDefault();
  }, true);

  return { stop: () => cancelAnimationFrame(glide) };
}

const SCRUB_ZONE = '#stats-chart,#stats-xlabels,#stats-meal-labels,#stats-meal-cols';
let domBase = 0;             // the whole-slot position the tracks were last built at

/**
 * Moves the four tracks to wherever ui.scrub has got to. No layout and no paint: each
 * track is one composited transform. The DOM is only rebuilt when the drag has eaten
 * far enough into the overscan that it would otherwise run out of slots.
 */
function applyScrub() {
  const cfg = STATS_RANGES[ui.range];
  const mcfg = MEALS_CFG[ui.range];
  const delta = ui.scrub - domBase;
  if (Math.abs(delta) >= (OVERSCAN - 1) * cfg.step) { render(); return; }

  const px = (delta / cfg.step) * pitchOf(cfg.n, cfg.gap).pitch;
  const mpx = (delta / mcfg.step) * pitchOf(mcfg.n, mcfg.cg).pitch;
  shiftTrack('stats-bars', px);
  shiftTrack('stats-goal-track', px);
  shiftTrack('stats-xlabels', px);
  shiftTrack('stats-meal-cols', mpx);
  shiftTrack('stats-meal-labels', mpx);
  updateGoalLabel();          // which stretch of the rule it sits on changes as it slides
}

function shiftTrack(id, px) {
  const track = $(id).firstChild;
  if (track) track.style.transform = 'translateX(' + px.toFixed(2) + 'px)';
}

const statsSlider = makeSlider($('screen-stats'), {
  hit: SCRUB_ZONE,
  floor: 0.0004,                                   // days per ms
  value: () => ui.scrub,
  limits: scrubBounds,
  perPx: () => {
    const cfg = STATS_RANGES[ui.range];
    return cfg.step / pitchOf(cfg.n, cfg.gap).pitch;
  },
  onGrab: () => {
    ui.selDay = null;
    ui.mealSelDay = null;
    render();
  },
  move: v => {
    const was = scrubBase();
    ui.scrub = v;
    applyScrub();
    if (scrubBase() !== was) updateHero();          // the one thing that reads the window
  }
});

// Tiles keep their width and run off to the right rather than squeezing up, so the
// finger drags the row the same way it drags the chart. Content moves with the finger,
// which means the offset from the left runs the other way.
const histSlider = makeSlider($('screen-calc'), {
  hit: '#calc-history',
  floor: 0.02,                                     // pixels per ms
  perPx: () => -1,
  value: () => ui.histX,
  limits: () => ({ min: 0, max: histOverflow() }),
  onGrab: () => { disarmTile(); render(); },
  move: v => {
    ui.histX = v;
    const track = $('calc-history').firstChild;
    if (track) track.style.transform = 'translateX(' + (-v).toFixed(2) + 'px)';
  }
});

// ── swiping between screens ──────────────────────────────────────────────────
// Where a sideways drag leads, per screen. Anything that already drags something of
// its own keeps the gesture: the stats window and the history row are dragged, not
// swiped, so a swipe has to begin outside them.
const SWIPE_TO = {
  home: { right: 'stats' },
  stats: { left: 'home' },
  calc: { right: 'home' },
  calendar: { right: 'home' }
};
// A zone only keeps the gesture while it has somewhere to go. A history row short
// enough to sit still would otherwise be a dead strip across half the screen.
const SWIPE_KEEP = {
  stats: () => SCRUB_ZONE,
  calc: () => (histOverflow() > 0 ? '#calc-history' : null)
};
const SWIPE_MIN = 60;        // canvas px of travel before a drag counts as a swipe
const SWIPE_SLOPE = 1.5;     // and how much flatter than tall it has to be

let swipeFrom = null;
let swiped = false;

stage.addEventListener('pointerdown', e => {
  swiped = false;
  swipeFrom = null;
  // The open day stack and the settings sheet each own the gesture while they are up.
  if (!SWIPE_TO[ui.screen] || ui.picker || ui.settings) return;
  const keep = SWIPE_KEEP[ui.screen] && SWIPE_KEEP[ui.screen]();
  if (keep && e.target.closest(keep)) return;
  swipeFrom = { x: e.clientX, y: e.clientY, dx: 0, dy: 0 };
});

stage.addEventListener('pointermove', e => {
  if (!swipeFrom) return;
  swipeFrom.dx = (e.clientX - swipeFrom.x) / (scale || 1);
  swipeFrom.dy = (e.clientY - swipeFrom.y) / (scale || 1);
});

// Decided on release rather than partway through, so a gesture can still be thought
// better of, and a long press that wanders never navigates on its own.
stage.addEventListener('pointerup', () => {
  const s = swipeFrom;
  swipeFrom = null;
  if (!s) return;
  if (Math.abs(s.dx) < SWIPE_MIN || Math.abs(s.dx) < Math.abs(s.dy) * SWIPE_SLOPE) return;
  const to = SWIPE_TO[ui.screen][s.dx > 0 ? 'right' : 'left'];
  if (!to) return;
  swiped = true;
  go(to);
});
stage.addEventListener('pointercancel', () => { swipeFrom = null; });

// The screen has changed under the finger, so whatever is now beneath it is not
// something the person meant to press.
stage.addEventListener('click', e => {
  if (!swiped) return;
  swiped = false;
  e.stopPropagation();
  e.preventDefault();
}, true);

// hardware keyboard, as the prototype supported
window.addEventListener('keydown', e => {
  // Digits typed into the maximum are not digits typed into the calculator behind it.
  if (ui.settings) {
    if (e.key !== 'Escape') return;
    // The question first, since it is the thing on top and the thing being asked.
    if (askWhich) closeAsk();
    else closeSettings();
    e.preventDefault();
    return;
  }
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
  if (now === lastDay) return;
  lastDay = now;
  closeStaleMeals();
  reindex();
  render();
}, 60000);

reindex();
probeStorage();
closeStaleMeals();
// A log still filed under the old name is moved over at once, rather than waiting for
// the next thing logged to do it.
try { if (localStorage.getItem(WAS_KEY) != null) save(); } catch (e) { /* nothing to move */ }
askToPersist();
ensureStart();
layout();
go('home');

// The calculator measures its readout to place the arc. Before the webfont lands that
// measurement uses fallback metrics, so redo it once the real face is in.
if (document.fonts && document.fonts.ready) document.fonts.ready.then(render);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
