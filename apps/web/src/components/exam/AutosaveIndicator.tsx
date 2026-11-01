import React from 'react';

export type AutosaveStatus = 'IDLE' | 'SAVING' | 'SAVED' | 'ERROR';

interface AutosaveIndicatorProps {
  status: AutosaveStatus;
  lastSavedAt?: Date | null;
  errorMessage?: string | null;
  onRetry?: () => void;
}

export const AutosaveIndicator: React.FC<AutosaveIndicatorProps> = ({
  status,
  lastSavedAt,
  errorMessage,
  onRetry,
}) => {
  return (
    <div className={`autosave-indicator autosave-${status.toLowerCase()}`} data-testid="autosave-indicator">
      {status === 'SAVING' && (
        <span className="autosave-badge badge-saving">
          <span className="spinner-sm">&#9696;</span> Saving response...
        </span>
      )}
      {status === 'SAVED' && (
        <span className="autosave-badge badge-saved">
          &#10003; Saved {lastSavedAt ? `at ${lastSavedAt.toLocaleTimeString()}` : ''}
        </span>
      )}
      {status === 'IDLE' && (
        <span className="autosave-badge badge-idle">
          &#10003; All changes saved
        </span>
      )}
      {status === 'ERROR' && (
        <span className="autosave-badge badge-error">
          &#9888; {errorMessage || 'Save failed'}
          {onRetry && (
            <button
              type="button"
              className="btn btn-sm btn-link"
              onClick={onRetry}
            >
              Retry
            </button>
          )}
        </span>
      )}
    </div>
  );
};
