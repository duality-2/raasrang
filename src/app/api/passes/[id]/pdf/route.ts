import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getUserRole } from '@/lib/auth';
import { generateTicketPdf } from '@/lib/pdf';
import type { Pass } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  // 1. Authenticate caller
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  // 2. Authorize caller role
  const role = await getUserRole(user.id, user.app_metadata);
  if (!role || role === 'scanner') {
    return new NextResponse('Forbidden: Scanners and unauthorised roles cannot export or print PDFs', {
      status: 403,
    });
  }

  // 3. Fetch pass with admin client (so ticketer is not blocked by pre-004 RLS)
  const admin = createAdminClient();
  const { data: pass, error: passError } = await admin
    .from('passes')
    .select('*')
    .eq('id', id)
    .single();

  if (passError || !pass) {
    return new NextResponse('Pass not found', { status: 404 });
  }

  const p = pass as Pass;

  // 4. If ticketer, enforce they can only download their own passes
  if (role === 'ticketer' && p.created_by !== user.id) {
    return new NextResponse('Forbidden: Ticketers can only access their own passes', {
      status: 403,
    });
  }

  // 5. Generate PDF in-memory (never written to /public)
  const isTest = request.nextUrl.searchParams.get('test') === 'true';
  const pdfBytes = await generateTicketPdf(p, isTest);

  // 6. Return private stream
  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="raasrang-ticket-${p.manual_code}.pdf"`,
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
