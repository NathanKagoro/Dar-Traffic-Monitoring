// Page behaviour: draws the two maps, plays the simulated day, and wires the
// readout, scrubber, point list and the congestion-ratio sliders.
// All values that vary with time come from sim.js and are simulated.

import { POINTS } from './points.js';
import {
  REGION_BOUNDS, CITY_BOUNDS, CENTRE_BOUNDS, LAND, CORRIDORS, BRIDGE, PLACES, makeProjection, homeView,
} from './geo.js';
import {
  simulateDay, cityProfile, congestionRatio, speedFromRatio, band, slotLabel,
  SLOTS_PER_DAY, MORNING_WINDOW, EVENING_WINDOW,
} from './sim.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const CATEGORY_LABEL = {
  cbd_corridor: 'City-centre corridor',
  highway: 'Highway',
  main_road: 'Main road',
};
const SHAPE = {
  highway: 'M0-6.5A6.5 6.5 0 1 1 0 6.5 6.5 6.5 0 1 1 0-6.5Z',
  main_road: 'M0-7.6 7.4 5.6H-7.4Z',
  cbd_corridor: 'M-5.6-5.6H5.6V5.6H-5.6Z',
};

const $ = (id) => document.getElementById(id);
function svg(name, attrs = {}, parent) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (parent) parent.appendChild(node);
  return node;
}
const fmt = (n) => n.toFixed(1);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const day = simulateDay(POINTS);
const profile = cityProfile(day);
const home = POINTS.map((p) => homeView(p.lon, p.lat));

const state = { slot: 13, selected: -1, hover: -1, playing: false, visible: false };
const markers = []; // per point: { node, mark, map, x, y }
const dots = []; // small non-interactive copies on the wider maps
const maps = [];

/* ---------- keep text and markers a constant size on screen ---------- */

function watchScale(node, units) {
  const apply = () => {
    const width = node.clientWidth || node.getBoundingClientRect().width;
    if (!width) return;
    node.style.setProperty('--k', Math.min(3, Math.max(0.45, units / width)).toFixed(3));
    window.requestAnimationFrame(() => keepLabelsInside(node, units));
  };
  apply();
  if ('ResizeObserver' in window) new ResizeObserver(apply).observe(node);
}

// Labels keep a constant size on screen, so on a narrow map a label placed
// near an edge can run off it. Nudge any that do back inside.
function keepLabelsInside(node, units) {
  const height = node.viewBox.baseVal.height;
  for (const text of node.querySelectorAll('text.k-text')) {
    text.removeAttribute('dx');
    text.removeAttribute('dy');
    let box;
    try { box = text.getBBox(); } catch { continue; }
    if (!box.width) continue;
    const dx = box.x < 3 ? 3 - box.x : box.x + box.width > units - 3 ? units - 3 - box.x - box.width : 0;
    const dy = box.y < 3 ? 3 - box.y : box.y + box.height > height - 2 ? height - 2 - box.y - box.height : 0;
    if (dx) text.setAttribute('dx', dx.toFixed(1));
    if (dy) text.setAttribute('dy', dy.toFixed(1));
  }
}

/* ---------- maps ---------- */

function pathFrom(coords, proj, close = false) {
  return coords.map(([lon, lat], i) => {
    const [x, y] = proj.project(lon, lat);
    return `${i ? 'L' : 'M'}${fmt(x)} ${fmt(y)}`;
  }).join('') + (close ? 'Z' : '');
}

function buildMap(host, { bounds, width, kind, label }) {
  const proj = makeProjection(bounds, width);
  const root = svg('svg', {
    viewBox: `0 0 ${width} ${fmt(proj.height)}`, role: 'group', 'aria-label': label,
  });
  root.style.setProperty('--k', '1');
  const [west, south, east, north] = bounds;

  if (kind === 'region') {
    const grat = svg('g', { 'aria-hidden': 'true' }, root);
    for (let lon = 39.0; lon < east; lon += 0.1) {
      const [x] = proj.project(lon, north);
      svg('line', { class: 'm-grat', x1: fmt(x), y1: 0, x2: fmt(x), y2: fmt(proj.height) }, grat);
    }
    for (let lat = -6.7; lat > south; lat -= 0.1) {
      const [, y] = proj.project(west, lat);
      svg('line', { class: 'm-grat', x1: 0, y1: fmt(y), x2: width, y2: fmt(y) }, grat);
    }
  }

  svg('path', { class: 'm-land', d: pathFrom(LAND, proj, true) }, root);

  const roads = svg('g', { 'aria-hidden': 'true' }, root);
  for (const corridor of CORRIDORS) svg('path', { class: 'm-road-case', d: pathFrom(corridor.line, proj) }, roads);
  for (const corridor of CORRIDORS) svg('path', { class: 'm-road', d: pathFrom(corridor.line, proj) }, roads);
  svg('path', { class: 'm-bridge', d: pathFrom(BRIDGE, proj) }, roads);

  const labels = svg('g', { 'aria-hidden': 'true' }, root);
  const box = (inner, name) => {
    const [x0, y0] = proj.project(inner[0], inner[3]);
    const [x1, y1] = proj.project(inner[2], inner[1]);
    svg('rect', { class: 'm-box', x: fmt(x0), y: fmt(y0), width: fmt(x1 - x0), height: fmt(y1 - y0) }, labels);
    const t = svg('text', { class: 'm-box-label k-text', x: fmt(x0), y: fmt(y1 + 4), 'dominant-baseline': 'hanging' }, labels);
    t.textContent = name;
  };
  if (kind === 'region') box(CITY_BOUNDS, 'City');
  if (kind === 'city') box(CENTRE_BOUNDS, 'Centre');
  for (const [name, lon, lat, type, anchor] of PLACES[kind]) {
    const [x, y] = proj.project(lon, lat);
    const t = svg('text', {
      class: `m-place k-text${type === 'land' ? ' m-place--land' : ''}`, x: fmt(x), y: fmt(y), 'text-anchor': anchor,
    }, labels);
    t.textContent = name;
  }
  for (const corridor of CORRIDORS) {
    const at = corridor.labels[kind];
    if (!at) continue;
    const [x, y] = proj.project(at[0], at[1]);
    const t = svg('text', { class: 'm-road-label k-text', x: fmt(x), y: fmt(y), 'text-anchor': at[2] }, labels);
    t.textContent = (kind === 'city' && corridor.short) || corridor.name;
  }

  // scale bar
  const km = { region: 10, city: 2, centre: 1 }[kind];
  const barLength = (km / 111.2) * proj.scale;
  const sx = kind === 'region' ? 16 : kind === 'centre' ? 14 : width - barLength - 16;
  const sy = proj.height - (kind === 'region' ? 30 : 14);
  svg('path', { class: 'm-scale', d: `M${fmt(sx)} ${fmt(sy - 5)}v5h${fmt(barLength)}v-5` }, labels);
  const st = svg('text', { class: 'm-scale-label k-text', x: fmt(sx + barLength / 2), y: fmt(sy - 9), 'text-anchor': 'middle' }, labels);
  st.textContent = `${km} km`;

  const layer = svg('g', {}, root);
  const map = { host, root, proj, width, kind, tip: null, members: [] };

  POINTS.forEach((point, i) => {
    const [x, y] = proj.project(point.lon, point.lat);
    if (home[i] !== kind) {
      // points that have their marker on a tighter view show here as a small dot
      const tighter = kind === 'region' || (kind === 'city' && home[i] === 'centre');
      if (tighter) {
        const dot = svg('circle', { class: 'm-dot', cx: fmt(x), cy: fmt(y), r: 2.4, 'aria-hidden': 'true' }, layer);
        dots.push({ node: dot, index: i });
      }
      return;
    }
    const node = svg('g', {
      class: 'pt', transform: `translate(${fmt(x)} ${fmt(y)})`, tabindex: '-1', role: 'img',
      'aria-label': `${point.name}, ${CATEGORY_LABEL[point.category]}`, 'data-i': i,
    }, layer);
    const inner = svg('g', { class: 'pt__k' }, node);
    svg('circle', { class: 'pt__hit', r: 15 }, inner);
    svg('circle', { class: 'pt__ring', r: 12 }, inner);
    const mark = svg('path', { class: 'pt__mark', d: SHAPE[point.category] }, inner);
    markers[i] = { node, mark, map, x, y };
    map.members.push(i);
    node.addEventListener('focus', () => select(i, { focus: false }));
  });

  host.appendChild(root);
  const tip = document.createElement('div');
  tip.className = 'tip';
  tip.hidden = true;
  host.appendChild(tip);
  map.tip = tip;

  const nearest = (event, reachPx) => {
    const box = root.getBoundingClientRect();
    const unit = width / box.width;
    const px = (event.clientX - box.left) * unit;
    const py = (event.clientY - box.top) * unit;
    let best = -1;
    let bestDistance = reachPx * unit;
    for (const i of map.members) {
      const d = Math.hypot(markers[i].x - px, markers[i].y - py);
      if (d < bestDistance) { best = i; bestDistance = d; }
    }
    return best;
  };
  root.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    setHover(nearest(event, 24));
  });
  root.addEventListener('pointerleave', () => setHover(-1));
  root.addEventListener('click', (event) => {
    const i = nearest(event, 34);
    if (i >= 0) select(i, { focus: true });
  });
  root.addEventListener('keydown', onMapKey);

  watchScale(root, width);
  maps.push(map);
  return map;
}

// One order for arrow keys and the Previous / Next buttons: each view west to
// east, starting with the city.
let order = [];
function buildOrder() {
  const byLon = (a, b) => POINTS[a].lon - POINTS[b].lon;
  const all = POINTS.map((_, i) => i);
  order = ['city', 'centre', 'region'].flatMap((view) => all.filter((i) => home[i] === view).sort(byLon));
}

function step(delta, focus) {
  const at = order.indexOf(state.selected);
  const next = at < 0 ? (delta > 0 ? 0 : order.length - 1) : (at + delta + order.length) % order.length;
  select(order[next], { focus });
}

function onMapKey(event) {
  const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
  if (event.key in keys) {
    event.preventDefault();
    step(keys[event.key], true);
  } else if (event.key === 'Home') {
    event.preventDefault();
    select(order[0], { focus: true });
  } else if (event.key === 'End') {
    event.preventDefault();
    select(order[order.length - 1], { focus: true });
  } else if (event.key === 'Escape') {
    setHover(-1);
    for (const map of maps) map.tip.hidden = true;
  }
}

function setHover(i) {
  if (state.hover === i) return;
  if (state.hover >= 0) markers[state.hover].node.classList.remove('is-hover');
  state.hover = i;
  if (i >= 0) markers[i].node.classList.add('is-hover');
  placeTips();
}

function placeTips() {
  const shown = state.hover >= 0 ? state.hover : state.selected;
  for (const map of maps) {
    const tip = map.tip;
    if (shown < 0 || markers[shown].map !== map) { tip.hidden = true; continue; }
    const point = POINTS[shown];
    tip.innerHTML = '';
    tip.append(point.name);
    const small = document.createElement('small');
    small.textContent = CATEGORY_LABEL[point.category];
    tip.append(small);
    tip.hidden = false;
    const box = map.host.getBoundingClientRect();
    const k = box.width / map.width;
    const half = tip.offsetWidth / 2 + 4;
    const left = Math.min(box.width - half, Math.max(half, markers[shown].x * k));
    const top = markers[shown].y * k;
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.classList.toggle('is-below', top < tip.offsetHeight + 22);
  }
}

function select(i, { focus = false, reveal = false } = {}) {
  if (i < 0 || !markers[i]) return;
  if (state.selected !== i) {
    if (state.selected >= 0) {
      markers[state.selected].node.classList.remove('is-selected');
      markers[state.selected].node.setAttribute('tabindex', '-1');
    }
    state.selected = i;
    markers[i].node.classList.add('is-selected');
    markers[i].node.setAttribute('tabindex', '0');
    // draw the selected marker on top of its neighbours
    markers[i].node.parentNode.appendChild(markers[i].node);
    for (const button of document.querySelectorAll('#roll button')) {
      button.toggleAttribute('aria-current', false);
      if (Number(button.dataset.i) === i) button.setAttribute('aria-current', 'true');
    }
    renderReadout();
  }
  if (focus && document.activeElement !== markers[i].node) markers[i].node.focus({ preventScroll: true });
  if (reveal) markers[i].map.host.scrollIntoView({ block: 'nearest' });
  placeTips();
}

/* ---------- time ---------- */

function markerScale(ratio) { return 0.82 + ratio * 0.95; }

function renderSlot() {
  const slot = state.slot;
  POINTS.forEach((_, i) => {
    const ratio = day.series[i][slot];
    const key = band(ratio).key;
    const marker = markers[i];
    if (marker.bandKey !== key) {
      marker.mark.setAttribute('class', `pt__mark band-${key}`);
      marker.bandKey = key;
    }
    marker.mark.style.transform = `scale(${markerScale(ratio).toFixed(2)})`;
  });
  for (const dot of dots) dot.node.setAttribute('class', `m-dot band-${band(day.series[dot.index][slot]).key}`);
  $('clock').textContent = slotLabel(slot);
  const scrub = $('scrub');
  scrub.value = String(slot);
  scrub.setAttribute('aria-valuetext', `${slotLabel(slot)} East Africa Time, simulated`);
  if (nowLine) {
    const x = (slot / (SLOTS_PER_DAY - 1)) * 600;
    nowLine.setAttribute('x1', fmt(x));
    nowLine.setAttribute('x2', fmt(x));
  }
  renderReadout();
}

function renderReadout() {
  const i = state.selected;
  if (i < 0) return;
  const point = POINTS[i];
  const ratio = day.series[i][state.slot];
  const speed = speedFromRatio(ratio, point.category);
  $('r-name').textContent = point.name;
  $('r-cat').textContent = `${point.category} (${CATEGORY_LABEL[point.category]})`;
  $('r-pos').textContent = `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
  $('r-ratio').textContent = `${ratio.toFixed(2)}  ${band(ratio).label}, at ${slotLabel(state.slot)}`;
  $('r-speed').textContent = `${speed.current} / ${speed.freeFlow} km/h`;
}

let timer = 0;
function syncTimer() {
  const shouldRun = state.playing && state.visible && !document.hidden;
  if (shouldRun && !timer) {
    timer = window.setInterval(() => {
      state.slot = (state.slot + 1) % SLOTS_PER_DAY;
      renderSlot();
    }, 520);
  } else if (!shouldRun && timer) {
    window.clearInterval(timer);
    timer = 0;
  }
}
function setPlaying(playing) {
  state.playing = playing;
  const button = $('play');
  button.textContent = playing ? 'Pause the day' : 'Play the day';
  button.setAttribute('aria-pressed', String(playing));
  syncTimer();
}

/* ---------- charts ---------- */

let nowLine = null;

function profileChart(host, { W, height, withNow }) {
  const top = 18;
  const base = height - 20;
  const x = (slot) => (slot / (SLOTS_PER_DAY - 1)) * W;
  const y = (ratio) => base - (ratio / 0.8) * (base - top);
  const root = svg('svg', { viewBox: `0 0 ${W} ${height}`, 'aria-hidden': 'true' });
  root.style.setProperty('--k', '1');
  for (const [name, [from, to]] of [['Morning peak', MORNING_WINDOW], ['Evening peak', EVENING_WINDOW]]) {
    svg('rect', { class: 'c-window', x: fmt(x(from * 2)), y: top - 4, width: fmt(x(to * 2) - x(from * 2)), height: base - top + 4 }, root);
    const t = svg('text', { class: 'c-window-label k-text', x: fmt((x(from * 2) + x(to * 2)) / 2), y: top - 8, 'text-anchor': 'middle' }, root);
    t.textContent = name;
  }
  const line = profile.map((v, s) => `${s ? 'L' : 'M'}${fmt(x(s))} ${fmt(y(v))}`).join('');
  svg('path', { class: 'c-area', d: `${line}L${W} ${base}L0 ${base}Z` }, root);
  svg('path', { class: 'c-line', d: line }, root);
  svg('line', { class: 'c-base', x1: 0, y1: base, x2: W, y2: base }, root);
  for (const hour of [0, 6, 12, 18]) {
    const t = svg('text', { class: 'c-axis k-text', x: fmt(x(hour * 2)), y: height - 3, 'text-anchor': hour ? 'middle' : 'start' }, root);
    t.textContent = `${String(hour).padStart(2, '0')}:00`;
  }
  let now = null;
  if (withNow) now = svg('line', { class: 'c-now', x1: 0, y1: top - 4, x2: 0, y2: base }, root);
  host.appendChild(root);
  watchScale(root, W);
  return now;
}

function corridorChart(host) {
  const groups = [
    ['Morogoro Road', /^Morogoro/],
    ['Bagamoyo Road', /Bagamoyo Road/],
    ['Nyerere Road', /^Nyerere Road/],
    ['Kilwa Road', /^Kilwa/],
    ['Nelson Mandela Road', /^Nelson Mandela/],
  ];
  const W = 340;
  const rowHeight = 40;
  const height = groups.length * rowHeight + 22;
  const root = svg('svg', { viewBox: `0 0 ${W} ${height}`, 'aria-hidden': 'true' });
  root.style.setProperty('--k', '1');
  const cell = W / SLOTS_PER_DAY;
  groups.forEach(([name, pattern], row) => {
    const members = POINTS.map((p, i) => (pattern.test(p.name) ? i : -1)).filter((i) => i >= 0);
    const yTop = row * rowHeight;
    const t = svg('text', { class: 'c-row-label k-text', x: 0, y: yTop + 15 }, root);
    t.textContent = name;
    for (let slot = 0; slot < SLOTS_PER_DAY; slot += 1) {
      const mean = members.reduce((sum, i) => sum + day.series[i][slot], 0) / members.length;
      svg('rect', {
        class: `band-${band(mean).key}`, x: fmt(slot * cell), y: yTop + 22,
        width: fmt(cell - 0.8), height: 13,
      }, root);
    }
  });
  for (const hour of [0, 6, 12, 18]) {
    const t = svg('text', { class: 'c-axis k-text', x: fmt(hour * 2 * cell), y: height - 3 }, root);
    t.textContent = `${String(hour).padStart(2, '0')}:00`;
  }
  host.appendChild(root);
  watchScale(root, W);
}

/* ---------- point list ---------- */

function buildRoll(host) {
  for (const category of ['cbd_corridor', 'highway', 'main_road']) {
    const section = document.createElement('div');
    const heading = document.createElement('h3');
    const members = POINTS.map((p, i) => i).filter((i) => POINTS[i].category === category);
    heading.textContent = `${CATEGORY_LABEL[category]} (${members.length})`;
    const list = document.createElement('ul');
    for (const i of members) {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.i = String(i);
      button.textContent = POINTS[i].name;
      button.addEventListener('click', () => select(i, { reveal: true }));
      item.appendChild(button);
      list.appendChild(item);
    }
    section.append(heading, list);
    host.appendChild(section);
  }
}

/* ---------- congestion ratio sliders ---------- */

function wireRatio() {
  const free = $('in-free');
  const current = $('in-cur');
  const update = () => {
    const f = Number(free.value);
    const c = Number(current.value);
    $('out-free').textContent = `${f} km/h`;
    $('out-cur').textContent = `${c} km/h`;
    const ratio = congestionRatio(c, f);
    const bar = $('ratio-bar');
    if (ratio === null) {
      $('ratio-value').textContent = 'null';
      $('ratio-words').textContent = 'No ratio is stored: the collector treats a speed of 0 as missing.';
      bar.style.width = '0%';
      return;
    }
    $('ratio-value').textContent = ratio.toFixed(2);
    $('ratio-words').textContent = c > f ? 'Faster than free flow, so held at 0.' : band(ratio).label;
    bar.style.width = `${(ratio * 100).toFixed(0)}%`;
    bar.style.background = `var(--${band(ratio).key})`;
  };
  free.addEventListener('input', update);
  current.addEventListener('input', update);
  update();
}

/* ---------- start ---------- */

buildOrder();
buildMap($('map-city'), {
  bounds: CITY_BOUNDS, width: 440, kind: 'city',
  label: 'Map of the city of Dar es Salaam with its monitoring points',
});
buildMap($('map-region'), {
  bounds: REGION_BOUNDS, width: 400, kind: 'region',
  label: 'Map of the wider Dar es Salaam region with the outlying monitoring points',
});
buildMap($('map-centre'), {
  bounds: CENTRE_BOUNDS, width: 320, kind: 'centre',
  label: 'Enlarged map of the city centre with its monitoring points',
});
nowLine = profileChart($('profile'), { W: 600, height: 92, withNow: true });
profileChart($('use-profile'), { W: 340, height: 150, withNow: false });
corridorChart($('use-corridors'));
buildRoll($('roll'));
wireRatio();

renderSlot();
// start with one point selected so the readout shows what a row holds
select(Math.max(0, POINTS.findIndex((p) => p.name === 'Morogoro Road - Ubungo Municipal')));

$('play').addEventListener('click', () => setPlaying(!state.playing));
$('scrub').addEventListener('input', (event) => {
  setPlaying(false);
  state.slot = Number(event.target.value);
  renderSlot();
});
$('prev-point').addEventListener('click', () => step(-1, false));
$('next-point').addEventListener('click', () => step(1, false));
window.addEventListener('resize', placeTips);
document.addEventListener('visibilitychange', syncTimer);

if ('IntersectionObserver' in window) {
  new IntersectionObserver((entries) => {
    state.visible = entries[0].isIntersecting;
    syncTimer();
  }, { threshold: 0.15 }).observe($('control'));
} else {
  state.visible = true;
}
setPlaying(!reducedMotion.matches);
