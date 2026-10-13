// Simulated 24-hour congestion profile for the concept page.
//
// Nothing here is measured. It is a deterministic illustration of the shape a
// working feed for Dar es Salaam would be expected to show: quiet nights, a
// morning peak, a midday shoulder and a longer evening peak, with each
// monitoring point given its own character from a seeded random generator.
// The same seed always produces the same day. Tests: test/sim.test.mjs.

export const DEFAULT_SEED = 52;
export const SLOTS_PER_DAY = 48; // one slot per half hour, the collector's cadence
export const MORNING_WINDOW = [6.5, 9.5]; // local time, hours
export const EVENING_WINDOW = [16.5, 19.5];

// Illustrative free-flow speeds by category, km/h. Assumptions, not readings.
export const FREE_FLOW_KMH = { highway: 80, main_road: 50, cbd_corridor: 30 };

// How strongly each category takes part in the two peaks.
const CATEGORY_SHAPE = {
  highway: { night: 0.03, morning: 0.62, midday: 0.16, evening: 0.66 },
  main_road: { night: 0.04, morning: 0.5, midday: 0.2, evening: 0.56 },
  cbd_corridor: { night: 0.05, morning: 0.52, midday: 0.34, evening: 0.6 },
};

/** Small seeded generator (mulberry32). Returns a function giving floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a), so a point's character follows its name. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function bump(hour, centre, width) {
  const d = (hour - centre) / width;
  return Math.exp(-0.5 * d * d);
}

/**
 * The collector's congestion ratio, as in utils/api_helpers.py:
 * 1 - current / free-flow, clamped to 0..1, and null when either speed is
 * missing or zero.
 */
export function congestionRatio(currentSpeed, freeFlowSpeed) {
  if (!currentSpeed || !freeFlowSpeed) return null;
  return clamp01(1 - currentSpeed / freeFlowSpeed);
}

/** Per-point character: how hard each peak hits and when. Deterministic in (seed, name). */
export function pointTraits(point, seed = DEFAULT_SEED) {
  const shape = CATEGORY_SHAPE[point.category] ?? CATEGORY_SHAPE.main_road;
  const rand = mulberry32((seed ^ hashString(point.name)) >>> 0);
  const vary = (base, spread) => base * (1 + (rand() * 2 - 1) * spread);
  return {
    night: vary(shape.night, 0.5),
    morning: vary(shape.morning, 0.28),
    midday: vary(shape.midday, 0.4),
    evening: vary(shape.evening, 0.28),
    morningCentre: 7.75 + (rand() * 2 - 1) * 0.5,
    eveningCentre: 17.75 + (rand() * 2 - 1) * 0.6,
    wobble: Array.from({ length: SLOTS_PER_DAY }, () => (rand() * 2 - 1) * 0.035),
  };
}

/** Simulated congestion ratio (0..1) for one point at a local hour in [0, 24). */
export function congestionAt(traits, hour) {
  const h = ((hour % 24) + 24) % 24;
  const slot = Math.floor(h * 2) % SLOTS_PER_DAY;
  const value =
    traits.night +
    traits.morning * bump(h, traits.morningCentre, 1.0) +
    traits.midday * bump(h, 13, 2.6) +
    traits.evening * bump(h, traits.eveningCentre, 1.3) +
    traits.wobble[slot];
  return clamp01(value);
}

/**
 * The whole simulated day: for every point, 48 half-hourly ratios.
 * Returns { seed, slots, series } where series[i][slot] belongs to points[i].
 */
export function simulateDay(points, seed = DEFAULT_SEED) {
  const series = points.map((point) => {
    const traits = pointTraits(point, seed);
    return Array.from({ length: SLOTS_PER_DAY }, (_, slot) => congestionAt(traits, slot / 2));
  });
  return { seed, slots: SLOTS_PER_DAY, series };
}

/** Mean ratio across all points for each slot. */
export function cityProfile(day) {
  return Array.from({ length: day.slots }, (_, slot) => {
    let sum = 0;
    for (const row of day.series) sum += row[slot];
    return sum / day.series.length;
  });
}

/** Simulated current speed implied by a ratio and a category's assumed free-flow speed. */
export function speedFromRatio(ratio, category) {
  const freeFlow = FREE_FLOW_KMH[category] ?? FREE_FLOW_KMH.main_road;
  return { freeFlow, current: Math.max(1, Math.round(freeFlow * (1 - ratio))) };
}

export const BANDS = [
  { max: 0.2, key: 'free', label: 'Free-flowing' },
  { max: 0.45, key: 'slow', label: 'Slowing' },
  { max: 0.7, key: 'heavy', label: 'Heavy' },
  { max: Infinity, key: 'jam', label: 'Foleni (jammed)' },
];

/** Word band for a ratio, so colour is never the only signal. */
export function band(ratio) {
  return BANDS.find((b) => ratio < b.max) ?? BANDS[BANDS.length - 1];
}

/** "07:30" for slot 15. */
export function slotLabel(slot) {
  const s = ((slot % SLOTS_PER_DAY) + SLOTS_PER_DAY) % SLOTS_PER_DAY;
  return `${String(Math.floor(s / 2)).padStart(2, '0')}:${s % 2 ? '30' : '00'}`;
}
