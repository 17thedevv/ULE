import React from 'react';

interface MatchingProps {
  content: {
    premises?: Array<{ id: string; text: string }>;
    targets?: Array<{ id: string; text: string }>;
    prompt?: string;
  };
  value: Record<string, unknown> | null;
  onChange: (payload: { pairs: Record<string, string> }) => void;
  disabled?: boolean;
}

export const MatchingQuestion: React.FC<MatchingProps> = ({
  content,
  value,
  onChange,
  disabled = false,
}) => {
  const premises = content.premises || [];
  const targets = content.targets || [];
  const pairs = (value?.pairs as Record<string, string>) || {};

  const handlePairChange = (premiseId: string, targetId: string) => {
    if (disabled) return;
    onChange({
      pairs: {
        ...pairs,
        [premiseId]: targetId,
      },
    });
  };

  return (
    <div className="matching-container">
      <div className="matching-table">
        {premises.map((p) => (
          <div key={p.id} className="matching-row">
            <div className="matching-premise">
              <span>{p.text}</span>
            </div>
            <div className="matching-arrow">&rarr;</div>
            <div className="matching-target">
              <select
                className="select matching-select"
                value={pairs[p.id] || ''}
                onChange={(e) => handlePairChange(p.id, e.target.value)}
                disabled={disabled}
              >
                <option value="">-- Select matching target --</option>
                {targets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.text}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
