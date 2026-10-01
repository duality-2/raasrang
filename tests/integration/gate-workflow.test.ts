import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

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

test('Integration: QR first, then Manual code => ALREADY_USED', async () => {
  const { userClient, userId } = await getOrganiserUserClient();
  const testToken = `test_qr_first_${Date.now()}`;
  const testManual = 'TEST-Q01A';

  // Provision isolated test pass
  const { data: pass, error: insErr } = await admin
    .from('passes')
    .insert({
      name: 'Automated Test Attendee 1',
      category: 'couple',
      status: 'unused',
      token: testToken,
      manual_code: testManual,
      created_by: userId,
    })
    .select()
    .single();
  assert.strictEqual(insErr, null);
  assert.ok(pass?.id, 'Pass must be created with ID');

  try {
    // 1. QR scan attempt => VALID
    const { data: r1, error: e1 } = await userClient.rpc('redeem_pass', {
      p_input_type: 'qr',
      p_input_value: testToken,
    });
    assert.strictEqual(e1, null);
    assert.strictEqual(r1.status, 'VALID');
    assert.strictEqual(r1.method, 'qr');

    // 2. Manual entry attempt on SAME pass => ALREADY_USED
    const { data: r2, error: e2 } = await userClient.rpc('redeem_pass', {
      p_input_type: 'manual',
      p_input_value: testManual,
    });
    assert.strictEqual(e2, null);
    assert.strictEqual(r2.status, 'ALREADY_USED');
    assert.strictEqual(Boolean(r2.used_at), true);
  } finally {
    if (pass?.id) {
      await admin.from('passes').delete().eq('id', pass.id);
    }
  }
});

test('Integration: Manual first, then QR code => ALREADY_USED', async () => {
  const { userClient, userId } = await getOrganiserUserClient();
  const testToken = `test_man_first_${Date.now()}`;
  const testManual = 'TEST-M01A';

  const { data: pass, error: insErr } = await admin
    .from('passes')
    .insert({
      name: 'Automated Test Attendee 2',
      category: 'stag_female',
      status: 'unused',
      token: testToken,
      manual_code: testManual,
      created_by: userId,
    })
    .select()
    .single();
  assert.strictEqual(insErr, null);
  assert.ok(pass?.id, 'Pass must be created with ID');

  try {
    // 1. Manual entry attempt => VALID
    const { data: r1, error: e1 } = await userClient.rpc('redeem_pass', {
      p_input_type: 'manual',
      p_input_value: testManual,
    });
    assert.strictEqual(e1, null);
    assert.strictEqual(r1.status, 'VALID');
    assert.strictEqual(r1.method, 'manual');

    // 2. QR scan attempt on SAME pass => ALREADY_USED
    const { data: r2, error: e2 } = await userClient.rpc('redeem_pass', {
      p_input_type: 'qr',
      p_input_value: testToken,
    });
    assert.strictEqual(e2, null);
    assert.strictEqual(r2.status, 'ALREADY_USED');
  } finally {
    if (pass?.id) {
      await admin.from('passes').delete().eq('id', pass.id);
    }
  }
});

test('Integration: Concurrent simultaneous redemption => exactly one VALID', async () => {
  const { userClient, userId } = await getOrganiserUserClient();
  const testToken = `test_race_${Date.now()}`;
  const testManual = 'TEST-RC01';

  const { data: pass, error: insErr } = await admin
    .from('passes')
    .insert({
      name: 'Automated Race Attendee',
      category: 'vip',
      status: 'unused',
      token: testToken,
      manual_code: testManual,
      created_by: userId,
    })
    .select()
    .single();
  assert.strictEqual(insErr, null);
  assert.ok(pass?.id, 'Pass must be created with ID');

  try {
    // Two simultaneous requests: one QR, one Manual
    const [resQR, resManual] = await Promise.all([
      userClient.rpc('redeem_pass', { p_input_type: 'qr', p_input_value: testToken }),
      userClient.rpc('redeem_pass', { p_input_type: 'manual', p_input_value: testManual }),
    ]);

    const statuses = [resQR.data?.status, resManual.data?.status];
    assert.strictEqual(statuses.includes('VALID'), true);
    assert.strictEqual(statuses.includes('ALREADY_USED'), true);
    assert.strictEqual(statuses.filter((s) => s === 'VALID').length, 1);
  } finally {
    if (pass?.id) {
      await admin.from('passes').delete().eq('id', pass.id);
    }
  }
});

test('Integration: Invalid, Cancelled, and Unauthorised redemption handling', async () => {
  const { userClient, userId } = await getOrganiserUserClient();
  const testToken = `test_canc_${Date.now()}`;
  const testManual = 'TEST-CN01';

  // 1. Invalid ticket seek
  const { data: invRes } = await userClient.rpc('redeem_pass', {
    p_input_type: 'manual',
    p_input_value: 'NONX-EXIST',
  });
  assert.strictEqual(invRes.status, 'INVALID');

  // 2. Cancelled ticket
  const { data: pass, error: canErr } = await admin
    .from('passes')
    .insert({
      name: 'Cancelled Attendee',
      category: 'vip',
      status: 'cancelled',
      token: testToken,
      manual_code: testManual,
      created_by: userId,
    })
    .select()
    .single();
  assert.strictEqual(canErr, null);
  assert.ok(pass?.id, 'Pass must be created with ID');

  try {
    const { data: canRes } = await userClient.rpc('redeem_pass', {
      p_input_type: 'manual',
      p_input_value: testManual,
    });
    assert.strictEqual(canRes.status, 'CANCELLED');
  } finally {
    if (pass?.id) {
      await admin.from('passes').delete().eq('id', pass.id);
    }
  }

  // 3. Anonymous caller denial (42501 permission denied)
  const anonClient = createClient(supabaseUrl, anonKey);
  const anonRes = await anonClient.rpc('redeem_pass', {
    p_input_type: 'manual',
    p_input_value: 'TEST-ANON',
  });
  assert.strictEqual(anonRes.error?.code, '42501');
});

test('Integration: Real attendee Julie Saxena record verification', async () => {
  const { data: julie, error } = await admin
    .from('passes')
    .select('id, name, status, used_at')
    .eq('name', 'Julie Saxena')
    .single();

  assert.strictEqual(error, null);
  assert.strictEqual(julie.name, 'Julie Saxena');
  assert.ok(julie.id, 'Julie Saxena pass must exist');
});
