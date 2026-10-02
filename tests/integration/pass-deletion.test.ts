import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

// Setup Supabase admin client for creating test data
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// SAFETY GUARD: Never run integration tests against production project ciqzldfnprxtkerxalrm under any circumstances
const isProductionUrl = supabaseUrl.includes('ciqzldfnprxtkerxalrm');

if (isProductionUrl) {
  console.error('\n🛑 SAFETY ENFORCEMENT: Integration tests are UNCONDITIONALLY FORBIDDEN against production project ciqzldfnprxtkerxalrm.');
  console.error('Integration tests may only run against an isolated local or dedicated staging Supabase environment.');
  console.error('Aborting test run immediately.\n');
  process.exit(1);
}

const isOptIn = process.env.STAGING_TEST_CONFIRM === 'true';
if (!isOptIn) {
  console.warn('\n⚠️  SAFETY NOTICE: Live integration tests require STAGING_TEST_CONFIRM=true on an isolated staging database.\n');
  process.exit(0);
}

const admin = createClient(supabaseUrl, serviceRoleKey);

// Helper to obtain a real authenticated organiser user JWT for testing RPC
async function getOrganiserUserClient() {
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: 'admin@raasrang.com',
  });
  if (linkErr) throw linkErr;

  const anon = createClient(supabaseUrl, anonKey);
  const { data: sessionData, error: sessErr } = await anon.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessErr) throw sessErr;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionData.session?.access_token}`,
      },
    },
  });

  return { userClient, userId: sessionData.user?.id };
}

test('Integration: Pass Deletion and Cancellation Rules', async (t) => {
  const { userClient, userId } = await getOrganiserUserClient();

  // Helper to create a pass
  const createTestPass = async (manualCode: string) => {
    const token = `TEST-DEL-TOKEN-${Date.now()}-${Math.random()}`;
    const { data: pass, error } = await admin
      .from('passes')
      .insert({
        token,
        manual_code: manualCode,
        name: 'Delete Test User',
        category: 'vip',
        status: 'unused',
        created_by: userId,
        ticket_type: 'single',
        party_size: 1,
        valid_night_id: 'night_1'
      })
      .select('id')
      .single();
    
    assert.strictEqual(error, null);
    return { pass, token };
  };

  await t.test('Deleting an admitted pass is blocked and Cancelling succeeds while preserving admissions', async () => {
    const { pass, token } = await createTestPass('DEL-1234');
    
    try {
      // 1. Admit the pass
      const { data: redeemRes, error: redeemErr } = await userClient.rpc('redeem_pass', {
        p_input_type: 'qr',
        p_input_value: token,
      });
      assert.strictEqual(redeemErr, null);
      assert.strictEqual(redeemRes.status, 'VALID');

      // 2. Attempt hard delete via DB (simulating what the server action tries)
      const { error: delErr } = await admin.from('passes').delete().eq('id', pass.id);
      
      // Foreign key constraint violation (23503) should block it
      assert.ok(delErr, 'Should error when deleting admitted pass');
      assert.strictEqual(delErr?.code, '23503', 'Should be a foreign key constraint violation (RESTRICT)');

      // 3. Cancel the pass instead
      const { error: cancelErr } = await admin.from('passes').update({ status: 'cancelled' }).eq('id', pass.id);
      assert.strictEqual(cancelErr, null, 'Cancelling should succeed');

      // 4. Verify admission rows remain
      const { data: admissions, error: admErr } = await admin.from('admissions').select('id').eq('pass_id', pass.id);
      assert.strictEqual(admErr, null);
      assert.strictEqual(admissions?.length, 1, 'Admission row should remain after cancellation');
      
    } finally {
      // Clean up: must delete admissions FIRST, then pass.
      await admin.from('admissions').delete().eq('pass_id', pass.id);
      await admin.from('passes').delete().eq('id', pass.id);
    }
  });

  await t.test('Deleting an unused test pass works', async () => {
    const { pass } = await createTestPass('DEL-5678');
    
    // 1. Attempt hard delete on unused pass
    const { error: delErr } = await admin.from('passes').delete().eq('id', pass.id);
    
    // Should succeed because there are no admissions
    assert.strictEqual(delErr, null, 'Should successfully delete unused pass');
  });
});
