'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { redeemPassAction } from '@/actions/verify';
import type { RedemptionResult, PassCategory } from '@/types';
import { CATEGORY_LABELS } from '@/types';
import { formatDate } from '@/lib/utils';

export default function EntryScanner() {
  const [activeTab, setActiveTab] = useState<'qr' | 'manual'>('qr');
  const [manualCode, setManualCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<RedemptionResult | null>(null);
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef(false);

  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // Start Camera Scanner
  const startCamera = async () => {
    setCameraError(null);
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader-container');
      }

      await html5QrCodeRef.current.start(
        { facingMode: 'environment' }, // Back camera for mobile/iPhone
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
        },
        onScanSuccess,
        () => {
          // ignore transient frame decode errors
        }
      );
      setScannerActive(true);
    } catch (err: unknown) {
      console.error('Camera startup error:', err);
      const errMsg = err instanceof Error ? err.message : String(err);
      setCameraError(
        `Unable to access camera (${errMsg}). You can use "Enter printed code" below.`
      );
      setScannerActive(false);
    }
  };

  const stopCamera = async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch (err) {
        console.error('Error stopping camera:', err);
      }
    }
    setScannerActive(false);
  };

  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // Frame detection handler
  const onScanSuccess = async (decodedText: string) => {
    if (isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      const response = await redeemPassAction('qr', decodedText);
      setResult(response);
    } catch (err) {
      console.error('QR verification failed:', err);
      setResult({
        status: 'ERROR',
        message: 'Network error or timeout. Pass was NOT verified.',
      });
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  // Manual code form submission
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isProcessingRef.current || !manualCode.trim()) return;

    isProcessingRef.current = true;
    setIsProcessing(true);

    try {
      const response = await redeemPassAction('manual', manualCode);
      setResult(response);
    } catch (err) {
      console.error('Manual verification failed:', err);
      setResult({
        status: 'ERROR',
        message: 'Network error or timeout. Pass was NOT verified.',
      });
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  const handleResetForNext = () => {
    setResult(null);
    setManualCode('');
    isProcessingRef.current = false;
  };

  return (
    <div className="verifier-container">
      {/* Top Two Obvious Options Bar */}
      <div className="verifier-mode-selector">
        <button
          type="button"
          onClick={() => setActiveTab('qr')}
          className={`verifier-mode-btn ${activeTab === 'qr' ? 'active' : ''}`}
        >
          📷 Scan QR
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('manual')}
          className={`verifier-mode-btn ${activeTab === 'manual' ? 'active' : ''}`}
        >
          ⌨ Enter printed code
        </button>
      </div>

      {/* Result Announcement Banner */}
      {result && (
        <div className={`verification-banner banner-${result.status.toLowerCase()}`}>
          <div className="banner-icon">
            {result.status === 'VALID' && '✓'}
            {result.status === 'ALREADY_USED' && '⚠'}
            {result.status === 'INVALID' && '✕'}
            {result.status === 'CANCELLED' && '⊘'}
            {result.status === 'ERROR' && '⚠'}
            {result.status === 'UNAUTHORIZED' && '🔒'}
          </div>
          <div className="banner-content">
            <div className="banner-headline">
              {result.status === 'VALID' && 'VALID PASS — ENTRY ALLOWED'}
              {result.status === 'ALREADY_USED' && 'ALREADY USED — ENTRY DENIED'}
              {result.status === 'INVALID' && 'INVALID PASS — NOT FOUND'}
              {result.status === 'CANCELLED' && 'CANCELLED PASS — ENTRY DENIED'}
              {result.status === 'ERROR' && 'VERIFICATION ERROR'}
              {result.status === 'UNAUTHORIZED' && 'UNAUTHORIZED'}
            </div>

            {result.pass && (
              <div className="banner-details">
                <div>
                  <strong>Attendee:</strong> {result.pass.name}
                </div>
                <div>
                  <strong>Category:</strong>{' '}
                  <span className={`badge badge-${result.pass.category}`}>
                    {CATEGORY_LABELS[result.pass.category as PassCategory] || result.pass.category}
                  </span>
                </div>
                {result.pass.manual_code && (
                  <div>
                    <strong>Code:</strong> <code>{result.pass.manual_code}</code>
                  </div>
                )}
              </div>
            )}

            {result.used_at && (
              <div className="banner-timestamp">
                {result.status === 'VALID' ? 'Checked in at: ' : 'First redeemed at: '}
                {formatDate(result.used_at)}
                {result.method && ` (via ${result.method.toUpperCase()})`}
              </div>
            )}

            {result.message && <div className="banner-message">{result.message}</div>}
          </div>

          <button
            type="button"
            onClick={handleResetForNext}
            className="btn btn-primary banner-action-btn"
          >
            Scan Next Pass
          </button>
        </div>
      )}

      {/* Verification In-Flight Overlay */}
      {isProcessing && (
        <div className="verify-processing-notice">
          <span className="spinner" /> Checking ticket in live database…
        </div>
      )}

      {/* Mode 1: Scan QR */}
      {activeTab === 'qr' && (
        <div className="card verifier-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Option 1: Scan QR</h2>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                Scan physical ticket QR code using your iPhone or Android camera
              </p>
            </div>
          </div>

          <div
            id="qr-reader-container"
            style={{
              width: '100%',
              minHeight: '280px',
              background: '#0a0a0a',
              borderRadius: '8px',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          />

          {cameraError && (
            <div className="alert alert-error" style={{ marginTop: '12px' }}>
              {cameraError}
            </div>
          )}

          <div style={{ marginTop: '16px', display: 'flex', gap: '8px' }}>
            {!scannerActive ? (
              <button
                type="button"
                onClick={startCamera}
                className="btn btn-primary"
                style={{ flex: 1, padding: '12px 20px', fontSize: '1rem' }}
                disabled={isProcessing}
              >
                📷 Start Camera Scanner
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="btn btn-secondary"
                style={{ flex: 1, padding: '12px 20px' }}
              >
                Stop Camera
              </button>
            )}
          </div>
        </div>
      )}

      {/* Mode 2: Enter printed code */}
      {activeTab === 'manual' && (
        <div className="card verifier-card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Option 2: Enter printed code</h2>
              <p className="text-muted" style={{ fontSize: '0.85rem' }}>
                Type the 8-character manual code printed on the physical pass
              </p>
            </div>
          </div>

          <form onSubmit={handleManualSubmit}>
            <div className="form-group">
              <label htmlFor="manual-code-input" className="form-label">
                Printed Ticket Code
              </label>
              <input
                id="manual-code-input"
                type="text"
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value.toUpperCase())}
                placeholder="e.g. K9X2-7M4P or K9X27M4P"
                className="form-input"
                style={{
                  fontFamily: 'monospace',
                  fontSize: '1.4rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  padding: '14px',
                  textAlign: 'center',
                }}
                maxLength={12}
                disabled={isProcessing}
                autoFocus
                autoComplete="off"
              />
              <div className="form-hint" style={{ textAlign: 'center' }}>
                Hyphens and spaces are handled automatically.
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '12px', padding: '12px', fontSize: '1rem' }}
              disabled={isProcessing || !manualCode.trim()}
            >
              {isProcessing ? 'Verifying…' : 'Verify & Redeem Ticket'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
