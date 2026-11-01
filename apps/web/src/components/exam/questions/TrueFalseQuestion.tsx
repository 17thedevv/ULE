import React from 'react';

interface TrueFalseProps {
  content?: {
    prompt?: string;
  };
  value: Record<string, unknown> | null;
  onChange: (payload: { selectedBoolean: boolean }) => void;
  disabled?: boolean;
}

export const TrueFalseQuestion: React.FC<TrueFalseProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const selectedBoolean = typeof value?.selectedBoolean === 'boolean'
    ? value.selectedBoolean
    : null;

  return (
    <div className="tf-choices">
      <button
        type="button"
        className={`btn tf-btn ${selectedBoolean === true ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => onChange({ selectedBoolean: true })}
        disabled={disabled}
      >
        True
      </button>
      <button
        type="button"
        className={`btn tf-btn ${selectedBoolean === false ? 'btn-primary' : 'btn-secondary'}`}
        onClick={() => onChange({ selectedBoolean: false })}
        disabled={disabled}
      >
        False
      </button>
    </div>
  );
};
