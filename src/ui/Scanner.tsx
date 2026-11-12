import { useEffect, useRef, useState } from 'react';
import { isProductBarcode } from '../data/barcodes';
import { useT } from '../i18n';
import { Icon } from './Icon';

// The camera, full screen, reading product barcodes. Chrome on Android has a barcode reader built
// in; Safari on iPhone does not, so there the app loads its own reader (a 1 MB file kept inside the
// app, so it also works without internet). Typing the number is always offered as a fallback.

type Detector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> };

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'];

async function makeDetector(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats(): Promise<string[]> } }).BarcodeDetector;
  if (native) {
    const supported = await native.getSupportedFormats().catch(() => [] as string[]);
    if (supported.includes('ean_13')) return new native({ formats: FORMATS.filter((f) => supported.includes(f)) });
  }
  const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
    import('barcode-detector/ponyfill'),
    import('zxing-wasm/reader/zxing_reader.wasm?url')
  ]);
  prepareZXingModule({ overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) } });
  return new BarcodeDetector({ formats: FORMATS as never });
}

type Problem = 'denied' | 'no-camera' | null;

/**
 * onCode is called once per barcode in view: holding the camera still on it adds it once; taking it
 * away and showing it (or the next one) again adds it again. `status` is a short line under the frame, such as
 * "Added: milk". Closing stops the camera.
 */
export function Scanner({
  title,
  status,
  skip,
  onCode,
  onClose
}: {
  title: string;
  status?: string | null;
  /** A barcode just handled (for example just taught): ignored until it has left the view. */
  skip?: string | null;
  onCode: (code: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [torch, setTorch] = useState<boolean | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const streamRef = useRef<MediaStream | null>(null);
  const onCodeRef = useRef(onCode);
  onCodeRef.current = onCode;

  useEffect(() => {
    let stopped = false;
    let last = { code: skip ?? '', at: skip ? Date.now() : 0 };
    let timer = 0;

    (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (e) {
        setProblem((e as DOMException).name === 'NotAllowedError' ? 'denied' : 'no-camera');
        setTyping(true);
        return;
      }
      if (stopped) return stream.getTracks().forEach((tr) => tr.stop());
      streamRef.current = stream;
      const track = stream.getVideoTracks()[0];
      const caps = (track?.getCapabilities?.() ?? {}) as { torch?: boolean };
      if (caps.torch) setTorch(false);
      const el = video.current!;
      el.srcObject = stream;
      await el.play().catch(() => {});

      const detector = await makeDetector();
      const tick = async () => {
        if (stopped) return;
        if (el.readyState >= 2) {
          try {
            const found = await detector.detect(el);
            const code = found.map((f) => f.rawValue).find(isProductBarcode);
            const now = Date.now();
            if (code) {
              // Counted once while it stays in view; counted again only after it has been out of
              // view for a moment (the next carton of milk, not the same one held still).
              const isNew = code !== last.code || now - last.at > 1200;
              last = { code, at: now };
              if (isNew) {
                navigator.vibrate?.(60);
                onCodeRef.current(code);
              }
            }
          } catch {
            /* a frame that could not be read: try the next one */
          }
        }
        timer = window.setTimeout(tick, 180);
      };
      void tick();
    })();

    return () => {
      stopped = true;
      clearTimeout(timer);
      streamRef.current?.getTracks().forEach((tr) => tr.stop());
    };
  }, []);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torch;
    await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }).catch(() => {});
    setTorch(next);
  }

  function submitTyped(e: React.FormEvent) {
    e.preventDefault();
    const code = typed.replace(/\D/g, '');
    if (!isProductBarcode(code)) return;
    setTyped('');
    onCode(code);
  }

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-label={title}>
      <video ref={video} className="scanner-video" playsInline muted aria-hidden="true" />
      <div className="scanner-top">
        <button className="scanner-btn" onClick={onClose} aria-label={t('close')}>
          <Icon name="close" />
        </button>
        <h2 className="scanner-title">{title}</h2>
        {torch !== null ? (
          <button className={`scanner-btn${torch ? ' on' : ''}`} onClick={() => void toggleTorch()} aria-label={t('torch')} aria-pressed={torch}>
            <Icon name="torch" />
          </button>
        ) : (
          <span className="scanner-btn-space" />
        )}
      </div>

      {!problem && <div className="scanner-frame" aria-hidden="true" />}

      <div className="scanner-bottom">
        {problem && <p className="scanner-problem">{problem === 'denied' ? t('cameraDenied') : t('noCamera')}</p>}
        {!problem && <p className="scanner-hint">{status || t('scanHint')}</p>}
        {typing ? (
          <form className="scanner-type" onSubmit={submitTyped}>
            <input
              inputMode="numeric"
              dir="ltr"
              autoFocus
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder="6281007031234"
              aria-label={t('typeBarcode')}
            />
            <button className="btn primary" disabled={!isProductBarcode(typed.replace(/\D/g, ''))}>
              {t('add')}
            </button>
          </form>
        ) : (
          <button className="btn ghost wide scanner-type-btn" onClick={() => setTyping(true)}>
            {t('typeBarcode')}
          </button>
        )}
        <button className="btn primary wide big" onClick={onClose}>
          {t('done')}
        </button>
      </div>
    </div>
  );
}
