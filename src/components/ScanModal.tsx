import { useEffect, useRef, useState } from 'react';
import type { IScannerControls } from '@zxing/browser';
import type { CatalogItem } from '../types';
import { useShop } from '../store';
import { Badge, Button, Modal } from './ui';

interface ScanResult {
  code: string;
  itemId?: string;
}

type CameraStatus = 'idle' | 'starting' | 'scanning' | 'error';

export default function ScanModal({
  onClose,
  onPick,
  onCreate,
}: {
  onClose: () => void;
  onPick?: (item: CatalogItem) => void;
  onCreate?: (code: string) => void;
}) {
  const { state, dispatch, money } = useShop();
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const watchedStreamRef = useRef<MediaStream | null>(null);
  const streamEndRef = useRef<(() => void) | null>(null);
  const startingRef = useRef(false);
  const sessionRef = useRef(0);
  const itemsRef = useRef(state.items);
  itemsRef.current = state.items;

  const [scan, setScan] = useState<ScanResult | null>(null);
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');

  const part = scan?.itemId ? state.items.find((item) => item.id === scan.itemId) : undefined;

  useEffect(() => {
    const onVisibility = () => {
      if (!document.hidden || (!controlsRef.current && !streamRef.current)) return;
      stopCamera();
      setStatus('idle');
      setError('');
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      stopCamera();
    };
  }, []);

  function release(stream: MediaStream) {
    stream.getTracks().forEach((track) => track.stop());
  }

  function watchStream(stream: MediaStream, onEnd: () => void) {
    const handler = () => onEnd();
    watchedStreamRef.current = stream;
    streamEndRef.current = handler;
    stream.addEventListener('inactive', handler);
    stream.getTracks().forEach((track) => track.addEventListener('ended', handler));
  }

  function unwatchStream() {
    const stream = watchedStreamRef.current;
    const handler = streamEndRef.current;
    if (stream && handler) {
      stream.removeEventListener('inactive', handler);
      stream.getTracks().forEach((track) => track.removeEventListener('ended', handler));
    }
    watchedStreamRef.current = null;
    streamEndRef.current = null;
  }

  // Invalidating the session cancels any getUserMedia/decode work still in flight.
  function stopCamera() {
    sessionRef.current += 1;
    unwatchStream();
    controlsRef.current?.stop();
    controlsRef.current = null;
    if (streamRef.current) {
      release(streamRef.current);
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.srcObject = null;
    }
  }

  // Must be called from a tap: iOS Safari only allows getUserMedia inside a user gesture.
  async function startCamera() {
    const video = videoRef.current;
    if (!video || startingRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError('This browser cannot open the camera. Enter the code below, or use a handheld scanner.');
      return;
    }

    startingRef.current = true;
    const token = ++sessionRef.current;
    const current = () => token === sessionRef.current;
    setStatus('starting');
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
      });
      if (!current()) {
        release(stream);
        return;
      }
      streamRef.current = stream;
      watchStream(stream, () => {
        if (!current()) return;
        stopCamera();
        setStatus('idle');
        setError(
          'The camera stopped — another app or call may be using it. Tap Start camera to reconnect.',
        );
      });
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      if (!current()) {
        release(stream);
        return;
      }
      const reader = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 200,
      });
      const controls = await reader.decodeFromStream(stream, video, (result) => {
        if (!result || !current()) return;
        const code = result.getText().trim();
        if (!code) return;
        const match = itemsRef.current.find(
          (item) =>
            item.kind === 'part' &&
            (item.sku ?? '').trim().toLowerCase() === code.toLowerCase(),
        );
        stopCamera();
        setScan({ code, itemId: match?.id });
      });
      if (!current()) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setStatus('scanning');
    } catch (err) {
      if (!current()) return;
      stopCamera();
      setStatus('error');
      if (err instanceof Error && (err.name === 'NotAllowedError' || err.name === 'SecurityError')) {
        setError(
          'Camera access is blocked. Allow the camera for this site, then tap “Try camera again” — or enter the code below.',
        );
      } else if (
        err instanceof Error &&
        (err.name === 'NotFoundError' || err.name === 'OverconstrainedError')
      ) {
        setError('No camera found on this device. Enter the code below or use a handheld scanner.');
      } else {
        setError('The camera could not start. Tap “Try camera again”, or enter the code below.');
      }
    } finally {
      startingRef.current = false;
    }
  }

  function lookup(code: string) {
    const value = code.trim();
    if (!value) return;
    const match = itemsRef.current.find(
      (item) => item.kind === 'part' && (item.sku ?? '').trim().toLowerCase() === value.toLowerCase(),
    );
    stopCamera();
    setScan({ code: value, itemId: match?.id });
  }

  function scanNext() {
    stopCamera();
    setScan(null);
    setManual('');
    setError('');
    setStatus('idle');
  }

  return (
    <Modal
      title="Scan a part"
      subtitle="Point the camera at the barcode or QR label on the part."
      onClose={onClose}
      size="sm"
    >
      <div className="scanner">
        {scan ? (
          <div className="scan-result">
            {part ? (
              <>
                <div className="scan-match-head">
                  <div>
                    <strong>{part.name}</strong>
                    <span className="muted">
                      {part.sku || 'No SKU'} · {money(part.price)}
                    </span>
                  </div>
                  <Badge tone={(part.stock ?? 0) <= (part.reorderAt ?? 0) ? 'red' : 'green'}>
                    {part.stock ?? 0} in stock
                  </Badge>
                </div>
                <div className="scan-actions">
                  <Button onClick={() => dispatch({ type: 'item/adjustStock', id: part.id, delta: 1 })}>
                    Receive +1
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => dispatch({ type: 'item/adjustStock', id: part.id, delta: -1 })}
                  >
                    Use −1
                  </Button>
                  {onPick ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onPick(part);
                        onClose();
                      }}
                    >
                      Add to work order
                    </Button>
                  ) : null}
                </div>
                {!onPick ? (
                  <p className="muted">Stock saves immediately. Use this to receive a delivery or count a shelf.</p>
                ) : null}
              </>
            ) : (
              <div className="scan-miss">
                <strong>No part with the code “{scan.code}”</strong>
                <p className="muted">
                  Nothing in inventory matches that label. Check the SKU, or add the part.
                </p>
                {onCreate ? (
                  <Button
                    onClick={() => {
                      onCreate(scan.code);
                      onClose();
                    }}
                  >
                    Create a part with this SKU
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={onClose}>
                    Add it from Inventory
                  </Button>
                )}
              </div>
            )}
            <Button variant="ghost" onClick={scanNext}>
              Scan next
            </Button>
          </div>
        ) : (
          <>
            <div className="scan-stage">
              <video ref={videoRef} className="scan-video" muted playsInline />
              {status === 'scanning' ? <div className="scan-frame" aria-hidden="true" /> : null}
              {status !== 'scanning' ? (
                <div className="scan-note" role="status">
                  {status === 'idle' ? (
                    <>
                      <div>{error || 'Tap to let this site use the camera.'}</div>
                      <Button onClick={() => void startCamera()}>Start camera</Button>
                    </>
                  ) : status === 'starting' ? (
                    'Starting camera…'
                  ) : (
                    <>
                      <div>{error}</div>
                      <Button variant="secondary" onClick={() => void startCamera()}>
                        Try camera again
                      </Button>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <p className="muted scan-hint">
              Works with the phone camera, a Bluetooth/USB scanner, or a typed code.
            </p>
          </>
        )}

        <form
          className="scan-manual"
          onSubmit={(event) => {
            event.preventDefault();
            lookup(manual);
          }}
        >
          <label className="field">
            <span className="field-label">Part code or SKU</span>
            <input
              value={manual}
              onChange={(event) => setManual(event.target.value)}
              placeholder="e.g. OF-114"
              autoFocus={status === 'error'}
            />
          </label>
          <Button type="submit" variant="secondary" disabled={!manual.trim()}>
            Look up
          </Button>
        </form>
      </div>
    </Modal>
  );
}
