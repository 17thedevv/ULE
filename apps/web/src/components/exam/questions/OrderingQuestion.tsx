import React from 'react';

interface OrderingProps {
  content: {
    items?: Array<{ id: string; text: string }>;
    prompt?: string;
  };
  value: Record<string, unknown> | null;
  onChange: (payload: { sequence: string[] }) => void;
  disabled?: boolean;
}

export const OrderingQuestion: React.FC<OrderingProps> = ({
  content,
  value,
  onChange,
  disabled = false,
}) => {
  const items = content.items || [];
  const itemMap = new Map<string, string>();
  for (const item of items) {
    itemMap.set(item.id, item.text);
  }

  // Derive current sequence
  const rawSeq = Array.isArray(value?.sequence) ? (value.sequence as string[]) : [];
  const sequence: string[] = rawSeq.length === items.length
    ? rawSeq
    : items.map((i) => i.id);

  const moveItem = (index: number, direction: 'UP' | 'DOWN') => {
    if (disabled) return;
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sequence.length) return;

    const nextSeq = [...sequence];
    const temp = nextSeq[index];
    nextSeq[index] = nextSeq[targetIndex];
    nextSeq[targetIndex] = temp;
    onChange({ sequence: nextSeq });
  };

  return (
    <div className="ordering-container">
      <p className="help-text">Arrange the items in the correct order:</p>
      <div className="ordering-list">
        {sequence.map((itemId, idx) => (
          <div key={itemId} className="ordering-item">
            <span className="ordering-index">{idx + 1}.</span>
            <span className="ordering-text">{itemMap.get(itemId) || itemId}</span>
            <div className="ordering-actions">
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => moveItem(idx, 'UP')}
                disabled={disabled || idx === 0}
                title="Move up"
              >
                &uarr;
              </button>
              <button
                type="button"
                className="btn btn-sm btn-secondary"
                onClick={() => moveItem(idx, 'DOWN')}
                disabled={disabled || idx === sequence.length - 1}
                title="Move down"
              >
                &darr;
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
