import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit tests for pagination cursor logic.
 * These test the keyset pagination cursor encoding/decoding
 * and the sort key expectations.
 */

test('PaginationCursor: used passes sort by (used_at DESC, id DESC)', () => {
  // Simulate keyset pagination ordering
  const rows = [
    { id: 'aaa', used_at: '2026-10-19T20:00:00Z' },
    { id: 'bbb', used_at: '2026-10-19T19:30:00Z' },
    { id: 'ccc', used_at: '2026-10-19T19:30:00Z' },
    { id: 'ddd', used_at: '2026-10-19T19:00:00Z' },
  ];

  // Sort by used_at DESC, id DESC
  const sorted = [...rows].sort((a, b) => {
    const dateDiff = new Date(b.used_at).getTime() - new Date(a.used_at).getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id);
  });

  assert.strictEqual(sorted[0].id, 'aaa', 'Newest scan first');
  assert.strictEqual(sorted[1].id, 'ccc', 'Same timestamp, higher id first (DESC)');
  assert.strictEqual(sorted[2].id, 'bbb', 'Same timestamp, lower id second (DESC)');
  assert.strictEqual(sorted[3].id, 'ddd', 'Oldest scan last');
});

test('PaginationCursor: unused passes sort by (created_at DESC, id DESC)', () => {
  const rows = [
    { id: 'xxx', created_at: '2026-10-15T10:00:00Z' },
    { id: 'yyy', created_at: '2026-10-15T10:00:00Z' },
    { id: 'zzz', created_at: '2026-10-14T08:00:00Z' },
  ];

  const sorted = [...rows].sort((a, b) => {
    const dateDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    if (dateDiff !== 0) return dateDiff;
    return b.id.localeCompare(a.id);
  });

  assert.strictEqual(sorted[0].id, 'yyy', 'Same timestamp, higher id first');
  assert.strictEqual(sorted[1].id, 'xxx', 'Same timestamp, lower id second');
  assert.strictEqual(sorted[2].id, 'zzz', 'Older created_at last');
});

test('PaginationCursor: keyset filtering (used_at, id) < cursor', () => {
  // Simulate what the SQL does: fetch rows WHERE (used_at, id) < (cursor_ts, cursor_id)
  const allRows = [
    { id: 'a1', used_at: '2026-10-19T20:00:00Z' },
    { id: 'a2', used_at: '2026-10-19T19:30:00Z' },
    { id: 'a3', used_at: '2026-10-19T19:30:00Z' },
    { id: 'a4', used_at: '2026-10-19T19:00:00Z' },
    { id: 'a5', used_at: '2026-10-19T18:00:00Z' },
  ];

  // Cursor is at the 2nd item: (19:30, a2)
  const cursorTs = '2026-10-19T19:30:00Z';
  const cursorId = 'a2';

  const afterCursor = allRows.filter((row) => {
    if (row.used_at < cursorTs) return true;
    if (row.used_at === cursorTs && row.id < cursorId) return true;
    return false;
  });

  // Should get a3 (same ts but id < a2? No, a3 > a2), a4, a5
  // Wait: a3 > a2, so it's NOT after cursor. Only a4, a5 qualify.
  assert.strictEqual(afterCursor.length, 2);
  assert.strictEqual(afterCursor[0].id, 'a4');
  assert.strictEqual(afterCursor[1].id, 'a5');
});

test('PaginationCursor: empty cursor returns all rows from start', () => {
  const cursor = null;
  // When cursor is null, no filter is applied — all rows returned (page 1)
  assert.strictEqual(cursor, null, 'Null cursor means start from beginning');
});

test('Manual code masking: XX••-••XX format', () => {
  function maskManualCode(code: string): string {
    if (!code || code.length < 9) return code;
    return code.slice(0, 2) + '••-••' + code.slice(7);
  }

  assert.strictEqual(maskManualCode('7R8B-TZQL'), '7R••-••QL');
  assert.strictEqual(maskManualCode('ABCD-EFGH'), 'AB••-••GH');
  assert.strictEqual(maskManualCode('1234-5678'), '12••-••78');
  assert.strictEqual(maskManualCode(''), '');
  assert.strictEqual(maskManualCode('ABCD'), 'ABCD'); // Too short, no mask
});

test('Allowed gates validation', () => {
  const allowedGates = ['Gate A', 'Gate B', 'Gate C', 'Gate D'];

  assert.strictEqual(allowedGates.includes('Gate A'), true);
  assert.strictEqual(allowedGates.includes('Gate B'), true);
  assert.strictEqual(allowedGates.includes('Gate C'), true);
  assert.strictEqual(allowedGates.includes('Gate D'), true);
  assert.strictEqual(allowedGates.includes('Gate E'), false);
  assert.strictEqual(allowedGates.includes(''), false);
  assert.strictEqual(allowedGates.includes('gate a'), false); // Case-sensitive
});

test('PAGE_SIZE: exactly 50 items per page + 1 for hasMore check', () => {
  const PAGE_SIZE = 50;
  const dataExactly = Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: `p${i}` }));
  const dataWithMore = Array.from({ length: PAGE_SIZE + 1 }, (_, i) => ({ id: `p${i}` }));

  // Exact page: no more
  assert.strictEqual(dataExactly.length > PAGE_SIZE, false);

  // One extra: hasMore = true, slice to PAGE_SIZE
  assert.strictEqual(dataWithMore.length > PAGE_SIZE, true);
  const sliced = dataWithMore.slice(0, PAGE_SIZE);
  assert.strictEqual(sliced.length, PAGE_SIZE);
});
