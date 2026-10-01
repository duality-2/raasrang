'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireOrganiserOrTicketer } from '@/lib/auth';

/**
 * Mode A: Record that ticket was manually shared by ticketer via WhatsApp
 */
export async function recordManualShareAction(passId: string) {
  const { user, authorized, role } = await requireOrganiserOrTicketer();
  if (!authorized || !user) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const admin = createAdminClient();

    // Verify ticketer ownership
    if (role === 'ticketer') {
      const { data: existing } = await admin
        .from('passes')
        .select('created_by')
        .eq('id', passId)
        .single();
      if (!existing || existing.created_by !== user.id) {
        return { success: false, error: 'Forbidden: You can only update your own tickets' };
      }
    }

    // Update pass delivery_status on public.passes (allowed values: not_sent, sent, delivered, failed)
    await admin
      .from('passes')
      .update({
        delivery_status: 'sent',
        delivered_at: new Date().toISOString(),
      })
      .eq('id', passId);

    // Also attempt insertion into ticket_deliveries if migration 004 is active
    try {
      await admin.from('ticket_deliveries').insert({
        pass_id: passId,
        idempotency_key: `manual_share_${passId}_${Date.now()}`,
        channel: 'whatsapp_manual',
        delivery_status: 'manually_shared',
        delivered_at: new Date().toISOString(),
        created_by: user.id,
      });
    } catch {
      // Table may be pending migration 004 application
    }

    revalidatePath(`/dashboard/passes/${passId}`);
    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}

/**
 * Mode B: Automated delivery via WhatsApp Cloud API
 * As required by release invariants, automated delivery is strictly BLOCKED
 * until an official Meta Business Account, approved HSM template, and webhook are configured.
 */
export async function enqueueWhatsAppDeliveryAction() {
  return {
    success: false,
    error: 'Automated WhatsApp Cloud API delivery is BLOCKED pending verified Meta Business Account, approved template, and webhook credentials.',
  };
}
