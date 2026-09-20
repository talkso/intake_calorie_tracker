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

// Home dial: round cap anchored here, fill sweeps clockwise from it.
const HOME_ARC_FROM = 228;
// Calculator dial: the prototype's hand-placed end blob is correct at this sweep, so it
// is rotated about the ring centre by the difference.
const CALC_ARC_FROM = 340;
const CALC_ARC_REF = 152;
const RING_C = 299.5;        // centre of the 599x599 ring box

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
  display: '0', pending: null, op: null, fresh: true,
  view: 'calc', selTile: null,
  range: '7D', sel: null, mealSel: null
};

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
const todayLogged = () => dayCal(0);
const todayEntries = () => store.entries.filter(e => dayKey(new Date(e.t)) === dayKey(new Date()));

function logEntry(v) {
  store.entries.push({ v: v, t: Date.now() });
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
  else {
    // Stats is two-tone: sage above the red meals panel, which starts at y=500.
    const split = offsetY + 500 * scale;
    backdrop.style.background =
      'linear-gradient(to bottom,#C0C3B0 0,#C0C3B0 ' + split + 'px,#FF0000 ' + split + 'px,#FF0000 100%)';
  }
}

// ── routing ──────────────────────────────────────────────────────────────────
function go(screen) {
  ui.screen = screen;
  for (const s of ['home', 'calc', 'stats']) {
    $('screen-' + s).classList.toggle('active', s === screen);
  }
  paintBackdrop();
  render();
}

// ══════════════════════════ HOME ══════════════════════════
function renderHome() {
  const g = goal();
  const logged = todayLogged();
  const pct = clamp(logged / g, 0, 1);
  const sweep = pct * 360;

  $('home-left-val').textContent = String(Math.round(g - logged));
  $('home-max').textContent = g + ' cal maximum.';
  $('home-day').textContent =
    new Date().toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase() + '.';

  const mask = conicMask(HOME_ARC_FROM, sweep);
  const fill = $('home-arc-fill');
  fill.style.webkitMask = mask;
  fill.style.mask = mask;

  const cap = bandPoint(HOME_ARC_FROM, 217.1375);
  const capMask = 'radial-gradient(circle 82.35px at ' + cap.x.toFixed(2) + 'px ' +
                  cap.y.toFixed(2) + 'px,#000 99%,rgba(0,0,0,0) 100%)';
  const clip = $('home-tick-clip');
  clip.style.webkitMaskImage = mask + ',' + capMask;
  clip.style.maskImage = mask + ',' + capMask;

  $('home-arc-cap').style.display = pct > 0 ? 'block' : 'none';
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

function equals() {
  if (ui.op != null) {
    const cur = parseFloat(ui.display) || 0;
    ui.display = fmt(apply(ui.pending, cur, ui.op));
    ui.pending = null;
    ui.op = null;
    ui.fresh = true;
    return render();
  }
  const val = Math.round(parseFloat(ui.display) || 0);
  if (!val) return;
  logEntry(val);
  ui.display = '0';
  ui.fresh = true;
  render();
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
  const logged = todayLogged();
  const cur = parseFloat(ui.display) || 0;
  const preview = ui.op != null && !ui.fresh ? apply(ui.pending, cur, ui.op) : cur;
  const pct = clamp((logged + Math.max(preview, 0)) / g, 0, 1);
  const sweep = pct * 360;

  $('calc-pct').textContent = Math.round(pct * 100) + '%';
  renderSegments(ui.display);

  const mask = conicMask(CALC_ARC_FROM, sweep);
  const fill = $('calc-arc-fill');
  fill.style.webkitMask = mask;
  fill.style.mask = mask;

  const rot = $('calc-arc-blob-rot');
  rot.style.transformOrigin = RING_C + 'px ' + RING_C + 'px';
  rot.style.transform = 'rotate(' + (sweep - CALC_ARC_REF) + 'deg)';

  const visible = pct > 0 ? 'block' : 'none';
  $('calc-arc-cap').style.display = visible;
  $('calc-arc-blob').style.display = visible;

  const entries = todayEntries().slice(-16);

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
  else renderStats();
}

// ── wiring ───────────────────────────────────────────────────────────────────
$('home-stats-btn').addEventListener('click', () => go('stats'));
$('home-open-calc').addEventListener('click', () => go('calc'));
$('stats-home-btn').addEventListener('click', () => go('home'));

$('calc-close').addEventListener('click', () => { clearCalc(); go('home'); });
$('calc-dial-btn').addEventListener('click', equals);
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

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
