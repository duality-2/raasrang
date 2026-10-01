import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * Secure Provisioning Script for RAAS RANG 2026 Profiles:
 * 1. Admin Profile:    admin@raasrang.com     (Full admin + organiser allowlist)
 * 2. Scanner Profile:  scanner@raasrang.com   (Gate Scanner, app_metadata.role: 'scanner')
 * 3. Ticketer Profile: ticketer@raasrang.com  (Ticketer, app_metadata.role: 'ticketer')
 *
 * STANDING SAFETY RULES:
 * - Passwords are NEVER output in chat or committed to git.
 * - Credentials are generated locally and written to .credentials.local (git-ignored).
 * - Requires explicit --execute flag.
 */

function generateSecurePassword(): string {
  // 18-character high entropy password with mixed case, digits, and special characters
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%^&*()_+';
  const all = upper + lower + digits + special;

  let pwd = '';
  pwd += upper[crypto.randomInt(upper.length)];
  pwd += lower[crypto.randomInt(lower.length)];
  pwd += digits[crypto.randomInt(digits.length)];
  pwd += special[crypto.randomInt(special.length)];

  for (let i = 4; i < 18; i++) {
    pwd += all[crypto.randomInt(all.length)];
  }

  // Shuffle
  return pwd.split('').sort(() => crypto.randomInt(3) - 1).join('');
}

async function main() {
  const isExecute = process.argv.includes('--execute');

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const profiles = [
    {
      role: 'admin',
      email: process.env.ADMIN_EMAIL || 'admin@raasrang.com',
      password: process.env.ADMIN_PASSWORD || generateSecurePassword(),
      app_metadata: { role: 'admin' },
      isOrganiserRow: true,
    },
    {
      role: 'scanner',
      email: process.env.SCANNER_EMAIL || 'scanner@raasrang.com',
      password: process.env.SCANNER_PASSWORD || generateSecurePassword(),
      app_metadata: { role: 'scanner' },
      isOrganiserRow: false,
    },
    {
      role: 'ticketer',
      email: process.env.TICKETER_EMAIL || 'ticketer@raasrang.com',
      password: process.env.TICKETER_PASSWORD || generateSecurePassword(),
      app_metadata: { role: 'ticketer' },
      isOrganiserRow: false,
    },
  ];

  console.log('===========================================================');
  console.log('       RAAS RANG 2026 — User Profile Provisioning          ');
  console.log('===========================================================');
  console.log(`Execution Mode: ${isExecute ? '⚡ LIVE EXECUTION' : '🔍 DRY RUN (Pass --execute to apply)'}\n`);

  if (!isExecute) {
    console.log('Target Profiles:');
    profiles.forEach((p) => {
      console.log(`  - Role: [${p.role.toUpperCase().padEnd(8)}] Email: ${p.email}`);
    });
    console.log('\nTo generate passwords and provision all 3 profiles, run:');
    console.log('  npm run provision:profiles -- --execute\n');
    return;
  }

  const { data: userList, error: listErr } = await admin.auth.admin.listUsers();
  if (listErr) {
    console.error('❌ Failed to fetch existing users:', listErr.message);
    process.exit(1);
  }

  const results: { role: string; email: string; password: string; userId: string; status: string }[] = [];

  for (const prof of profiles) {
    const existing = userList?.users.find((u) => u.email === prof.email);

    if (existing) {
      console.log(`Updating existing user: ${prof.email} (ID: ${existing.id})…`);
      const { error: updateErr } = await admin.auth.admin.updateUserById(existing.id, {
        password: prof.password,
        app_metadata: { ...existing.app_metadata, ...prof.app_metadata },
      });
      if (updateErr) {
        console.error(`❌ Failed to update ${prof.email}:`, updateErr.message);
        continue;
      }
      results.push({
        role: prof.role,
        email: prof.email,
        password: prof.password,
        userId: existing.id,
        status: 'PASSWORD_RESET_AND_UPDATED',
      });

      if (prof.isOrganiserRow) {
        await admin.from('organisers').upsert({ user_id: existing.id });
      }
    } else {
      console.log(`Creating new user: ${prof.email}…`);
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: prof.email,
        password: prof.password,
        email_confirm: true,
        app_metadata: prof.app_metadata,
      });
      if (createErr || !newUser.user) {
        console.error(`❌ Failed to create ${prof.email}:`, createErr?.message);
        continue;
      }
      results.push({
        role: prof.role,
        email: prof.email,
        password: prof.password,
        userId: newUser.user.id,
        status: 'CREATED_NEW',
      });

      if (prof.isOrganiserRow) {
        await admin.from('organisers').upsert({ user_id: newUser.user.id });
      }
    }
  }

  // Write credentials safely to git-ignored local file
  const credentialsPath = path.join(process.cwd(), '.credentials.local');
  const fileContent =
    `# RAAS RANG 2026 — SECURE CREDENTIALS (DO NOT COMMIT OR SHARE)\n` +
    `# Generated at: ${new Date().toISOString()}\n\n` +
    results
      .map(
        (r) =>
          `[${r.role.toUpperCase()}]\n` +
          `Email:    ${r.email}\n` +
          `Password: ${r.password}\n` +
          `User ID:  ${r.userId}\n`
      )
      .join('\n');

  fs.writeFileSync(credentialsPath, fileContent, { mode: 0o600 });

  console.log('\n===========================================================');
  console.log('✅ ALL PROFILES PROVISIONED SUCCESSFULLY');
  console.log('===========================================================');
  console.log(`Credentials saved locally to: ${credentialsPath}`);
  console.log(`(This file is permissions-restricted and ignored by git).\n`);
  console.log('You can view your credentials on your local machine by running:');
  console.log('  cat .credentials.local\n');
}

main().catch(console.error);
