import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { POINTS } from '../site/js/points.js';
import { render } from '../tools/build-points.mjs';

const config = JSON.parse(
  readFileSync(new URL('../config/cities/dar_es_salaam.json', import.meta.url), 'utf8'),
);

test('the site shows exactly the points the collector is configured with', () => {
  assert.deepEqual(POINTS, config);
});

test('site/js/points.js is what the build script would write', () => {
  const onDisk = readFileSync(new URL('../site/js/points.js', import.meta.url), 'utf8');
  assert.equal(onDisk.replace(/\r\n/g, '\n'), render());
});

test('there are 52 points with unique names and the three known categories', () => {
  assert.equal(POINTS.length, 52);
  assert.equal(new Set(POINTS.map((p) => p.name)).size, 52);
  const categories = new Set(POINTS.map((p) => p.category));
  assert.deepEqual([...categories].sort(), ['cbd_corridor', 'highway', 'main_road']);
});
