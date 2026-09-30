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

  return (
    <div className="batch-print-container">
      {/* Screen-only controls bar */}
      <div className="no-print print-control-bar">
        <div className="print-control-inner">
          <div>
            <Link href={`/dashboard/batches/${b.id}`} className="back-link">
              ← Back to Batch #{b.batch_number}
            </Link>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '4px 0 0' }}>
              Print Run: Batch #{b.batch_number} ({passList.length} Tickets)
            </h1>
            <p className="text-muted" style={{ fontSize: '0.85rem' }}>
              Optimised for physical ticket printing (A4 / Card stock). Each ticket has unique QR & manual code.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <PrintTicketButton />
          </div>
        </div>
      </div>

      {/* Printable Tickets Grid */}
      <div className="batch-tickets-sheet">
        {passList.map((pass, index) => (
          <div key={pass.id} className="ticket-print-wrapper">
            <PhysicalTicketCard pass={pass} ticketNumber={index + 1} />
          </div>
        ))}
      </div>
    </div>
  );
}
