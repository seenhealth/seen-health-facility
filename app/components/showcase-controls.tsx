'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Download,
  EyeOff,
  Pause,
  Play,
  Video,
  X,
  RotateCcw,
} from 'lucide-react';
import type { createViewer } from '../model/renderer';
export function ShowcaseControls({
  viewer,
  onExit,
}: {
  viewer: ReturnType<typeof createViewer>;
  onExit: () => void;
}) {
  const [paused, setPaused] = useState(false),
    [recording, setRecording] = useState(false),
    [controlsHidden, setControlsHidden] = useState(false),
    [tiltShift, setTiltShift] = useState(() => viewer.getTiltShift()),
    [progress, setProgress] = useState(0),
    [error, setError] = useState(''),
    [view, setView] = useState<'tiltshift' | 'day' | 'logistics'>('tiltshift'),
    [preview, setPreview] = useState(false),
    [video, setVideo] = useState<{ url: string; ext: string } | null>(null);
  useEffect(
    () => () => {
      if (video) URL.revokeObjectURL(video.url);
    },
    [video],
  );
  const recordingRef = useRef(false);
  const record = useCallback(async () => {
    if (recordingRef.current) return;
    recordingRef.current = true;
    setControlsHidden(true);
    setPreview(false);
    setError('');
    setRecording(true);
    setPaused(false);
    setProgress(0);
    try {
      const blob = await viewer.recordShowcase(setProgress);
      if (process.env.NODE_ENV === 'development') {
        void fetch('/__facility-recording', {
          method: 'POST',
          headers: { 'Content-Type': blob.type },
          body: blob,
        }).catch(() => {});
      }
      setVideo({
        url: URL.createObjectURL(blob),
        ext: blob.type.includes('mp4') ? 'mp4' : 'webm',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to record video.');
    } finally {
      recordingRef.current = false;
      setRecording(false);
      setControlsHidden(false);
    }
  }, [viewer]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && controlsHidden) {
        event.preventDefault();
        setControlsHidden(false);
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        event.repeat ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.closest('input, select, textarea, [contenteditable="true"]')
      )
        return;
      if (event.key.toLowerCase() === 'h') {
        event.preventDefault();
        setControlsHidden((hidden) => !hidden);
      }
      if (event.key.toLowerCase() === 'r') {
        event.preventDefault();
        void record();
      }
    };
    const reveal = () => {
      if (controlsHidden && !recordingRef.current) setControlsHidden(false);
    };
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', reveal);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('pointerdown', reveal);
    };
  }, [controlsHidden, record]);
  if (controlsHidden) return null;
  return (
    <div className="showcase-overlay">
      <div className="showcase-title">
        <img src="/brand/seen-health-horizontal.png" alt="Seen Health" />
        <span>ALHAMBRA · LIFE IN MOTION</span>
        <h1>A place to belong.</h1>
        <p>
          {viewer.activity.data.actors.length} people · Care, connection &
          community
        </p>
      </div>
      <div className="showcase-controls" aria-label="Video controls">
        <button
          disabled={recording}
          onClick={() => {
            viewer.pauseShowcase(!paused);
            setPaused(!paused);
          }}
        >
          {paused ? <Play size={16} /> : <Pause size={16} />}{' '}
          {paused ? 'Resume activity' : 'Pause activity'}
        </button>
        <button
          disabled={recording}
          onClick={() => {
            viewer.setShowcase(true, view);
            setPaused(false);
          }}
        >
          <RotateCcw size={16} /> Reset day
        </button>
        <select
          aria-label="Camera view"
          disabled={recording}
          onChange={(e) => {
            const next = e.target.value as 'tiltshift' | 'day' | 'logistics';
            setView(next);
            viewer.setShowcase(true, next);
            setPaused(false);
          }}
          value={view}
        >
          <option value="tiltshift">Whole center</option>
          <option value="day">Day center</option>
          <option value="logistics">Arrivals & deliveries</option>
        </select>
        <button
          aria-pressed={tiltShift}
          disabled={recording}
          onClick={() => {
            const enabled = !tiltShift;
            setTiltShift(enabled);
            viewer.setTiltShift(enabled);
          }}
        >
          Tilt-shift {tiltShift ? 'on' : 'off'}
        </button>
        <button
          onClick={() => {
            setPreview(false);
            setControlsHidden(true);
          }}
        >
          <EyeOff size={16} /> Hide all UI
        </button>
        <button className="primary" disabled={recording} onClick={record}>
          <Video size={16} />
          {recording
            ? `Recording ${Math.round(progress * 60)} / 60s`
            : 'Record 1-minute video'}
        </button>
        {video && (
          <>
            <button onClick={() => setPreview(!preview)}>Preview video</button>
            <a
              className="showcase-download"
              href={video.url}
              download={`Seen-Health-Alhambra-Day-in-Motion.${video.ext}`}
            >
              <Download size={16} /> Download video
            </a>
          </>
        )}
        <button disabled={recording} onClick={onExit}>
          <X size={16} /> Exit video view
        </button>
      </div>
      {video && preview && (
        <div className="showcase-video-preview">
          <button
            onClick={() => setPreview(false)}
            aria-label="Close video preview"
          >
            <X size={18} />
          </button>
          <video
            aria-label="Recorded Alhambra timelapse"
            src={video.url}
            controls
            muted
            playsInline
          />
        </div>
      )}
      <div className="showcase-note" role="status">
        {error ||
          (recording
            ? 'Recording with all overlays excluded. H hides controls.'
            : video
              ? 'Your 1920 × 1080 video is ready.'
              : `Fixed camera · 8× activity · ${tiltShift ? 'Soft focus' : 'Sharp focus'} · UI is never recorded`)}
        <span className="showcase-shortcuts">
          H: hide/show UI · R: record · Esc: show UI · Tap the model to restore
          controls
        </span>
      </div>
    </div>
  );
}
