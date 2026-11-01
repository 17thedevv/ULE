import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ExamTimer } from './ExamTimer';

describe('Phase 6: ExamTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders untimed state when deadlineAt is null', () => {
    render(<ExamTimer deadlineAt={null} />);
    expect(screen.getByText('Untimed Examination')).toBeInTheDocument();
  });

  it('counts down correctly based on server-authoritative deadlineAt', () => {
    const onExpire = vi.fn();
    const future = new Date(Date.now() + 120 * 1000).toISOString(); // 2 minutes future

    render(<ExamTimer deadlineAt={future} onExpire={onExpire} />);

    expect(screen.getByTestId('timer-countdown')).toHaveTextContent('02:00');

    // Advance 60 seconds
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(screen.getByTestId('timer-countdown')).toHaveTextContent('01:00');
    expect(onExpire).not.toHaveBeenCalled();

    // Advance remaining 60 seconds
    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(screen.getByTestId('timer-countdown')).toHaveTextContent('00:00');
    expect(screen.getByText(/Time's Up/i)).toBeInTheDocument();
    expect(onExpire).toHaveBeenCalled();
  });
});
