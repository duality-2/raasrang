'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

interface QRCodeDisplayProps {
  payload: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export default function QRCodeDisplay({
  payload,
  size = 200,
  className = '',
  style,
}: QRCodeDisplayProps) {
  const [svgUrl, setSvgUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!payload) return;
    // Generate high-resolution raster for crisp scanning
    const renderWidth = Math.max(size, 240);
    QRCode.toDataURL(payload, {
      width: renderWidth,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'Q',
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
        style={{ width: '100%', height: '100%', background: '#f3f4f6', borderRadius: '4px', ...style }}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={svgUrl}
      alt="Pass QR Code"
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        ...style,
      }}
    />
  );
}
