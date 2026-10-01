import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import type { TicketBatch, Pass } from '@/types';
import PhysicalTicketCard from '@/components/PhysicalTicketCard';
import PrintTicketButton from '@/components/PrintTicketButton';

interface BatchPrintPageProps {
  params: Promise<{ id: string }>;
}

export default async function BatchPrintPage({ params }: BatchPrintPageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: batch, error: batchError } = await supabase
    .from('ticket_batches')
    .select('*')
    .eq('id', id)
    .single();

  if (batchError || !batch) {
    notFound();
  }

  const b = batch as TicketBatch;

  const { data: passes, error: passesError } = await supabase
    .from('passes')
    .select('*')
    .eq('batch_id', id)
    .order('created_at', { ascending: true });

  if (passesError || !passes) {
    notFound();
  }

  const passList = passes as Pass[];
  const isTestBatch = /test|sample|demo/i.test(b.name);

  return (
    <div className="batch-print-container">
      {/* ── Screen-only controls bar ── */}
      <div className="no-print print-control-bar">
        <div className="print-control-inner">
          <div className="print-control-header">
            <Link href={`/dashboard/batches/${b.id}`} className="back-link">
              ← Back to Batch #{b.batch_number} Details
            </Link>
            <div className="print-batch-title-row">
              <h1 className="print-batch-title">
                Print Run: Batch #{b.batch_number} — {b.name}
              </h1>
              {isTestBatch ? (
                <span className="badge badge-test" style={{ background: '#451a03', color: '#f59e0b', border: '1px solid #d97706' }}>
                  🧪 TEST BATCH
                </span>
              ) : (
                <span className="badge badge-live" style={{ background: '#064e3b', color: '#34d399', border: '1px solid #059669' }}>
                  ✓ OFFICIAL EVENT INVENTORY
                </span>
              )}
            </div>
            <p className="text-muted" style={{ fontSize: '0.85rem', marginTop: '4px' }}>
              Contains <strong>{passList.length} physical passes</strong>. Optimised for standard A4 paper (2 tickets per row, clean margins, no clipped QR codes).
            </p>
          </div>

          <div className="print-actions-wrapper">
            <PrintTicketButton />
          </div>
        </div>

        {/* Test Batch Warning Banner */}
        {isTestBatch && (
          <div className="alert alert-warning mt-3" style={{ background: '#291807', border: '1px solid #d97706', color: '#fef3c7' }}>
            <span>⚠</span>
            <span>
              <strong>Warning:</strong> This batch is labeled as a TEST RUN ({b.name}). Verify batch details before printing physical event tickets.
            </span>
          </div>
        )}
      </div>

      {/* ── Printable Tickets Grid ── */}
      <div className="batch-tickets-sheet">
        {passList.map((pass, index) => (
          <div key={pass.id} className="ticket-print-wrapper">
            <PhysicalTicketCard pass={pass} ticketNumber={index + 1} isTestBatch={isTestBatch} />
          </div>
        ))}
      </div>
    </div>
  );
}
