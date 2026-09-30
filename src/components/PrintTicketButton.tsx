'use client';

export default function PrintTicketButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="btn btn-secondary no-print"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
    >
      🖨 Print Ticket
    </button>
  );
}
