import React from 'react';

interface SingleChoiceProps {
  content: {
    options?: Array<{ id: string; text: string }>;
    prompt?: string;
  };
  value: Record<string, unknown> | null;
  onChange: (payload: { selectedOptionId: string }) => void;
  disabled?: boolean;
}

export const SingleChoiceQuestion: React.FC<SingleChoiceProps> = ({
  content,
  value,
  onChange,
  disabled = false,
}) => {
  const options = content.options || [];
  const selectedOptionId = (value?.selectedOptionId as string) || '';

  return (
    <div className="question-choices">
      {options.map((opt) => (
        <label
          key={opt.id}
          className={`choice-item ${selectedOptionId === opt.id ? 'choice-selected' : ''}`}
        >
          <input
            type="radio"
            name={`choice-${opt.id}`}
            checked={selectedOptionId === opt.id}
            onChange={() => onChange({ selectedOptionId: opt.id })}
            disabled={disabled}
            className="choice-radio"
          />
          <span className="choice-text">{opt.text}</span>
        </label>
      ))}
    </div>
  );
};
