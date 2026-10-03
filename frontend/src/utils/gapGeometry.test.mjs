import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { isValidGapCenter, toLeafletPolygonPositions } from './gapGeometry.mjs';

test('converts GeoJSON Polygon coordinates from [longitude, latitude] to Leaflet [latitude, longitude]', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [[
      [74.9, 12.8],
      [75.0, 12.8],
      [75.0, 12.9],
      [74.9, 12.8]
    ]]
  };
  assert.deepEqual(toLeafletPolygonPositions(polygon), [[
    [12.8, 74.9],
    [12.8, 75.0],
    [12.9, 75.0],
    [12.8, 74.9]
  ]]);
});

test('converts every valid Polygon ring, including holes', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [[74, 12], [75, 12], [75, 13], [74, 12]],
      [[74.2, 12.2], [74.3, 12.2], [74.3, 12.3], [74.2, 12.2]]
    ]
  };
  const result = toLeafletPolygonPositions(polygon);
  assert.equal(result?.length, 2);
  assert.deepEqual(result?.[1][0], [12.2, 74.2]);
});

test('rejects a closed ring containing repeated copies of one point', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [[[74.9, 12.8], [74.9, 12.8], [74.9, 12.8], [74.9, 12.8]]]
  };
  assert.equal(toLeafletPolygonPositions(polygon), null);
});

test('rejects a closed ring with distinct but collinear positions', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [[[74, 12], [75, 12], [76, 12], [74, 12]]]
  };
  assert.equal(toLeafletPolygonPositions(polygon), null);
});

test('continues converting a normal valid Polygon and its valid hole', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [[74, 12], [75, 12], [75, 13], [74, 12]],
      [[74.2, 12.2], [74.3, 12.2], [74.3, 12.3], [74.2, 12.2]]
    ]
  };
  assert.deepEqual(toLeafletPolygonPositions(polygon), [
    [[12, 74], [12, 75], [13, 75], [12, 74]],
    [[12.2, 74.2], [12.2, 74.3], [12.3, 74.3], [12.2, 74.2]]
  ]);
});

test('returns null for empty, invalid, unclosed, or unsupported geometry', () => {
  const invalidGeometries = [
    undefined,
    { type: 'Polygon', coordinates: [] },
    { type: 'Polygon', coordinates: [[]] },
    { type: 'Polygon', coordinates: [[[74, 12], [75, 12], [75, 13], [75, 12]]] },
    { type: 'Polygon', coordinates: [[[74, 12], [181, 12], [75, 13], [74, 12]]] },
    { type: 'Polygon', coordinates: [[[74, 12], [75, 12], [75, Number.NaN], [74, 12]]] },
    { type: 'Polygon', coordinates: [[[74, 12], [75, 12], [75, 13], [74, 12], [null, null]]] },
    { type: 'Polygon', coordinates: [[, [75, 12], [75, 13], [74, 12]]] },
    { type: 'MultiPolygon', coordinates: [] },
    { type: 'Point', coordinates: [74, 12] }
  ];
  for (const geometry of invalidGeometries) {
    assert.equal(toLeafletPolygonPositions(geometry), null);
  }
});

test('only valid geographic centers are eligible for point-only fallback markers', () => {
  assert.equal(isValidGapCenter({ lat: 12.8, lng: 74.9 }), true);
  assert.equal(isValidGapCenter({ lat: 91, lng: 74.9 }), false);
  assert.equal(isValidGapCenter({ lat: 12.8, lng: Infinity }), false);
  assert.equal(isValidGapCenter(null), false);
});

test('MapPage renders returned underserved polygons and has no fixed-radius Circle fallback', () => {
  const mapPage = readFileSync(new URL('../pages/MapPage.tsx', import.meta.url), 'utf8');
  const underservedLayer = mapPage.slice(
    mapPage.indexOf('LAYER 8: UNDERSERVED REGIONS'),
    mapPage.indexOf('LAYER 1: ROADS (POLYLINES)')
  );
  assert.match(underservedLayer, /toLeafletPolygonPositions\(gap\.polygonGeometry\)/);
  assert.match(underservedLayer, /<Polygon\s+key=\{gap\.id\}\s+positions=\{polygonPositions\}/);
  assert.match(underservedLayer, /<Marker[\s\S]*position=\{\[gap\.center\.lat, gap\.center\.lng\]\}/);
  assert.doesNotMatch(underservedLayer, /<Circle|radius\s*=\s*800/);
});
