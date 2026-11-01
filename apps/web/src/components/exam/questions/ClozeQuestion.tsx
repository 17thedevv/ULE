import React from 'react';

interface ClozeProps {
  content: {
    templateText?: string;
    targetBlanks?: Array<{ blankKey: string; hint?: string }>;
    prompt?: string;
  };
  value: Record<string, unknown> | null;
  onChange: (payload: { blanks: Record<string, string> }) => void;
  disabled?: boolean;
}

export const ClozeQuestion: React.FC<ClozeProps> = ({
  content,
  value,
  onChange,
  disabled = false,
}) => {
  const templateText = content.templateText || '';
  const targetBlanks = content.targetBlanks || [];
  const blanks = (value?.blanks as Record<string, string>) || {};

  const hintMap = new Map<string, string>();
  for (const b of targetBlanks) {
    if (b.hint) hintMap.set(b.blankKey, b.hint);
  }

  const handleBlankChange = (blankKey: string, text: string) => {
    if (disabled) return;
    onChange({
      blanks: {
        ...blanks,
        [blankKey]: text,
      },
    });
  };

  // Split by {{blankKey}}
  const parts = templateText.split(/\{\{([^}]+)\}\}/g);

  return (
    <div className="cloze-container">
      <div className="cloze-text-flow">
        {parts.map((part, index) => {
          // Odd indices are the captured blankKeys
          if (index % 2 === 1) {
            const blankKey = part;
            const hint = hintMap.get(blankKey);
            return (
              <span key={index} className="cloze-blank-wrapper">
                <input
                  type="text"
                  className="input cloze-input"
                  value={blanks[blankKey] ?? ''}
                  onChange={(e) => handleBlankChange(blankKey, e.target.value)}
                  placeholder={hint ? `(${hint})` : `[${blankKey}]`}
                  disabled={disabled}
                />
              </span>
            );
          }
          return <span key={index}>{part}</span>;
        })}
      </div>
    </div>
  );
};
