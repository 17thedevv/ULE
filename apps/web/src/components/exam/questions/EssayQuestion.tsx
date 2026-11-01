import React from 'react';

interface EssayProps {
  content?: {
    minWords?: number | null;
    maxWords?: number | null;
    prompt?: string;
  };
  value: Record<string, unknown> | null;
  onChange: (payload: { text: string }) => void;
  disabled?: boolean;
}

export const EssayQuestion: React.FC<EssayProps> = ({
  content,
  value,
  onChange,
  disabled = false,
}) => {
  const text = (value?.text as string) || (value?.essayText as string) || '';
  const wordCount = text.trim().length === 0 ? 0 : text.trim().split(/\s+/).filter(Boolean).length;

  const minWords = content?.minWords;
  const maxWords = content?.maxWords;

  let wordCountClass = 'badge-neutral';
  if (minWords !== undefined && minWords !== null && wordCount < minWords) {
    wordCountClass = 'badge-warning';
  } else if (maxWords !== undefined && maxWords !== null && wordCount > maxWords) {
    wordCountClass = 'badge-danger';
  } else if (wordCount > 0) {
    wordCountClass = 'badge-success';
  }

  return (
    <div className="essay-container">
      <textarea
        className="textarea essay-textarea"
        rows={7}
        value={text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder="Write your detailed essay response here..."
        disabled={disabled}
      />
      <div className="essay-meta">
        <span className={`badge ${wordCountClass}`}>
          Words: {wordCount}
          {minWords !== undefined && minWords !== null && ` (Min: ${minWords})`}
          {maxWords !== undefined && maxWords !== null && ` (Max: ${maxWords})`}
        </span>
      </div>
    </div>
  );
};
