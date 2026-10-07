import assert from 'node:assert/strict';
import test from 'node:test';
import {
  complaintAssetPanchayatQuery,
  filterComplaintAssetsByPanchayat,
  normalizeComplaintPanchayats,
  resetComplaintPanchayatFields,
  selectComplaintPanchayat,
  shouldUseAssetLocation
} from './complaintPanchayatForm.mjs';

test('grievance Panchayat options come from valid API records', () => {
  assert.deepEqual(normalizeComplaintPanchayats([
    { _id: 'a', name: 'Panchayat A' },
    { _id: 'b', name: 'Panchayat B' },
    { name: 'Incomplete' }
  ]).map(({ _id }) => _id), ['a', 'b']);
  assert.deepEqual(normalizeComplaintPanchayats({ items: [] }), []);
});

test('selecting Panchayat A or B clears all previous Panchayat-dependent form values', () => {
  for (const selectedPanchayatId of ['a', 'b']) {
    assert.deepEqual(selectComplaintPanchayat(selectedPanchayatId), {
      selectedPanchayatId,
      infrastructureId: '', ward: '', village: '', assets: []
    });
  }
});

test('known-asset requests are scoped to the selected Panchayat', () => {
  assert.equal(complaintAssetPanchayatQuery('panchayat A'), '/priorities?panchayatId=panchayat%20A');
  assert.equal(complaintAssetPanchayatQuery('panchayat B'), '/priorities?panchayatId=panchayat%20B');
  assert.equal(complaintAssetPanchayatQuery(''), null);
});

test('known-asset results from another Panchayat are excluded', () => {
  const assets = [
    { _id: 'asset-a', panchayatId: 'a' },
    { _id: 'asset-b', panchayatId: 'b' }
  ];
  assert.deepEqual(filterComplaintAssetsByPanchayat(assets, 'a').map(({ _id }) => _id), ['asset-a']);
  assert.deepEqual(filterComplaintAssetsByPanchayat(assets, 'b').map(({ _id }) => _id), ['asset-b']);
  assert.deepEqual(filterComplaintAssetsByPanchayat(assets, ''), []);
});

test('an asset location is used only when no location is already selected', () => {
  assert.equal(shouldUseAssetLocation(null), true);
  assert.equal(shouldUseAssetLocation([77.1, 12.2]), false);
});
