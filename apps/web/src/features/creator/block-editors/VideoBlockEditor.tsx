import React, { useEffect, useRef, useState } from 'react';
import { VideoConfig } from '@ule/contracts';
import { normalizeVideoEmbedUrl } from '../../learner/video-embed';

interface VideoBlockEditorProps {
  initialConfig?: Partial<VideoConfig>;
  onChange: (config: VideoConfig, isValid: boolean) => void;
}

export function VideoBlockEditor({ initialConfig, onChange }: VideoBlockEditorProps) {
  const [url, setUrl] = useState<string>(
    typeof initialConfig?.url === 'string' ? initialConfig.url : '',
  );

  const [durationSeconds, setDurationSeconds] = useState<string>(
    typeof initialConfig?.durationSeconds === 'number' ? String(initialConfig.durationSeconds) : '',
  );

  const [transcript, setTranscript] = useState<string>(
    typeof initialConfig?.transcript === 'string' ? initialConfig.transcript : '',
  );

  const [allowSkip, setAllowSkip] = useState<boolean>(
    initialConfig?.allowSkip !== undefined ? Boolean(initialConfig.allowSkip) : true,
  );

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Validation
  const validationErrors: string[] = [];
  const trimmedUrl = url.trim();
  if (trimmedUrl.length === 0) {
    validationErrors.push('Video URL is required.');
  } else {
    const validPrefix =
      trimmedUrl.startsWith('http://') ||
      trimmedUrl.startsWith('https://') ||
      trimmedUrl.startsWith('/') ||
      trimmedUrl.startsWith('./');
    if (!validPrefix) {
      validationErrors.push("Video URL must begin with http://, https://, or a valid path (/ or ./)");
    }
  }

  let parsedDuration: number | undefined;
  if (durationSeconds.trim().length > 0) {
    const n = Number(durationSeconds);
    if (isNaN(n) || n < 0) {
      validationErrors.push('Duration must be a non-negative number of seconds.');
    } else {
      parsedDuration = Math.round(n);
    }
  }

  const isValid = validationErrors.length === 0;

  // Propagate to parent
  useEffect(() => {
    const config: VideoConfig = {
      url: trimmedUrl,
      ...(parsedDuration !== undefined ? { durationSeconds: parsedDuration } : {}),
      ...(transcript.trim() ? { transcript: transcript.trim() } : {}),
      allowSkip,
    };
    onChangeRef.current(config, isValid);
  }, [trimmedUrl, parsedDuration, transcript, allowSkip, isValid]);

  // Quick embed test feedback
  const { embedUrl, isEmbed } = normalizeVideoEmbedUrl(trimmedUrl);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Video URL */}
      <div>
        <label
          htmlFor="video-url"
          style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}
        >
          Video URL <span style={{ color: 'var(--ui-danger)' }}>*</span>
        </label>
        <p style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', margin: '0.15rem 0 0.35rem' }}>
          Accepts YouTube watch links or shortlinks, Vimeo links, or direct MP4/WebM media streams.
        </p>
        <input
          id="video-url"
          type="url"
          required
          placeholder="e.g. https://www.youtube.com/watch?v=dQw4w9WgXcQ or /media/sample.mp4"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.4rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--ui-border)',
            backgroundColor: 'var(--ui-bg)',
            color: 'var(--ui-text)',
            fontSize: '0.9rem',
          }}
        />

        {trimmedUrl && (
          <div style={{ marginTop: '0.35rem', fontSize: '0.78rem' }}>
            {isEmbed && embedUrl ? (
              <span style={{ color: 'var(--ui-success)' }}>
                ✓ Recognized video provider: embed preview ready.
              </span>
            ) : trimmedUrl.startsWith('http') || trimmedUrl.startsWith('/') ? (
              <span style={{ color: 'var(--ui-info)' }}>
                ℹ Direct media URL detected. HTML5 player will be used for playback.
              </span>
            ) : (
              <span style={{ color: 'var(--ui-danger)' }}>
                ⚠️ URL must start with http://, https://, or a valid path.
              </span>
            )}
          </div>
        )}
      </div>

      {/* Duration and Allow Skip in a grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '1rem',
        }}
      >
        <div>
          <label
            htmlFor="video-duration"
            style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}
          >
            Estimated Duration (seconds, optional)
          </label>
          <input
            id="video-duration"
            type="number"
            min="0"
            placeholder="e.g. 180"
            value={durationSeconds}
            onChange={(e) => setDurationSeconds(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: '0.25rem',
              padding: '0.4rem 0.6rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--ui-border)',
              backgroundColor: 'var(--ui-bg)',
              color: 'var(--ui-text)',
              fontSize: '0.85rem',
            }}
          />
        </div>

        <div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: 'var(--ui-text)',
              cursor: 'pointer',
              marginTop: '1.5rem',
            }}
          >
            <input
              type="checkbox"
              checked={allowSkip}
              onChange={(e) => setAllowSkip(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Allow skipping without watching entire duration
          </label>
        </div>
      </div>

      {/* Transcript */}
      <div>
        <label
          htmlFor="video-transcript"
          style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}
        >
          Transcript / Accompanying Notes (Optional)
        </label>
        <p style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', margin: '0.15rem 0 0.35rem' }}>
          Accessible alternative content rendered in a collapsible drawer alongside the video.
        </p>
        <textarea
          id="video-transcript"
          rows={3}
          placeholder="Paste or draft the video transcript for accessibility…"
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.4rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--ui-border)',
            backgroundColor: 'var(--ui-bg)',
            color: 'var(--ui-text)',
            fontSize: '0.85rem',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Learning science note */}
      <div
        style={{
          padding: '0.65rem 0.85rem',
          background: 'var(--ui-warning-bg)',
          border: '1px solid var(--ui-warning)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.8rem',
          color: 'var(--ui-warning)',
        }}
      >
        <strong>Pedagogical Invariant:</strong> Video completion is strictly non-evaluatable. Marking
        a video completed updates practice participation progress, but produces no grade, score, or
        mastery claim.
      </div>
    </div>
  );
}
