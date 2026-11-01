import React from 'react';

interface ShortTextProps {
  content?: {
    placeholder?: string | null;
    prompt?: string;
  };
  value: Record<string, unknown> | null;
  onChange: (payload: { text: string }) => void;
  disabled?: boolean;
}

export const ShortTextQuestion: React.FC<ShortTextProps> = ({
  content,
  value,
  onChange,
  disabled = false,
}) => {
  const text = (value?.text as string) || '';

  return (
    <div className="short-text-container">
      <input
        type="text"
        className="input short-text-input"
        value={text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder={content?.placeholder || 'Type your answer here...'}
        disabled={disabled}
      />
    </div>
  );
};
