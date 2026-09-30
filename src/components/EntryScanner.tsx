'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  const isPausedRef = useRef(false);

  // Synchronize processing ref
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // Clean stop camera helper
  const stopCamera = useCallback(async () => {
    if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
      try {
        await html5QrCodeRef.current.stop();
      } catch {
        // Ignored during normal teardown
      }
    }
    setScannerActive(false);
    isPausedRef.current = false;
  }, []);

  // Frame detection handler with immediate frame-locking
  const onScanSuccess = useCallback(async (decodedText: string) => {
    // Guard against simultaneous frames, double-taps, or existing result
    if (isProcessingRef.current || isPausedRef.current) return;

    isProcessingRef.current = true;
    isPausedRef.current = true;
    setIsProcessing(true);

    // Immediately pause scanning video stream to eliminate duplicate frame reads
    try {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.pause(true);
      }
    } catch {
      // Pause may fail on some mobile webviews; isPausedRef provides backup lock
    }

    try {
      const response = await redeemPassAction('qr', decodedText);
      setResult(response);
    } catch {
      // Ambiguous outcome handling: NEVER claim pass is unused
      setResult({
        status: 'ERROR',
        message:
          'Network timeout or interrupted connection. Pass may have already been recorded. Tap "Verify Next Pass" and re-verify immediately: an ALREADY_USED response with the current timestamp confirms entry was recorded.',
      });
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  }, []);

  // Start Camera Scanner with rear camera preferred
  const startCamera = useCallback(async () => {
    setCameraError(null);
    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader-container');
      }

      await html5QrCodeRef.current.start(
        { facingMode: { exact: 'environment' } }, // Prefer exact rear camera
        {
          fps: 10,
          qrbox: { width: 240, height: 240 },
          aspectRatio: 1.0,
        },
        onScanSuccess,
        () => {
          // Frame decode error ignored during idle frames
        }
      );
      setScannerActive(true);
      isPausedRef.current = false;
    } catch {
      // Fallback: try environment without 'exact' (for devices with 1 camera or desktop preview)
      try {
        if (!html5QrCodeRef.current) {
          html5QrCodeRef.current = new Html5Qrcode('qr-reader-container');
        }
        await html5QrCodeRef.current.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 240, height: 240 },
            aspectRatio: 1.0,
          },
          onScanSuccess,
          () => {}
        );
        setScannerActive(true);
        isPausedRef.current = false;
      } catch (fallbackErr: unknown) {
        const errMsg = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        setCameraError(
          `Camera unavailable (${errMsg}). Please check Safari permissions or use "Enter Code" mode below.`
        );
        setScannerActive(false);
      }
    }
  }, [onScanSuccess]);

  // Teardown camera when component unmounts or tab switches
  useEffect(() => {
    return () => {
      if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
        html5QrCodeRef.current.stop().catch(() => {});
      }
    };
  }, []);

  // Tab switching handler
  const handleTabSwitch = (newTab: 'qr' | 'manual') => {
    if (newTab === activeTab) return;
    if (activeTab === 'qr') {
      stopCamera();
    }
    setActiveTab(newTab);
    setCameraError(null);
  };

  // Format manual code as user types or pastes (XXXX-XXXX)
  const handleManualCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.length <= 4) {
      setManualCode(raw);
    } else {
      setManualCode(`${raw.slice(0, 4)}-${raw.slice(4, 8)}`);
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
    } catch {
      setResult({
        status: 'ERROR',
        message:
          'Network timeout or interrupted connection. Pass may have already been recorded. Re-enter code to verify: an ALREADY_USED response confirms check-in was saved.',
      });
    } finally {
      setIsProcessing(false);
      isProcessingRef.current = false;
    }
  };

  // Reset screen for next attendee scan (staff explicitly taps "Scan Next")
  const handleResetForNext = () => {
    setResult(null);
    setManualCode('');
    isProcessingRef.current = false;

    // If on QR tab and scanner was paused, resume it
    if (activeTab === 'qr' && scannerActive && html5QrCodeRef.current) {
      try {
        html5QrCodeRef.current.resume();
        isPausedRef.current = false;
      } catch {
        // If resume failed, re-start camera cleanly
        startCamera();
      }
    }
  };

  return (
    <div className="gate-scanner-shell">
      {/* ── Mode Selector: Two Clear Options ── */}
      <div className="gate-mode-selector" role="tablist" aria-label="Verification Mode">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'qr'}
          onClick={() => handleTabSwitch('qr')}
          className={`gate-mode-btn ${activeTab === 'qr' ? 'active' : ''}`}
        >
          📷 Scan QR
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'manual'}
          onClick={() => handleTabSwitch('manual')}
          className={`gate-mode-btn ${activeTab === 'manual' ? 'active' : ''}`}
        >
          ⌨ Enter Code
        </button>
      </div>

      {/* ── Prominent Full-Card Decision Result Banner ── */}
      {result && (
        <div
          className={`gate-result-card result-${result.status.toLowerCase()}`}
          role="alert"
          aria-live="assertive"
        >
          {/* Status Icon */}
          <div className="gate-result-icon">
            {result.status === 'VALID' && '✓'}
            {result.status === 'ALREADY_USED' && '✕'}
            {result.status === 'INVALID' && '✕'}
            {result.status === 'CANCELLED' && '⊘'}
            {(result.status === 'ERROR' || result.status === 'UNAUTHORIZED') && '⚠'}
          </div>

          {/* Primary Action Directive */}
          <div className="gate-result-headline">
            {result.status === 'VALID' && 'ALLOW ENTRY'}
            {result.status === 'ALREADY_USED' && 'DENY ENTRY — ALREADY USED'}
            {result.status === 'INVALID' && 'DENY ENTRY — INVALID PASS'}
            {result.status === 'CANCELLED' && 'DENY ENTRY — CANCELLED'}
            {result.status === 'UNAUTHORIZED' && 'DO NOT ADMIT — UNAUTHORISED'}
            {result.status === 'ERROR' && 'DO NOT ADMIT — TIMEOUT / ERROR'}
          </div>

          <div className="gate-result-subtext">
            {result.status === 'VALID' && 'Pass confirmed & checked in successfully.'}
            {result.status === 'ALREADY_USED' && 'This ticket was already redeemed. Do not allow secondary entry.'}
            {result.status === 'INVALID' && 'Ticket not found in event database. Confirm physical print.'}
            {result.status === 'CANCELLED' && 'This ticket has been revoked by event organisers.'}
            {result.status === 'UNAUTHORIZED' && 'Current organiser account is not authorised for gate duty.'}
            {result.status === 'ERROR' && 'Ambiguous connection status.'}
          </div>

          {/* Ticket Information */}
          {result.pass && (
            <div className="gate-ticket-details">
              <div className="gate-ticket-row">
                <span className="gate-row-label">Attendee:</span>
                <span className="gate-row-value gate-attendee-name">
                  {result.pass.name || 'Unassigned Ticket'}
                </span>
              </div>
              <div className="gate-ticket-row">
                <span className="gate-row-label">Category:</span>
                <span className={`badge badge-${result.pass.category}`}>
                  {CATEGORY_LABELS[result.pass.category as PassCategory] || result.pass.category}
                </span>
              </div>
              {result.pass.manual_code && (
                <div className="gate-ticket-row">
                  <span className="gate-row-label">Ticket Code:</span>
                  <code className="gate-ticket-code">{result.pass.manual_code}</code>
                </div>
              )}
            </div>
          )}

          {/* Timestamps */}
          {result.used_at && (
            <div className="gate-timestamp-box">
              {result.status === 'VALID' ? 'Checked in at: ' : 'First redeemed at: '}
              <strong>{formatDate(result.used_at)}</strong>
              {result.method && ` (via ${result.method.toUpperCase()})`}
            </div>
          )}

          {/* Detailed Safe Message or Gate Procedure */}
          {result.message && (
            <div className="gate-message-box">
              {result.message}
            </div>
          )}

          {/* Primary Action: Explicit Staff Tap to Scan Next */}
          <button
            type="button"
            onClick={handleResetForNext}
            className="btn btn-primary gate-next-btn"
            autoFocus
          >
            Scan Next Pass →
          </button>
        </div>
      )}

      {/* ── In-Flight Verification Notice ── */}
      {isProcessing && (
        <div className="gate-processing-card" role="status">
          <span className="spinner" />
          <span>Verifying ticket with database…</span>
        </div>
      )}

      {/* ── Mode 1: Camera Scanner Viewport ── */}
      {activeTab === 'qr' && !result && (
        <div className="gate-viewfinder-card">
          <div
            id="qr-reader-container"
            className="gate-camera-viewport"
            aria-label="QR Code Camera Viewfinder"
          />

          {cameraError && (
            <div className="alert alert-error mt-4" role="alert">
              <div>{cameraError}</div>
              <button
                type="button"
                onClick={() => handleTabSwitch('manual')}
                className="btn btn-secondary btn-sm mt-2"
              >
                Switch to Manual Code Entry →
              </button>
            </div>
          )}

          <div className="gate-camera-actions">
            {!scannerActive ? (
              <button
                type="button"
                onClick={startCamera}
                className="btn btn-primary gate-camera-toggle-btn"
                disabled={isProcessing}
              >
                📷 Start Camera Scanner
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                className="btn btn-secondary gate-camera-toggle-btn"
              >
                Stop Camera
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Mode 2: Manual Code Entry Form ── */}
      {activeTab === 'manual' && !result && (
        <div className="gate-manual-card">
          <form onSubmit={handleManualSubmit} className="gate-manual-form">
            <label htmlFor="manual-ticket-code" className="gate-input-label">
              Printed 8-Character Ticket Code
            </label>
            <input
              id="manual-ticket-code"
              type="text"
              value={manualCode}
              onChange={handleManualCodeChange}
              placeholder="e.g. 7R8B-TZQL"
              className="form-input gate-manual-input"
              maxLength={9}
              disabled={isProcessing}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck="false"
            />
            <div className="gate-input-hint">
              Hyphen is formatted automatically. Spaces and lowercase are accepted.
            </div>

            <button
              type="submit"
              className="btn btn-primary gate-manual-submit-btn"
              disabled={isProcessing || manualCode.replace(/[^A-Z0-9]/g, '').length !== 8}
            >
              {isProcessing ? 'Verifying…' : 'Verify & Authorise Entry'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
