import test from 'node:test';
import assert from 'node:assert/strict';

import { POINTS } from '../site/js/points.js';
import {
  REGION_BOUNDS, CITY_BOUNDS, CENTRE_BOUNDS, LAND, CORRIDORS, BRIDGE, PLACES,
  makeProjection, inBounds, pointInPolygon, isOverWater, homeView,
} from '../site/js/geo.js';

test('projection maps the bounds corners to the box corners', () => {
  const p = makeProjection(REGION_BOUNDS, 800);
  const [west, south, east, north] = REGION_BOUNDS;
  const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-6, `${a} vs ${b}`);
  close(p.project(west, north)[0], 0);
  close(p.project(west, north)[1], 0);
  close(p.project(east, south)[0], 800);
  close(p.project(east, south)[1], p.height);
});

test('projection puts north up and east right', () => {
  const p = makeProjection(REGION_BOUNDS, 800);
  const [x1, y1] = p.project(39.2, -6.9);
  const [x2, y2] = p.project(39.3, -6.8);
  assert.ok(x2 > x1);
  assert.ok(y2 < y1);
});

test('projection keeps east-west and north-south distances in proportion', () => {
  // Near the equator a degree of longitude is almost a degree of latitude.
  const p = makeProjection(REGION_BOUNDS, 800);
  const [x0, y0] = p.project(39.2, -6.8);
  const [x1] = p.project(39.3, -6.8);
  const [, y1] = p.project(39.2, -6.9);
  const ratio = (x1 - x0) / (y1 - y0);
  assert.ok(ratio > 0.98 && ratio < 1, `ratio ${ratio}`);
});

test('pointInPolygon agrees with a unit square', () => {
  const square = [[0, 0], [1, 0], [1, 1], [0, 1]];
  assert.equal(pointInPolygon(0.5, 0.5, square), true);
  assert.equal(pointInPolygon(1.5, 0.5, square), false);
  assert.equal(pointInPolygon(0.5, -0.1, square), false);
});

test('every monitoring point is inside the regional map', () => {
  for (const point of POINTS) {
    assert.ok(inBounds(REGION_BOUNDS, point.lon, point.lat), point.name);
  }
});

test('every monitoring point is on land in the sketched coastline, bridges aside', () => {
  for (const point of POINTS) {
    if (isOverWater(point)) continue;
    assert.ok(pointInPolygon(point.lon, point.lat, LAND), `${point.name} drawn in the sea`);
  }
});

test('the Nyerere Bridge point is over the creek, between the two banks', () => {
  const bridge = POINTS.filter(isOverWater);
  assert.equal(bridge.length, 1);
  assert.equal(pointInPolygon(bridge[0].lon, bridge[0].lat, LAND), false);
  assert.ok(bridge[0].lon > BRIDGE[0][0] && bridge[0].lon < BRIDGE[1][0]);
});

test('every city-centre corridor point is inside the centre inset', () => {
  const cbd = POINTS.filter((p) => p.category === 'cbd_corridor');
  assert.equal(cbd.length, 13);
  for (const point of cbd) assert.ok(inBounds(CENTRE_BOUNDS, point.lon, point.lat), point.name);
});

test('open water is not land', () => {
  assert.equal(pointInPolygon(39.45, -6.75, LAND), false); // Indian Ocean
  assert.equal(pointInPolygon(39.303, -6.845, LAND), false); // harbour
});

test('corridor lines pass through the monitoring points named for them', () => {
  const onLine = (point, line) => line.some(([lon, lat]) => lon === point.lon && lat === point.lat);
  const expected = {
    'Morogoro Road': /^Morogoro (Main )?Road/,
    'Kilwa Road': /^Kilwa Road/,
    'Nelson Mandela Road': /^Nelson Mandela Road/,
  };
  for (const [name, pattern] of Object.entries(expected)) {
    const corridor = CORRIDORS.find((c) => c.name === name);
    const points = POINTS.filter((p) => pattern.test(p.name));
    assert.ok(points.length >= 2, name);
    for (const point of points) assert.ok(onLine(point, corridor.line), `${point.name} not on ${name}`);
  }
});

test('corridors and labels stay inside their maps', () => {
  const views = { region: REGION_BOUNDS, city: CITY_BOUNDS, centre: CENTRE_BOUNDS };
  const pad = [REGION_BOUNDS[0] - 0.01, REGION_BOUNDS[1] - 0.01, REGION_BOUNDS[2] + 0.01, REGION_BOUNDS[3] + 0.01];
  for (const corridor of CORRIDORS) {
    for (const [lon, lat] of corridor.line) assert.ok(inBounds(pad, lon, lat), corridor.name);
    for (const [view, [lon, lat]] of Object.entries(corridor.labels)) {
      assert.ok(inBounds(views[view], lon, lat), `${corridor.name} label on ${view}`);
    }
  }
  for (const [view, places] of Object.entries(PLACES)) {
    for (const [name, lon, lat, kind] of places) {
      assert.ok(inBounds(views[view], lon, lat), `${name} on ${view}`);
      assert.equal(pointInPolygon(lon, lat, LAND), kind === 'land', `${name} is ${kind}`);
    }
  }
});

test('the three views nest: centre inside city inside region', () => {
  const inside = (inner, outer) =>
    inner[0] > outer[0] && inner[1] > outer[1] && inner[2] < outer[2] && inner[3] < outer[3];
  assert.ok(inside(CENTRE_BOUNDS, CITY_BOUNDS));
  assert.ok(inside(CITY_BOUNDS, REGION_BOUNDS));
});

test('every point has exactly one home view and no view is empty', () => {
  const counts = { centre: 0, city: 0, region: 0 };
  for (const point of POINTS) counts[homeView(point.lon, point.lat)] += 1;
  assert.equal(counts.centre + counts.city + counts.region, POINTS.length);
  for (const [view, count] of Object.entries(counts)) assert.ok(count >= 5, `${view}: ${count}`);
});
