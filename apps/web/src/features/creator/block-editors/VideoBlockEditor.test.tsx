import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VideoBlockEditor } from './VideoBlockEditor';
import { VideoConfig } from '@ule/contracts';

describe('VideoBlockEditor', () => {
  it('renders url, duration, allowSkip, and transcript inputs', () => {
    const onChange = vi.fn();
    render(<VideoBlockEditor onChange={onChange} />);

    expect(screen.getByLabelText(/Video URL/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Estimated Duration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Allow skipping without watching/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Transcript/i)).toBeInTheDocument();
  });

  it('validates URL prefix and updates parent config', () => {
    let latestConfig: VideoConfig | null = null;
    let latestIsValid = false;
    const onChange = vi.fn((cfg: VideoConfig, valid: boolean) => {
      latestConfig = cfg;
      latestIsValid = valid;
    });

    render(<VideoBlockEditor onChange={onChange} />);

    // Initially empty
    expect(latestIsValid).toBe(false);

    // Invalid prefix
    fireEvent.change(screen.getByLabelText(/Video URL/i), {
      target: { value: 'ftp://files.example.com/movie.mp4' },
    });
    expect(latestIsValid).toBe(false);
    expect(screen.getByText(/URL must start with http/i)).toBeInTheDocument();

    // Valid YouTube URL
    fireEvent.change(screen.getByLabelText(/Video URL/i), {
      target: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
    });
    expect(latestIsValid).toBe(true);
    expect(screen.getByText(/Recognized video provider: embed preview ready/i)).toBeInTheDocument();

    // Optional duration and transcript
    fireEvent.change(screen.getByLabelText(/Estimated Duration/i), {
      target: { value: '180' },
    });
    fireEvent.change(screen.getByLabelText(/Transcript/i), {
      target: { value: 'Sample lecture transcript text.' },
    });

    expect((latestConfig as VideoConfig | null)?.durationSeconds).toBe(180);
    expect((latestConfig as VideoConfig | null)?.transcript).toBe('Sample lecture transcript text.');
    expect((latestConfig as VideoConfig | null)?.allowSkip).toBe(true);
  });
});
