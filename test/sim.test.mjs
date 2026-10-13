import test from 'node:test';
import assert from 'node:assert/strict';

import { POINTS } from '../site/js/points.js';
import {
  DEFAULT_SEED, SLOTS_PER_DAY, MORNING_WINDOW, EVENING_WINDOW, FREE_FLOW_KMH,
  mulberry32, hashString, congestionRatio, pointTraits, congestionAt, simulateDay,
  cityProfile, speedFromRatio, band, slotLabel,
} from '../site/js/sim.js';

const day = simulateDay(POINTS);
const profile = cityProfile(day);
const hourOf = (slot) => slot / 2;
const inWindow = (hour, [from, to]) => hour >= from && hour <= to;
const argmax = (values, from, to) => {
  let best = from;
  for (let i = from; i < to; i += 1) if (values[i] > values[best]) best = i;
  return best;
};

test('mulberry32 is deterministic and stays in [0, 1)', () => {
  const a = mulberry32(7);
  const b = mulberry32(7);
  for (let i = 0; i < 500; i += 1) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
  assert.notEqual(mulberry32(7)(), mulberry32(8)());
});

test('hashString is stable and distinguishes road names', () => {
  assert.equal(hashString('Morogoro Road'), hashString('Morogoro Road'));
  assert.notEqual(hashString('Morogoro Road'), hashString('Kilwa Road'));
  assert.ok(Number.isInteger(hashString('Samora Avenue')) && hashString('Samora Avenue') >= 0);
});

test('a day has one series of 48 half-hour slots per point', () => {
  assert.equal(day.series.length, POINTS.length);
  assert.equal(day.slots, SLOTS_PER_DAY);
  for (const row of day.series) assert.equal(row.length, 48);
});

test('every simulated value lies within 0 and 1', () => {
  for (const row of day.series) {
    for (const value of row) {
      assert.ok(Number.isFinite(value));
      assert.ok(value >= 0 && value <= 1, `out of range: ${value}`);
    }
  }
});

test('values stay within 0 and 1 for other seeds too', () => {
  for (const seed of [0, 1, 2, 99, 2026, 0xffffffff]) {
    for (const row of simulateDay(POINTS, seed).series) {
      for (const value of row) assert.ok(value >= 0 && value <= 1);
    }
  }
});

test('the same seed gives exactly the same day', () => {
  assert.deepEqual(simulateDay(POINTS, DEFAULT_SEED), day);
  assert.deepEqual(simulateDay(POINTS, 1234), simulateDay(POINTS, 1234));
});

test('a different seed gives a different day', () => {
  assert.notDeepEqual(simulateDay(POINTS, DEFAULT_SEED + 1).series, day.series);
});

test('a point keeps its character whatever order the list is in', () => {
  const reversed = simulateDay([...POINTS].reverse());
  assert.deepEqual(reversed.series[POINTS.length - 1], day.series[0]);
});

test('the city-wide morning peak falls in the morning window', () => {
  const peak = argmax(profile, 0, 24); // 00:00 to 12:00
  assert.ok(inWindow(hourOf(peak), MORNING_WINDOW), `morning peak at ${slotLabel(peak)}`);
});

test('the city-wide evening peak falls in the evening window', () => {
  const peak = argmax(profile, 24, 48); // 12:00 to 24:00
  assert.ok(inWindow(hourOf(peak), EVENING_WINDOW), `evening peak at ${slotLabel(peak)}`);
});

test('every single point peaks inside both rush-hour windows', () => {
  day.series.forEach((row, i) => {
    const am = argmax(row, 0, 24);
    const pm = argmax(row, 24, 48);
    assert.ok(inWindow(hourOf(am), MORNING_WINDOW), `${POINTS[i].name} am peak ${slotLabel(am)}`);
    assert.ok(inWindow(hourOf(pm), EVENING_WINDOW), `${POINTS[i].name} pm peak ${slotLabel(pm)}`);
  });
});

test('there are two distinct peaks with a dip between them', () => {
  const am = argmax(profile, 0, 24);
  const pm = argmax(profile, 24, 48);
  const midday = Math.min(...profile.slice(am, pm + 1));
  assert.ok(profile[am] - midday > 0.1);
  assert.ok(profile[pm] - midday > 0.1);
});

test('rush hours are clearly busier than the small hours', () => {
  const mean = (slots) => slots.reduce((sum, s) => sum + profile[s], 0) / slots.length;
  const rush = mean([14, 15, 16, 17, 34, 35, 36, 37]); // 07:00-08:30 and 17:00-18:30
  const night = mean([0, 1, 2, 3, 4, 5, 6, 7, 8]); // 00:00-04:00
  assert.ok(rush - night > 0.3, `lift ${rush - night}`);
  assert.ok(night < 0.15);
});

test('congestionAt wraps around midnight', () => {
  const traits = pointTraits(POINTS[0]);
  assert.equal(congestionAt(traits, 24), congestionAt(traits, 0));
  assert.equal(congestionAt(traits, -0.5), congestionAt(traits, 23.5));
});

test('congestionRatio matches the collector: 1 - current / free-flow, clamped', () => {
  assert.equal(congestionRatio(60, 60), 0);
  assert.equal(congestionRatio(30, 60), 0.5);
  assert.equal(congestionRatio(15, 60), 0.75);
  assert.equal(congestionRatio(72, 60), 0); // faster than free flow clamps to 0
});

test('congestionRatio is null when a speed is missing or zero, as in the collector', () => {
  assert.equal(congestionRatio(null, 60), null);
  assert.equal(congestionRatio(30, undefined), null);
  assert.equal(congestionRatio(30, 0), null);
  assert.equal(congestionRatio(0, 60), null);
});

test('simulated speeds are consistent with the ratio they came from', () => {
  for (const category of Object.keys(FREE_FLOW_KMH)) {
    for (const ratio of [0, 0.1, 0.37, 0.5, 0.82, 1]) {
      const { current, freeFlow } = speedFromRatio(ratio, category);
      assert.equal(freeFlow, FREE_FLOW_KMH[category]);
      assert.ok(current >= 1 && current <= freeFlow);
      const back = congestionRatio(current, freeFlow);
      assert.ok(Math.abs(back - ratio) <= 1 / freeFlow + 1e-9);
    }
  }
});

test('bands cover the whole range in order and never rely on colour alone', () => {
  assert.equal(band(0).key, 'free');
  assert.equal(band(0.19).key, 'free');
  assert.equal(band(0.2).key, 'slow');
  assert.equal(band(0.45).key, 'heavy');
  assert.equal(band(0.7).key, 'jam');
  assert.equal(band(1).key, 'jam');
  for (const r of [0, 0.3, 0.6, 0.9]) assert.ok(band(r).label.length > 0);
});

test('slot labels are 24-hour clock times', () => {
  assert.equal(slotLabel(0), '00:00');
  assert.equal(slotLabel(15), '07:30');
  assert.equal(slotLabel(47), '23:30');
  assert.equal(slotLabel(48), '00:00');
});
