import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { toFacilityMarkerPosition } from './facilityMarkerPosition.mjs';
import { normalizeInfrastructureType } from './mapInfrastructureType.mjs';

const mapPage = await readFile(new URL('../pages/MapPage.tsx', import.meta.url), 'utf8');

test('GeoJSON points convert from [longitude, latitude] without shifting coordinates', () => {
  assert.deepEqual(
    toFacilityMarkerPosition({ coordinates: [77.5946, 12.9716] }),
    [12.9716, 77.5946]
  );
});

test('legacy latitude/longitude points remain supported', () => {
  assert.deepEqual(toFacilityMarkerPosition({ lat: 12.9716, lng: 77.5946 }), [12.9716, 77.5946]);
});

test('missing or non-string infrastructure types remain unclassified', () => {
  assert.equal(normalizeInfrastructureType(undefined), '');
  assert.equal(normalizeInfrastructureType(null), '');
  assert.equal(normalizeInfrastructureType(7), '');
  assert.equal(normalizeInfrastructureType('  School '), 'school');
});

test('missing, non-finite, and out-of-range points are not passed to Leaflet', () => {
  assert.equal(toFacilityMarkerPosition(undefined), null);
  assert.equal(toFacilityMarkerPosition({ coordinates: [77.5] }), null);
  assert.equal(toFacilityMarkerPosition({ coordinates: [Number.NaN, 12] }), null);
  assert.equal(toFacilityMarkerPosition({ coordinates: [181, 12] }), null);
  assert.equal(toFacilityMarkerPosition({ lat: 91, lng: 77 }), null);
  assert.equal(toFacilityMarkerPosition({ lat: 12, lng: Number.POSITIVE_INFINITY }), null);
});

test('schools and other filtered facilities share one stable cluster group', () => {
  const groupStart = mapPage.indexOf('<MarkerClusterGroup');
  const groupEnd = mapPage.indexOf('</MarkerClusterGroup>', groupStart);
  assert.notEqual(groupStart, -1, 'facility cluster group is present');
  assert.notEqual(groupEnd, -1, 'facility cluster group is closed');

  const group = mapPage.slice(groupStart, groupEnd);
  assert.match(group, /schoolAssets\.map\(/);
  assert.match(group, /otherAssets\.map\(/);
  assert.equal((mapPage.match(/<MarkerClusterGroup\b/g) ?? []).length, 1);
  assert.match(group, /key=\{school\._id\}/);
  assert.match(group, /key=\{asset\._id\}/);
  assert.match(group, /<Popup>/);
});

test('cluster expansion and spiderfy are enabled while complaints and road polylines stay outside', () => {
  const groupStart = mapPage.indexOf('<MarkerClusterGroup');
  const groupEnd = mapPage.indexOf('</MarkerClusterGroup>', groupStart) + '</MarkerClusterGroup>'.length;
  const group = mapPage.slice(groupStart, groupEnd);
  assert.match(group, /zoomToBoundsOnClick/);
  assert.match(group, /spiderfyOnMaxZoom/);
  assert.match(group, /maxClusterRadius=\{\d+\}/);
  assert.match(mapPage, /react-leaflet-cluster\/dist\/assets\/MarkerCluster\.css/);
  assert.match(mapPage, /react-leaflet-cluster\/dist\/assets\/MarkerCluster\.Default\.css/);

  const roadPolyline = mapPage.indexOf('<Polyline', mapPage.indexOf('{roadAssets.map'));
  const complaintLayer = mapPage.indexOf('LAYER 4: COMPLAINTS');
  assert.ok(roadPolyline >= 0 && roadPolyline < groupStart, 'road polylines are outside the facility cluster');
  assert.ok(complaintLayer > groupEnd, 'complaint clusters remain separate');
});

test('facility layer toggles and active asset filters still control cluster membership', () => {
  assert.match(mapPage, /if \(!layers\.schools\) return \[\];[\s\S]*?filteredAssets\.filter\(\(a\) => normalizeInfrastructureType\(a\.type\) === 'school'\)/);
  assert.match(mapPage, /if \(!layers\.otherInfra\) return \[\];[\s\S]*?filteredAssets\.filter\(/);
  assert.match(mapPage, /\}, \[filteredAssets, layers\.schools\]\)/);
  assert.match(mapPage, /\}, \[filteredAssets, layers\.otherInfra\]\)/);
  assert.match(mapPage, /normalizeInfrastructureType\(item\.type\)/);
  assert.match(mapPage, /normalizeInfrastructureType\(asset\.type\) === 'road'/);
  assert.match(mapPage, /normalizeInfrastructureType\(asset\.type\) \? asset\.type : 'Unclassified'/);
  assert.match(mapPage, /let emoji = t \? '🏛️' : '📍'/);
});

test('Panchayat switching clears the asset source that feeds facility cluster children', () => {
  const selectionStart = mapPage.indexOf('const selectPanchayat =');
  const selectionEnd = mapPage.indexOf('\n  };', selectionStart);
  const selectionHandler = mapPage.slice(selectionStart, selectionEnd);
  assert.match(selectionHandler, /setRankedAssets\(\[\]\)/);
  assert.match(selectionHandler, /setSelectedPanchayat\(panchayat\)/);
  assert.match(mapPage, /const filteredAssets = useMemo\(\(\) => \{\s*return rankedAssets\.filter/);
  assert.doesNotMatch(mapPage.slice(mapPage.indexOf('<MarkerClusterGroup'), mapPage.indexOf('</MarkerClusterGroup>')), /rankedAssets\.map\(/);
});
