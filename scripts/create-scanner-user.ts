import { createClient } from '@supabase/supabase-js';
import { validateScannerPassword } from '../src/lib/utils.ts';

/**
 * Script to create the scanner user verification@raasrang.com with role: 'scanner'
 * in auth.users app_metadata (tamper-proof).
 *
 * STANDING RULE:
 * This script will NOT execute unless:
 * 1. The user explicitly passes the --execute flag
 * 2. SCANNER_PASSWORD is provided via environment variable
 * 3. Password passes strength checks (or warns if weak)
 */

async function main() {
  const isExecute = process.argv.includes('--execute');
  const password = process.env.SCANNER_PASSWORD;
  const email = 'verification@raasrang.com';

  console.log('====================================================');
  console.log('  RAAS RANG 2026 — Scanner User Provisioning Plan   ');
  console.log('====================================================\n');

  console.log(`Target Email:   ${email}`);
  console.log(`Target Role:    scanner (stored in auth.users app_metadata)`);
  console.log(`Auto Confirm:   true (bypasses email confirmation)`);
  console.log(`Mode:           ${isExecute ? '⚡ EXECUTE' : '🔍 DRY-RUN / PLAN ONLY'}\n`);

  // Check password
  if (!password) {
    console.error('❌ ERROR: SCANNER_PASSWORD environment variable is not set.');
    console.error('Please add SCANNER_PASSWORD to your .env.local file:');
    console.error('  SCANNER_PASSWORD=YourStrongPasswordHere!\n');
    process.exit(1);
  }

  // Validate password strength
  const validation = validateScannerPassword(password);
  if (!validation.valid) {
    console.warn('⚠️  WARNING: SCANNER_PASSWORD is weak:');
    validation.warnings.forEach((w) => console.warn(`   - ${w}`));
    console.warn('\nPlease choose a stronger password before creating the user.\n');
  } else {
    console.log('✅ Password strength check PASSED (meets length, case, digit, symbol requirements).\n');
  }

  if (!isExecute) {
    console.log('ℹ️  This was a plan-only run. No user was created.');
    console.log('To create the user after approval, run:');
    console.log('  node --env-file=.env.local --experimental-strip-types scripts/create-scanner-user.ts --execute\n');
    return;
  }

  // Execution path (only when --execute flag is passed)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ ERROR: Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  console.log('Connecting to Supabase admin API…');

  // Check if user already exists
  const { data: userList } = await admin.auth.admin.listUsers();
  const existing = userList?.users.find((u) => u.email === email);

  if (existing) {
    console.log(`User ${email} already exists (ID: ${existing.id}).`);
    console.log('Updating app_metadata to ensure role is scanner…');
    const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      app_metadata: { ...existing.app_metadata, role: 'scanner' },
    });
    if (updateErr) {
      console.error('❌ Failed to update existing user:', updateErr.message);
      process.exit(1);
    }
    console.log('✅ Successfully updated scanner user credentials and app_metadata.');
  } else {
    const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: {
        role: 'scanner',
      },
    });

    if (createErr) {
      console.error('❌ Failed to create scanner user:', createErr.message);
      process.exit(1);
    }

    console.log(`✅ Successfully created scanner user (ID: ${newUser.user.id}).`);
  }

  console.log('\nVerification complete. User is ready for gate scanning.');
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
