'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  payload: string;
  size?: number;
  className?: string;
}

export default function QRCodeDisplay({
  payload,
  size = 200,
  className = '',
}: QRCodeDisplayProps) {
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payload) return;
    QRCode.toDataURL(payload, {
      width: size,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setSvgUrl(url))
      .catch((err) => {
        console.error('Local QR generation error:', err);
        setError('Failed to generate QR');
      });
  }, [payload, size]);

  if (error) {
    return <div className="qr-error">{error}</div>;
  }

  if (!svgUrl) {
    return (
      <div
        className={`qr-loading ${className}`}
        style={{ width: size, height: size, background: '#f3f4f6', borderRadius: '8px' }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={svgUrl}
      alt="Pass QR Code"
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', borderRadius: '4px' }}
    />
  );
}
