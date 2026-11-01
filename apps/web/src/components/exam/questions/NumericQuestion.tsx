import React from 'react';

interface NumericProps {
  content: {
    unit?: string | null;
    prompt?: string;
  };
  value: Record<string, unknown> | null;
  onChange: (payload: { submittedValue: number | string }) => void;
  disabled?: boolean;
}

export const NumericQuestion: React.FC<NumericProps> = ({
  content,
  value,
  onChange,
  disabled = false,
}) => {
  const submittedValue = value?.submittedValue !== undefined && value?.submittedValue !== null
    ? String(value.submittedValue)
    : '';

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange({ submittedValue: val });
  };

  return (
    <div className="numeric-container">
      <div className="input-group">
        <input
          type="number"
          step="any"
          className="input numeric-input"
          value={submittedValue}
          onChange={handleChange}
          placeholder="Enter numeric answer"
          disabled={disabled}
        />
        {content.unit && <span className="input-addon">{content.unit}</span>}
      </div>
    </div>
  );
};
