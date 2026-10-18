import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { resizeImage } from '../lib/resizeImage';

const PRIVACY =
  "Your photo is sent to an outside AI service to create your look. The shop doesn't save it.";
const NO_CAMERA = "Camera isn't available. Upload a photo instead.";
const NOT_PHOTO = 'Please choose a photo.';

type CameraState = 'starting' | 'live' | 'unavailable';

export function SelfieScreen({ onSelfie }: { onSelfie(image: string): void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camera, setCamera] = useState<CameraState>('starting');
  const [videoReady, setVideoReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    let cancelled = false;
    const media = navigator.mediaDevices;
    if (!media?.getUserMedia) {
      setCamera('unavailable');
      return;
    }
    media
      .getUserMedia({ video: { facingMode: 'user' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // iOS Safari doesn't always honour autoPlay for camera streams; a failed play() is harmless.
          video.play()?.catch(() => {});
        }
        setCamera('live');
      })
      .catch(() => {
        if (!cancelled) setCamera('unavailable');
      });
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, []);

  function checkVideoReady() {
    const v = videoRef.current;
    setVideoReady(!!v && v.videoWidth > 0 && v.videoHeight > 0);
  }

  async function takeSelfie() {
    const video = videoRef.current;
    if (!video || !videoReady || busy) return;
    setBusy(true);
    setError(null);
    try {
      const image = await resizeImage(video);
      stopCamera();
      onSelfie(image);
    } catch {
      stopCamera();
      setCamera('unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e: ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const image = await resizeImage(file);
      stopCamera();
      onSelfie(image);
    } catch {
      setError(NOT_PHOTO);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="screen split selfie">
      <div className="stage">
        <video
          ref={videoRef}
          className="mirror"
          autoPlay
          playsInline
          muted
          hidden={camera !== 'live'}
          onLoadedMetadata={checkVideoReady}
          onResize={checkVideoReady}
        />
        {camera !== 'live' && (
          <div className="stage-empty" aria-hidden="true">
            ✂️
          </div>
        )}
      </div>

      <section className="panel controls">
        <p className="selfie-hint display">Face the camera, hair visible.</p>
        {camera === 'unavailable' && (
          <p className="notice" role="status">
            {NO_CAMERA}
          </p>
        )}
        {camera !== 'unavailable' && (
          <button
            type="button"
            className="btn btn-gold"
            onClick={takeSelfie}
            disabled={!videoReady || busy}
          >
            Take selfie
          </button>
        )}
        <label className={camera === 'unavailable' ? 'btn btn-gold' : 'btn btn-ghost'}>
          Upload photo
          <input
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={onUpload}
            disabled={busy}
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <p className="privacy">{PRIVACY}</p>
      </section>
    </main>
  );
}
