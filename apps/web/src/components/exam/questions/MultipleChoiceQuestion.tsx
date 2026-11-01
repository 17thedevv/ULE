import React from 'react';

interface MultipleChoiceProps {
  content: {
    options?: Array<{ id: string; text: string }>;
    prompt?: string;
  };
  value: Record<string, unknown> | null;
  onChange: (payload: { selectedOptionIds: string[] }) => void;
  disabled?: boolean;
}

export const MultipleChoiceQuestion: React.FC<MultipleChoiceProps> = ({
  content,
  value,
  onChange,
  disabled = false,
}) => {
  const options = content.options || [];
  const selectedOptionIds = Array.isArray(value?.selectedOptionIds)
    ? (value.selectedOptionIds as string[])
    : [];

  const handleToggle = (optId: string) => {
    if (disabled) return;
    const next = selectedOptionIds.includes(optId)
      ? selectedOptionIds.filter((id) => id !== optId)
      : [...selectedOptionIds, optId];
    onChange({ selectedOptionIds: next });
  };

  return (
    <div className="question-choices">
      {options.map((opt) => {
        const isChecked = selectedOptionIds.includes(opt.id);
        return (
          <label
            key={opt.id}
            className={`choice-item ${isChecked ? 'choice-selected' : ''}`}
          >
            <input
              type="checkbox"
              checked={isChecked}
              onChange={() => handleToggle(opt.id)}
              disabled={disabled}
              className="choice-checkbox"
            />
            <span className="choice-text">{opt.text}</span>
          </label>
        );
      })}
    </div>
  );
};
