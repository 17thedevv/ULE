import React, { useEffect, useState } from 'react';

interface ExamTimerProps {
  deadlineAt: string | null;
  onExpire?: () => void;
}

export const ExamTimer: React.FC<ExamTimerProps> = ({ deadlineAt, onExpire }) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number | null>(() => {
    if (!deadlineAt) return null;
    const target = new Date(deadlineAt).getTime();
    const now = Date.now();
    return Math.max(0, Math.floor((target - now) / 1000));
  });

  useEffect(() => {
    if (!deadlineAt) {
      setSecondsRemaining(null);
      return;
    }

    const interval = setInterval(() => {
      const target = new Date(deadlineAt).getTime();
      const now = Date.now();
      const diffSeconds = Math.floor((target - now) / 1000);

      if (diffSeconds <= 0) {
        setSecondsRemaining(0);
        clearInterval(interval);
        if (onExpire) onExpire();
      } else {
        setSecondsRemaining(diffSeconds);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [deadlineAt, onExpire]);

  if (!deadlineAt || secondsRemaining === null) {
    return (
      <div className="exam-timer untimed">
        <span className="timer-icon">&#9200;</span>
        <span className="timer-label">Untimed Examination</span>
      </div>
    );
  }

  const hours = Math.floor(secondsRemaining / 3600);
  const minutes = Math.floor((secondsRemaining % 3600) / 60);
  const seconds = secondsRemaining % 60;

  const formatted =
    hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const isLowTime = secondsRemaining <= 300; // <= 5 minutes
  const isExpired = secondsRemaining === 0;

  return (
    <div
      className={`exam-timer ${isExpired ? 'timer-expired' : isLowTime ? 'timer-low' : 'timer-normal'}`}
      data-testid="exam-timer"
    >
      <span className="timer-icon">{isExpired ? '&#10060;' : '&#9201;'}</span>
      <span className="timer-label">
        {isExpired ? "Time's Up (Grace Period Active)" : 'Time Remaining:'}
      </span>
      <span className="timer-digits" data-testid="timer-countdown">
        {formatted}
      </span>
    </div>
  );
};
