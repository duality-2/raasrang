import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RAAS RANG 2026 — Organiser Portal',
  description: 'Event pass management and gate admission system for RAAS RANG 2026',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'RAAS RANG',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#3b0764',
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
