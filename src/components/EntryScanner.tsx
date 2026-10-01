'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { previewTicketAction, admitPassAction } from '@/actions/verify';
import type {
  TicketPreviewResult,
  AdmitPassResult,
  PassCategory,
  GateName,
} from '@/types';
import { CATEGORY_LABELS, ALLOWED_GATES } from '@/types';
import { formatDate } from '@/lib/utils';
import {
  playPassSound,
  playRejectSound,
  isMuted,
  setMuted as storeMuted,
  getStoredGate,
  setStoredGate,
} from '@/lib/sounds';

interface EntryScannerProps {
  userRole: import('@/types').UserRole;
}

export default function EntryScanner({ userRole }: EntryScannerProps) {
  const [activeTab, setActiveTab] = useState<'qr' | 'manual'>('qr');
  const [manualCode, setManualCode] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingLabel, setProcessingLabel] = useState('Verifying ticket…');

  // Gate selector state
  const [selectedGate, setSelectedGate] = useState<string>('');
  const [showGateSelector, setShowGateSelector] = useState(false);

  // Sound state
  const [muted, setMutedState] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  // Flash state
  const [flashColor, setFlashColor] = useState<'green' | 'red' | null>(null);

  // Two-step Gate Flow State
  const [preview, setPreview] = useState<TicketPreviewResult | null>(null);
  const [selectedCount, setSelectedCount] = useState<number | null>(null);
  const [admissionResult, setAdmissionResult] = useState<AdmitPassResult | null>(null);

  // Active input being admitted
  const currentInputRef = useRef<{ type: 'qr' | 'manual'; value: string } | null>(null);

  // Scanner refs
  const html5QrCodeRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef(false);
  const isPausedRef = useRef(false);
  const lastScannedTokenRef = useRef<string | null>(null);
  const lastScannedTimestampRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const [scannerActive, setScannerActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  // Synchronize processing ref
  useEffect(() => {
    isProcessingRef.current = isProcessing;
  }, [isProcessing]);

  // Initialize gate from localStorage and check if we need gate selector
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      const stored = getStoredGate();
      if (stored && ALLOWED_GATES.includes(stored as GateName)) {
        setSelectedGate(stored);
      } else {
        setShowGateSelector(true);
      }
      setMutedState(isMuted());
    });
    mountedRef.current = true;
    return () => {
      cancelAnimationFrame(frame);
      mountedRef.current = false;
    };
  }, []);

  // Initialize AudioContext on user gesture (iOS Safari requirement)
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext
      )();
    }
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Flash screen effect
  const triggerFlash = useCallback((color: 'green' | 'red') => {
    setFlashColor(color);
    setTimeout(() => {
      if (mountedRef.current) setFlashColor(null);
    }, 600);
  }, []);

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

  // ── Step 1: Read-Only Ticket Preview ──
  const handleInspectTicket = useCallback(
    async (type: 'qr' | 'manual', rawValue: string) => {
      if (isProcessingRef.current) return;

      isProcessingRef.current = true;
      setIsProcessing(true);
      setProcessingLabel('Checking ticket allowance…');
      currentInputRef.current = { type, value: rawValue };

      try {
        const previewRes = await previewTicketAction(type, rawValue);
        if (!mountedRef.current) return;

        if (previewRes.status !== 'VALID') {
          // Denied on preview (e.g. CANCELLED, OUTSIDE_EVENT_WINDOW, NIGHT_NOT_INCLUDED, TICKET_COMPLETE, NIGHT_FULL, INVALID, UNAUTHORIZED)
          setAdmissionResult({
            status: previewRes.status,
            name: previewRes.name,
            category: previewRes.category,
            ticket_type: previewRes.ticket_type,
            remaining_count: previewRes.remaining_count ?? 0,
            message: previewRes.message,
          });
          triggerFlash('red');
          if (!isMuted() && audioContextRef.current) {
            playRejectSound(audioContextRef.current);
          }
        } else {
          // Valid ticket allowance found
          setPreview(previewRes);
          // For single-person allowance, pre-select 1; for groups, leave unselected for explicit staff choice
          if (previewRes.remaining_count === 1) {
            setSelectedCount(1);
          } else {
            setSelectedCount(null);
          }
        }
      } catch {
        if (!mountedRef.current) return;
        setAdmissionResult({
          status: 'ERROR',
          message: 'Network timeout previewing ticket. DO NOT ADMIT.',
        });
        triggerFlash('red');
        if (!isMuted() && audioContextRef.current) {
          playRejectSound(audioContextRef.current);
        }
      } finally {
        if (mountedRef.current) {
          setIsProcessing(false);
          isProcessingRef.current = false;
        }
      }
    },
    [triggerFlash]
  );

  // ── Step 2: Authoritative Atomic Admission ──
  const handleConfirmAdmission = async () => {
    if (!currentInputRef.current || !selectedCount || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setIsProcessing(true);
    setProcessingLabel(`Admitting ${selectedCount} ${selectedCount === 1 ? 'person' : 'people'}…`);

    const clientRequestId =
      'req_' +
      (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).substring(2));

    try {
      const result = await admitPassAction(
        currentInputRef.current.type,
        currentInputRef.current.value,
        selectedCount,
        selectedGate || 'Gate A',
        clientRequestId
      );

      if (!mountedRef.current) return;

      setPreview(null);
      setAdmissionResult(result);

      if (result.status === 'ADMIT_N') {
        triggerFlash('green');
        if (!isMuted() && audioContextRef.current) {
          playPassSound(audioContextRef.current);
        }
      } else {
        triggerFlash('red');
        if (!isMuted() && audioContextRef.current) {
          playRejectSound(audioContextRef.current);
        }
      }
    } catch {
      if (!mountedRef.current) return;
      setPreview(null);
      setAdmissionResult({
        status: 'ERROR',
        message: 'Network timeout during admission. DO NOT ADMIT. Ambiguous outcome.',
      });
      triggerFlash('red');
      if (!isMuted() && audioContextRef.current) {
        playRejectSound(audioContextRef.current);
      }
    } finally {
      if (mountedRef.current) {
        setIsProcessing(false);
        isProcessingRef.current = false;
      }
    }
  };

  // QR Frame detection handler with immediate frame-locking and duplicate suppression
  const onScanSuccess = useCallback(
    async (decodedText: string) => {
      if (isProcessingRef.current || isPausedRef.current || preview || admissionResult) return;

      const now = Date.now();
      if (
        decodedText === lastScannedTokenRef.current &&
        now - lastScannedTimestampRef.current < 6000
      ) {
        return;
      }

      isPausedRef.current = true;
      lastScannedTokenRef.current = decodedText;
      lastScannedTimestampRef.current = now;

      // Lock stream immediately
      try {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning) {
          html5QrCodeRef.current.pause(true);
        }
      } catch {
        // Fallback lock handled by isPausedRef
      }

      await handleInspectTicket('qr', decodedText);
    },
    [handleInspectTicket, preview, admissionResult]
  );

  // Start Camera Scanner with rear camera preferred
  const startCamera = useCallback(async () => {
    setCameraError(null);
    ensureAudioContext();

    try {
      if (!html5QrCodeRef.current) {
        html5QrCodeRef.current = new Html5Qrcode('qr-reader-container', {
          experimentalFeatures: {
            useBarCodeDetectorIfSupported: true,
          },
          verbose: false,
        });
      }

      await html5QrCodeRef.current.start(
        { facingMode: { exact: 'environment' } },
        {
          fps: 20,
          qrbox: { width: 260, height: 260 },
          aspectRatio: 1.0,
        },
        onScanSuccess,
        () => {}
      );
      setScannerActive(true);
      isPausedRef.current = false;
    } catch {
      // Fallback: try environment without 'exact'
      try {
        if (!html5QrCodeRef.current) {
          html5QrCodeRef.current = new Html5Qrcode('qr-reader-container', {
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true,
            },
            verbose: false,
          });
        }
        await html5QrCodeRef.current.start(
          { facingMode: 'environment' },
          {
            fps: 20,
            qrbox: { width: 260, height: 260 },
            aspectRatio: 1.0,
          },
          onScanSuccess,
          () => {}
        );
        setScannerActive(true);
        isPausedRef.current = false;
      } catch (fallbackErr: unknown) {
        const errMsg =
          fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
        setCameraError(
          `Camera unavailable (${errMsg}). Please check Safari permissions or use "Enter Code" mode below.`
        );
        setScannerActive(false);
      }
    }
  }, [onScanSuccess, ensureAudioContext]);

  // Auto-start camera when QR tab is active and gate is selected
  useEffect(() => {
    if (
      activeTab === 'qr' &&
      selectedGate &&
      !showGateSelector &&
      !scannerActive &&
      !preview &&
      !admissionResult
    ) {
      const timer = setTimeout(() => {
        if (mountedRef.current) {
          startCamera();
        }
      }, 200);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedGate, showGateSelector]);

  // Handle tab backgrounding — pause decoder, resume on return
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        if (html5QrCodeRef.current && html5QrCodeRef.current.isScanning && !isPausedRef.current) {
          try {
            html5QrCodeRef.current.pause(true);
          } catch {
            /* ignore */
          }
        }
      } else {
        if (
          html5QrCodeRef.current &&
          scannerActive &&
          !preview &&
          !admissionResult &&
          !isProcessingRef.current
        ) {
          try {
            html5QrCodeRef.current.resume();
            isPausedRef.current = false;
          } catch {
            /* ignore */
          }
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [scannerActive, preview, admissionResult]);

  // Teardown camera when component unmounts
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
    setPreview(null);
    setAdmissionResult(null);
  };

  // Gate selection handler
  const handleGateSelect = (gate: string) => {
    setSelectedGate(gate);
    setStoredGate(gate);
    setShowGateSelector(false);
    ensureAudioContext();
  };

  // Mute toggle
  const handleMuteToggle = () => {
    const newMuted = !muted;
    setMutedState(newMuted);
    storeMuted(newMuted);
  };

  // Test sound
  const handleTestSound = () => {
    const ctx = ensureAudioContext();
    playPassSound(ctx);
    setTimeout(() => {
      playRejectSound(ctx);
    }, 500);
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
    await handleInspectTicket('manual', manualCode);
  };

  // Reset screen for next attendee scan (staff explicitly taps "Scan Next")
  const handleResetForNext = () => {
    setPreview(null);
    setSelectedCount(null);
    setAdmissionResult(null);
    setManualCode('');
    currentInputRef.current = null;
    isProcessingRef.current = false;

    // If on QR tab and scanner was paused, resume promptly without stream recreation
    if (activeTab === 'qr' && scannerActive && html5QrCodeRef.current) {
      setTimeout(() => {
        try {
          if (html5QrCodeRef.current) {
            html5QrCodeRef.current.resume();
          }
          isPausedRef.current = false;
        } catch {
          startCamera();
        }
      }, 150);
    }
  };

  // ── Gate Selector Screen ──
  if (showGateSelector) {
    return (
      <div className="gate-scanner-shell">
        <div className="gate-selector-card">
          <h2 className="gate-selector-title">Select Your Gate</h2>
          <p className="gate-selector-subtitle">
            Choose the gate this device is assigned to. This persists for the session.
          </p>
          <div className="gate-selector-grid">
            {ALLOWED_GATES.map((gate) => (
              <button
                key={gate}
                type="button"
                className="btn btn-primary gate-selector-btn"
                onClick={() => handleGateSelect(gate)}
              >
                {gate}
              </button>
            ))}
          </div>
          <p className="gate-selector-hint">
            🔇 iOS may stay silent when the ringer switch is on silent.{' '}
            <strong>Turn off silent mode</strong> for audible scan alerts.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="gate-scanner-shell">
      {/* ── Full-Screen Flash Overlay ── */}
      {flashColor && (
        <div className={`gate-flash-overlay flash-${flashColor}`} aria-hidden="true" />
      )}

      {/* ── Top Controls Bar ── */}
      <div className="gate-controls-bar">
        <div className="gate-controls-left">
          <span className="gate-active-badge">{selectedGate}</span>
          <span className="badge-scanner" title={`Operating role: ${userRole}`}>
            {userRole === 'scanner' ? 'Scanner' : 'Admin'}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setShowGateSelector(true)}
            title="Change gate"
          >
            ✏️
          </button>
        </div>
        <div className="gate-controls-right">
          <button
            type="button"
            className="btn btn-ghost btn-sm gate-test-sound-btn"
            onClick={handleTestSound}
            title="Test sound"
          >
            🔊 Test
          </button>
          <button
            type="button"
            className={`btn btn-ghost btn-sm gate-mute-btn ${muted ? 'muted' : ''}`}
            onClick={handleMuteToggle}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? '🔇' : '🔔'}
          </button>
        </div>
      </div>

      {/* ── Mode Selector: QR or Manual ── */}
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

      {/* ── In-Flight Processing Spinner ── */}
      {isProcessing && (
        <div className="gate-processing-card" role="status">
          <span className="spinner" />
          <span>{processingLabel}</span>
        </div>
      )}

      {/* ── STEP 1 PREVIEW: Group & Seasonal Allowance Card ── */}
      {preview && !admissionResult && (
        <div className="gate-preview-card" role="region" aria-label="Ticket Preview">
          <div className="gate-preview-header">
            <div>
              <h3 className="gate-preview-title">{preview.name || 'Unassigned Attendee'}</h3>
              <p className="text-muted text-sm" style={{ marginTop: '2px' }}>
                {preview.event_night_title || 'Active Event Night'}
              </p>
            </div>
            <div className="gate-preview-badges">
              <span
                className={
                  preview.ticket_type === 'seasonal' ? 'badge-seasonal' : 'badge-single'
                }
              >
                {preview.ticket_type === 'seasonal' ? 'Seasonal Pass' : 'Single Ticket'}
              </span>
              {preview.category && (
                <span className={`badge badge-${preview.category}`}>
                  {CATEGORY_LABELS[preview.category as PassCategory] || preview.category}
                </span>
              )}
            </div>
          </div>

          <div className="gate-allowance-grid">
            <div className="gate-allowance-metric">
              <div className="gate-allowance-num">
                {preview.admitted_count ?? 0} / {preview.party_size ?? 1}
              </div>
              <div className="gate-allowance-lbl">Admitted Tonight</div>
            </div>
            <div className="gate-allowance-metric">
              <div
                className="gate-allowance-num"
                style={{ color: '#10b981' }}
              >
                {preview.remaining_count ?? 0}
              </div>
              <div className="gate-allowance-lbl">Remaining Now</div>
            </div>
          </div>

          {/* Group Count Selector (1 to remaining) */}
          <div className="gate-count-section">
            <div className="gate-count-label">
              {(preview.remaining_count ?? 1) > 1
                ? 'Select number of people entering now:'
                : 'Confirm person entering now:'}
            </div>

            <div className="gate-count-grid">
              {Array.from(
                { length: preview.remaining_count ?? 1 },
                (_, i) => i + 1
              ).map((num) => (
                <button
                  key={num}
                  type="button"
                  className={`gate-count-btn ${selectedCount === num ? 'active' : ''}`}
                  onClick={() => setSelectedCount(num)}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          <div className="gate-preview-actions">
            <button
              type="button"
              className="gate-admit-btn"
              disabled={!selectedCount || isProcessing}
              onClick={handleConfirmAdmission}
            >
              {selectedCount
                ? `Confirm Admission of ${selectedCount} ${
                    selectedCount === 1 ? 'Person' : 'People'
                  } →`
                : 'Select Count Above to Admit'}
            </button>
            <button
              type="button"
              className="gate-cancel-btn"
              onClick={handleResetForNext}
              disabled={isProcessing}
            >
              Cancel / Scan Next
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2 RESULT: Authoritative Decision Banner ── */}
      {admissionResult && (
        <div
          className={`gate-result-card result-${admissionResult.status.toLowerCase()}`}
          role="alert"
          aria-live="assertive"
        >
          {/* Status Icon */}
          <div className="gate-result-icon">
            {admissionResult.status === 'ADMIT_N' && '✓'}
            {admissionResult.status !== 'ADMIT_N' && '✕'}
          </div>

          {/* Primary Action Directive */}
          <div className="gate-result-headline">
            {admissionResult.status === 'ADMIT_N' &&
              `ADMIT ${admissionResult.admitted_now} ${
                admissionResult.admitted_now === 1 ? 'PERSON' : 'PEOPLE'
              }`}
            {admissionResult.status === 'TOO_MANY' && 'DO NOT ADMIT — OVER REMAINING LIMIT'}
            {admissionResult.status === 'NIGHT_FULL' && 'DO NOT ADMIT — NIGHT ALLOWANCE FULL'}
            {admissionResult.status === 'TICKET_COMPLETE' && 'DO NOT ADMIT — TICKET COMPLETED'}
            {admissionResult.status === 'OUTSIDE_EVENT_WINDOW' &&
              'DO NOT ADMIT — EVENT NOT ACTIVE'}
            {admissionResult.status === 'NIGHT_NOT_INCLUDED' &&
              'DO NOT ADMIT — NOT VALID TONIGHT'}
            {admissionResult.status === 'CANCELLED' && 'DO NOT ADMIT — TICKET CANCELLED'}
            {admissionResult.status === 'INVALID' && 'DO NOT ADMIT — INVALID TICKET'}
            {admissionResult.status === 'UNAUTHORIZED' && 'DO NOT ADMIT — UNAUTHORISED'}
            {admissionResult.status === 'ERROR' && 'DO NOT ADMIT — TIMEOUT / ERROR'}
          </div>

          <div className="gate-result-subtext">
            {admissionResult.status === 'ADMIT_N' && (
              <>
                Pass admitted successfully at {admissionResult.gate}.
                {admissionResult.remaining_tonight !== undefined && (
                  <strong> ({admissionResult.remaining_tonight} remaining tonight)</strong>
                )}
              </>
            )}
            {admissionResult.status === 'TOO_MANY' &&
              `Only ${admissionResult.remaining_count ?? 0} remaining on this ticket. Never admit an over-limit party.`}
            {admissionResult.status === 'NIGHT_FULL' &&
              'Full party size has already entered for tonight. Seasonal allowance resets tomorrow.'}
            {admissionResult.status === 'TICKET_COMPLETE' &&
              'All people on this ticket have already entered. Ticket permanently complete.'}
            {admissionResult.status === 'OUTSIDE_EVENT_WINDOW' &&
              'Gate scanning is only open during scheduled event hours in Asia/Kolkata.'}
            {admissionResult.status === 'NIGHT_NOT_INCLUDED' &&
              'This seasonal ticket is not configured for tonight’s event.'}
            {admissionResult.status === 'CANCELLED' &&
              'This ticket has been revoked by event organisers.'}
            {admissionResult.status === 'INVALID' &&
              'Ticket not found in event database. Please verify physical print.'}
            {admissionResult.status === 'UNAUTHORIZED' &&
              'Current account is not authorised for gate scanning.'}
            {admissionResult.status === 'ERROR' &&
              'Network timeout or interrupted connection. DO NOT ADMIT until verified with supervisor.'}
          </div>

          {/* Ticket Information */}
          {(admissionResult.name || admissionResult.ticket_type) && (
            <div className="gate-ticket-details">
              {admissionResult.name && (
                <div className="gate-ticket-row">
                  <span className="gate-row-label">Attendee:</span>
                  <span className="gate-row-value gate-attendee-name">
                    {admissionResult.name}
                  </span>
                </div>
              )}
              {admissionResult.ticket_type && (
                <div className="gate-ticket-row">
                  <span className="gate-row-label">Ticket Type:</span>
                  <span className="gate-row-value">
                    {admissionResult.ticket_type === 'seasonal'
                      ? 'Seasonal Pass'
                      : 'Single Ticket'}
                  </span>
                </div>
              )}
              {admissionResult.category && (
                <div className="gate-ticket-row">
                  <span className="gate-row-label">Category:</span>
                  <span className={`badge badge-${admissionResult.category}`}>
                    {CATEGORY_LABELS[admissionResult.category as PassCategory] ||
                      admissionResult.category}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Timestamp */}
          {admissionResult.admitted_at && (
            <div className="gate-timestamp-box">
              Admitted at: <strong>{formatDate(admissionResult.admitted_at)}</strong>
            </div>
          )}

          {/* Message / Error Details */}
          {admissionResult.message && (
            <div className="gate-message-box">{admissionResult.message}</div>
          )}

          {/* Next Pass Button: Promptly resumes stream */}
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

      {/* ── Mode 1: Camera Scanner Viewfinder ── */}
      {activeTab === 'qr' && !preview && !admissionResult && (
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

          {!scannerActive && !cameraError && (
            <div className="gate-camera-actions">
              <button
                type="button"
                onClick={startCamera}
                className="btn btn-primary gate-camera-toggle-btn"
                disabled={isProcessing}
              >
                📷 Open Gate Scanner
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Mode 2: Manual Code Entry Form ── */}
      {activeTab === 'manual' && !preview && !admissionResult && (
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
              {isProcessing ? 'Checking…' : 'Inspect Ticket Allowance →'}
            </button>
          </form>
        </div>
      )}

      {/* ── Silent Mode Hint ── */}
      <div className="gate-silent-hint">
        🔇 <strong>iOS Silent Mode:</strong> Turn off the ringer switch to hear scan sounds.
      </div>
    </div>
  );
}
