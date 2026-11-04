import React, { useEffect, useRef, useState } from 'react';
import { ClozeConfig, ClozeFeedbackPolicy } from '@ule/contracts';
import { Button } from '../../../components/ui/Button';

interface ClozeBlockEditorProps {
  initialConfig?: Partial<ClozeConfig>;
  onChange: (config: ClozeConfig, isValid: boolean) => void;
}

interface BlankItem {
  id: string;
  blankKey: string;
  hintText: string;
  acceptedAnswers: string[];
}

export function ClozeBlockEditor({ initialConfig, onChange }: ClozeBlockEditorProps) {
  const [prompt, setPrompt] = useState<string>(
    typeof initialConfig?.prompt === 'string'
      ? initialConfig.prompt
      : 'Complete the passage with the missing terms.',
  );

  const [templateText, setTemplateText] = useState<string>(
    typeof initialConfig?.templateText === 'string' ? initialConfig.templateText : '',
  );

  const [blanks, setBlanks] = useState<BlankItem[]>(() => {
    if (Array.isArray(initialConfig?.targetBlanks) && initialConfig.targetBlanks.length > 0) {
      return initialConfig.targetBlanks.map((b) => {
        const variants = initialConfig.answerKey?.blanks?.[b.blankKey] || [];
        return {
          id: b.id || `b_${Date.now()}_${b.blankKey}`,
          blankKey: b.blankKey,
          hintText: b.hintText || '',
          acceptedAnswers: variants.length > 0 ? [...variants] : [''],
        };
      });
    }
    return [{ id: 'b_1', blankKey: 'blank_1', hintText: '', acceptedAnswers: [''] }];
  });

  const [explanation, setExplanation] = useState<string>(
    initialConfig?.answerKey?.explanation || '',
  );

  const [feedbackPolicy, setFeedbackPolicy] = useState<ClozeFeedbackPolicy>(
    initialConfig?.feedbackPolicy || 'IMMEDIATE_WITH_EXPLANATION',
  );

  const [allowHints, setAllowHints] = useState<boolean>(Boolean(initialConfig?.allowHints));

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Parse all placeholders {{...}} present in the templateText
  const extractedPlaceholders: string[] = [];
  const matches = templateText.matchAll(/{{([^}]+)}}/g);
  for (const m of matches) {
    const key = m[1].trim();
    if (key && !extractedPlaceholders.includes(key)) {
      extractedPlaceholders.push(key);
    }
  }

  // Validation rules
  const validationErrors: string[] = [];
  if (prompt.trim().length < 3) {
    validationErrors.push('Prompt must be at least 3 characters.');
  }
  if (templateText.trim().length < 5) {
    validationErrors.push('Passage / Template text must be at least 5 characters.');
  }
  if (blanks.length < 1) {
    validationErrors.push('At least 1 blank must be configured.');
  } else if (blanks.length > 10) {
    validationErrors.push('At most 10 blanks are allowed.');
  }

  // Check unique blankKeys
  const seenBlankKeys = new Set<string>();
  for (const blank of blanks) {
    const key = blank.blankKey.trim();
    if (!key) {
      validationErrors.push('All blanks must have a non-empty key (e.g. blank_1).');
    } else if (seenBlankKeys.has(key)) {
      validationErrors.push(`Duplicate blank key '${key}' detected.`);
    }
    seenBlankKeys.add(key);

    // Each configured blank must be in templateText
    if (!templateText.includes(`{{${key}}}`)) {
      validationErrors.push(`Template text is missing placeholder '{{${key}}}'.`);
    }

    // Each blank must have at least one non-empty accepted answer
    const validVariants = blank.acceptedAnswers.filter((a) => a.trim().length > 0);
    if (validVariants.length === 0) {
      validationErrors.push(`Blank '${key || 'unnamed'}' requires at least 1 accepted answer.`);
    }
  }

  // Check for any placeholder in text that does not have a configured blank
  for (const ph of extractedPlaceholders) {
    if (!seenBlankKeys.has(ph)) {
      validationErrors.push(
        `Placeholder '{{${ph}}}' found in text does not have a configured blank.`,
      );
    }
  }

  const isValid = validationErrors.length === 0;

  // Propagate changes to parent
  useEffect(() => {
    const answerKeyBlanks: Record<string, string[]> = {};
    for (const b of blanks) {
      const trimmedKey = b.blankKey.trim();
      const validAnswers = b.acceptedAnswers
        .map((a) => a.trim())
        .filter((a) => a.length > 0);
      if (trimmedKey) {
        answerKeyBlanks[trimmedKey] = validAnswers.length > 0 ? validAnswers : [''];
      }
    }

    const config: ClozeConfig = {
      prompt: prompt.trim(),
      templateText: templateText.trim(),
      targetBlanks: blanks.map((b) => ({
        id: b.id,
        blankKey: b.blankKey.trim(),
        ...(b.hintText.trim() ? { hintText: b.hintText.trim() } : {}),
      })),
      answerKey: {
        blanks: answerKeyBlanks,
        ...(explanation.trim() ? { explanation: explanation.trim() } : {}),
      },
      feedbackPolicy,
      allowHints,
    };

    onChangeRef.current(config, isValid);
  }, [prompt, templateText, blanks, explanation, feedbackPolicy, allowHints, isValid]);

  // Insert a new blank into templateText at cursor and append to blanks list
  const handleInsertBlank = () => {
    // Find next available blank number that is not yet in templateText
    let nextNum = 1;
    while (templateText.includes(`{{blank_${nextNum}}}`)) {
      nextNum++;
    }
    const newBlankKey = `blank_${nextNum}`;
    const placeholder = `{{${newBlankKey}}}`;

    // Insert into textarea if active
    const textarea = textareaRef.current;
    if (textarea) {
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const before = templateText.substring(0, start);
      const after = templateText.substring(end);
      setTemplateText(`${before}${placeholder}${after}`);
    } else {
      setTemplateText((prev) => (prev ? `${prev} ${placeholder}` : placeholder));
    }

    // Add to blanks list
    if (!blanks.some((b) => b.blankKey === newBlankKey)) {
      setBlanks((prev) => [
        ...prev,
        {
          id: `b_${Date.now()}_${nextNum}`,
          blankKey: newBlankKey,
          hintText: '',
          acceptedAnswers: [''],
        },
      ]);
    }
  };

  // Auto-detect placeholders in text and create blank entries if missing
  const handleAutoDetectBlanks = () => {
    const currentKeys = new Set(blanks.map((b) => b.blankKey));
    const newItems: BlankItem[] = [];

    for (const ph of extractedPlaceholders) {
      if (!currentKeys.has(ph)) {
        newItems.push({
          id: `b_${Date.now()}_${ph}`,
          blankKey: ph,
          hintText: '',
          acceptedAnswers: [''],
        });
      }
    }

    if (newItems.length > 0) {
      setBlanks((prev) => [...prev, ...newItems]);
    }
  };

  const handleRemoveBlank = (blankKeyToRemove: string) => {
    setBlanks(blanks.filter((b) => b.blankKey !== blankKeyToRemove));
  };

  const handleUpdateBlankKey = (id: string, newKey: string) => {
    setBlanks(blanks.map((b) => (b.id === id ? { ...b, blankKey: newKey } : b)));
  };

  const handleUpdateHint = (id: string, hintText: string) => {
    setBlanks(blanks.map((b) => (b.id === id ? { ...b, hintText } : b)));
  };

  const handleAddAnswerVariant = (blankId: string) => {
    setBlanks(
      blanks.map((b) =>
        b.id === blankId ? { ...b, acceptedAnswers: [...b.acceptedAnswers, ''] } : b,
      ),
    );
  };

  const handleUpdateAnswerVariant = (blankId: string, variantIdx: number, val: string) => {
    setBlanks(
      blanks.map((b) => {
        if (b.id !== blankId) return b;
        const updated = [...b.acceptedAnswers];
        updated[variantIdx] = val;
        return { ...b, acceptedAnswers: updated };
      }),
    );
  };

  const handleRemoveAnswerVariant = (blankId: string, variantIdx: number) => {
    setBlanks(
      blanks.map((b) => {
        if (b.id !== blankId) return b;
        if (b.acceptedAnswers.length <= 1) return b;
        const updated = b.acceptedAnswers.filter((_, idx) => idx !== variantIdx);
        return { ...b, acceptedAnswers: updated };
      }),
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Prompt */}
      <div>
        <label
          htmlFor="cloze-prompt"
          style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}
        >
          Activity Prompt / Instructions <span style={{ color: 'var(--ui-danger)' }}>*</span>
        </label>
        <input
          id="cloze-prompt"
          type="text"
          required
          placeholder="e.g. Complete the sentence with the correct technologies."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            marginTop: '0.25rem',
            padding: '0.4rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--ui-border)',
            backgroundColor: 'var(--ui-bg)',
            color: 'var(--ui-text)',
            fontSize: '0.9rem',
          }}
        />
        {prompt.trim().length > 0 && prompt.trim().length < 3 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--ui-danger)' }}>
            Must be at least 3 characters.
          </span>
        )}
      </div>

      {/* Passage / Template Text */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.25rem',
          }}
        >
          <label
            htmlFor="cloze-template"
            style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}
          >
            Passage Text (with placeholders){' '}
            <span style={{ color: 'var(--ui-danger)' }}>*</span>
          </label>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleInsertBlank}
              disabled={blanks.length >= 10}
            >
              + Insert Blank at Cursor
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAutoDetectBlanks}
              title="Detect any {{...}} in text not yet in the blanks list"
            >
              Auto-detect Blanks
            </Button>
          </div>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', margin: '0 0 0.5rem' }}>
          Use <code>{'{{blank_1}}'}</code>, <code>{'{{blank_2}}'}</code> to designate fill-in positions.
          Each placeholder must have corresponding accepted answers configured below.
        </p>

        <textarea
          ref={textareaRef}
          id="cloze-template"
          rows={4}
          required
          placeholder="e.g. The capital of France is {{blank_1}} and its official language is {{blank_2}}."
          value={templateText}
          onChange={(e) => setTemplateText(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.5rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--ui-border)',
            backgroundColor: 'var(--ui-bg)',
            color: 'var(--ui-text)',
            fontSize: '0.9rem',
            fontFamily: 'inherit',
            lineHeight: '1.5',
          }}
        />
        {templateText.trim().length > 0 && templateText.trim().length < 5 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--ui-danger)' }}>
            Passage text must be at least 5 characters.
          </span>
        )}
      </div>

      {/* Target Blanks Configuration */}
      <div>
        <h4
          style={{
            fontSize: '0.9rem',
            fontWeight: 600,
            color: 'var(--ui-text)',
            margin: '0 0 0.5rem',
          }}
        >
          Configured Blanks &amp; Accepted Answers ({blanks.length}/10)
        </h4>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {blanks.map((b, bIdx) => {
            const isInText = templateText.includes(`{{${b.blankKey}}}`);
            return (
              <div
                key={b.id}
                style={{
                  padding: '0.75rem',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isInText ? 'var(--ui-border)' : 'var(--ui-danger)'}`,
                  background: 'var(--ui-surface)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span
                      style={{
                        padding: '2px 8px',
                        background: 'var(--ui-primary)',
                        color: 'var(--ui-primary-contrast)',
                        borderRadius: 'var(--radius-sm)',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}
                    >
                      Blank #{bIdx + 1}
                    </span>
                    <label
                      htmlFor={`blank-key-${b.id}`}
                      style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-text-muted)' }}
                    >
                      Placeholder Key:
                    </label>
                    <input
                      id={`blank-key-${b.id}`}
                      type="text"
                      required
                      value={b.blankKey}
                      onChange={(e) => handleUpdateBlankKey(b.id, e.target.value)}
                      placeholder="e.g. blank_1"
                      style={{
                        padding: '0.25rem 0.5rem',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        fontSize: '0.8rem',
                        width: '130px',
                        fontWeight: 600,
                      }}
                    />
                    {!isInText && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--ui-danger)' }}>
                        ⚠️ Not found in text ({`{{${b.blankKey}}}`})
                      </span>
                    )}
                  </div>

                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveBlank(b.blankKey)}
                    disabled={blanks.length <= 1}
                    aria-label={`Remove blank ${b.blankKey}`}
                    style={{ color: 'var(--ui-danger)', padding: '2px 8px' }}
                  >
                    ✕ Remove Blank
                  </Button>
                </div>

                {/* Accepted Answer Variants */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.3rem',
                    }}
                  >
                    <label
                      style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-text)' }}
                    >
                      Accepted Answer Variants <span style={{ color: 'var(--ui-danger)' }}>*</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleAddAnswerVariant(b.id)}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--ui-primary)',
                        cursor: 'pointer',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        padding: 0,
                      }}
                    >
                      + Add Variant
                    </button>
                  </div>
                  <p
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--ui-text-muted)',
                      margin: '0 0 0.35rem',
                    }}
                  >
                    Backend evaluates answers deterministically with unicode and punctuation
                    normalization. Provide all acceptable spelling variants (e.g. Paris, paris).
                  </p>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                    {b.acceptedAnswers.map((variant, vIdx) => (
                      <div
                        key={vIdx}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                      >
                        <input
                          type="text"
                          required
                          placeholder={`Accepted variant ${vIdx + 1} (e.g. Paris)`}
                          value={variant}
                          onChange={(e) =>
                            handleUpdateAnswerVariant(b.id, vIdx, e.target.value)
                          }
                          style={{
                            flex: 1,
                            padding: '0.35rem 0.5rem',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--ui-border)',
                            backgroundColor: 'var(--ui-bg)',
                            color: 'var(--ui-text)',
                            fontSize: '0.85rem',
                          }}
                        />
                        {b.acceptedAnswers.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveAnswerVariant(b.id, vIdx)}
                            aria-label={`Remove variant ${vIdx + 1}`}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--ui-danger)',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: '0.85rem',
                            }}
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Optional Hint for this Blank */}
                <div>
                  <input
                    type="text"
                    placeholder="Optional hint for this specific blank (e.g. European capital)"
                    value={b.hintText}
                    onChange={(e) => handleUpdateHint(b.id, e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.3rem 0.5rem',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--ui-border)',
                      backgroundColor: 'var(--ui-bg)',
                      color: 'var(--ui-text)',
                      fontSize: '0.8rem',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Answer Key Explanation */}
      <div>
        <label
          htmlFor="cloze-explanation"
          style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}
        >
          Passage Explanation (Optional)
        </label>
        <textarea
          id="cloze-explanation"
          rows={2}
          placeholder="e.g. Paris is the capital of France and French is the official language."
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            marginTop: '0.25rem',
            padding: '0.4rem 0.6rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--ui-border)',
            backgroundColor: 'var(--ui-bg)',
            color: 'var(--ui-text)',
            fontSize: '0.875rem',
            fontFamily: 'inherit',
          }}
        />
      </div>

      {/* Feedback Policy & Hint Flags */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '1rem',
          padding: '0.75rem',
          background: 'var(--ui-surface-muted)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--ui-border)',
        }}
      >
        <div>
          <label
            htmlFor="cloze-feedback-policy"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-text)' }}
          >
            Feedback Policy:
          </label>
          <select
            id="cloze-feedback-policy"
            value={feedbackPolicy}
            onChange={(e) => setFeedbackPolicy(e.target.value as ClozeFeedbackPolicy)}
            style={{
              marginTop: '0.25rem',
              width: '100%',
              padding: '0.4rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--ui-border)',
              backgroundColor: 'var(--ui-bg)',
              color: 'var(--ui-text)',
              fontSize: '0.85rem',
            }}
          >
            <option value="IMMEDIATE_WITH_EXPLANATION">
              Immediate with Explanation (Recommended)
            </option>
            <option value="IMMEDIATE_CORRECTNESS_ONLY">Immediate Correctness Only</option>
            <option value="DEFERRED">Deferred (Withheld for exam/eval)</option>
          </select>
        </div>

        <div>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--ui-text)',
              cursor: 'pointer',
              marginTop: '0.25rem',
            }}
          >
            <input
              type="checkbox"
              checked={allowHints}
              onChange={(e) => setAllowHints(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            Allow Hints on this Cloze Activity
          </label>
          <p
            style={{
              fontSize: '0.75rem',
              color: 'var(--ui-text-muted)',
              margin: '0.25rem 0 0 1.5rem',
            }}
          >
            When enabled, learners may request individual blank hints during practice.
          </p>
        </div>
      </div>
    </div>
  );
}
