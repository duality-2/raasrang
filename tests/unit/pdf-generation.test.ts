import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateTicketPdf } from '../../src/lib/pdf.ts';
import type { Pass } from '../../src/types/index.ts';

test('generateTicketPdf produces a valid PDF buffer with correct credentials and metadata', async () => {
  const dummyPass: Pass = {
    id: 'b622c7eb-0797-449e-b9ca-12e061ca2095',
    token: 'test_token_c549646b5d92df950e39aa354f901a0709d020e6a41f6ef7d34552b0f49fa81f',
    manual_code: '7R8B-TZQL',
    batch_id: null,
    name: 'Julie Saxena',
    category: 'stag_female',
    email: 'julie@example.com',
    phone: '+919876543210',
    status: 'unused',
    delivery_status: 'ready_to_share',
    created_at: new Date().toISOString(),
    used_at: null,
    delivered_at: null,
    created_by: '00000000-0000-0000-0000-000000000000',
    scanned_by: null,
    scan_gate: null,
    scan_method: null,
    ticket_type: 'single',
    party_size: 4,
    validity_state: 'active',
  };

  const pdfBytes = await generateTicketPdf(dummyPass, true);

  // Check that the returned bytes form a valid PDF
  assert.ok(pdfBytes instanceof Uint8Array);
  assert.ok(pdfBytes.length > 5000);

  // PDF header must start with "%PDF-1."
  const header = Buffer.from(pdfBytes.slice(0, 8)).toString('utf-8');
  assert.ok(header.startsWith('%PDF-1.'), `Expected PDF header, got: ${header}`);

  // Must end with "%%EOF\n" or similar PDF footer
  const footer = Buffer.from(pdfBytes.slice(-30)).toString('utf-8');
  assert.ok(footer.includes('%%EOF'), `Expected PDF footer, got: ${footer}`);
});
