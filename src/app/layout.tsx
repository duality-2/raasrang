import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RAAS RANG 2026 — Organiser Portal',
  description: 'Event pass management system for RAAS RANG 2026',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
