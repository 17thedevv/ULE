import React, { useEffect, useRef, useState } from 'react';
import {
  MultipleChoiceConfig,
  MultipleChoiceFeedbackPolicy,
  MultipleChoiceOption,
} from '@ule/contracts';
import { Button } from '../../../components/ui/Button';

interface MultipleChoiceBlockEditorProps {
  initialConfig?: Partial<MultipleChoiceConfig>;
  onChange: (config: MultipleChoiceConfig, isValid: boolean) => void;
}

export function MultipleChoiceBlockEditor({
  initialConfig,
  onChange,
}: MultipleChoiceBlockEditorProps) {
  const [question, setQuestion] = useState<string>(
    typeof initialConfig?.question === 'string' ? initialConfig.question : '',
  );

  const [options, setOptions] = useState<MultipleChoiceOption[]>(() => {
    if (Array.isArray(initialConfig?.options) && initialConfig.options.length >= 2) {
      return initialConfig.options.map((opt, i) => ({
        id: opt.id || `opt_${i + 1}`,
        text: opt.text || '',
        explanation: opt.explanation || '',
      }));
    }
    return [
      { id: 'opt_1', text: '' },
      { id: 'opt_2', text: '' },
    ];
  });

  const [correctOptionId, setCorrectOptionId] = useState<string>(
    initialConfig?.answerKey?.correctOptionId || '',
  );

  const [explanation, setExplanation] = useState<string>(
    initialConfig?.answerKey?.explanation || '',
  );

  const [feedbackPolicy, setFeedbackPolicy] = useState<MultipleChoiceFeedbackPolicy>(
    initialConfig?.feedbackPolicy || 'IMMEDIATE_WITH_EXPLANATION',
  );

  const [allowHints, setAllowHints] = useState<boolean>(Boolean(initialConfig?.allowHints));
  const [hintText, setHintText] = useState<string>(initialConfig?.hintText || '');

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Validation logic
  const validationErrors: string[] = [];
  if (question.trim().length < 3) {
    validationErrors.push('Question text must be at least 3 characters.');
  }
  if (options.length < 2) {
    validationErrors.push('At least 2 options are required.');
  } else if (options.length > 10) {
    validationErrors.push('At most 10 options are allowed.');
  }

  const emptyOptions = options.some((opt) => opt.text.trim().length === 0);
  if (emptyOptions) {
    validationErrors.push('All options must have non-empty text.');
  }

  const optionIdSet = new Set(options.map((opt) => opt.id));
  if (optionIdSet.size !== options.length) {
    validationErrors.push('Duplicate option IDs detected.');
  }

  if (!correctOptionId || !optionIdSet.has(correctOptionId)) {
    validationErrors.push('Exactly one valid option must be selected as the correct answer.');
  }

  if (allowHints && hintText.trim().length === 0) {
    validationErrors.push('When hints are enabled, hint text must not be empty.');
  }

  const isValid = validationErrors.length === 0;

  // Propagate changes to parent
  useEffect(() => {
    const config: MultipleChoiceConfig = {
      question: question.trim(),
      options: options.map((opt) => ({
        id: opt.id,
        text: opt.text.trim(),
        ...(opt.explanation?.trim() ? { explanation: opt.explanation.trim() } : {}),
      })),
      answerKey: {
        correctOptionId,
        ...(explanation.trim() ? { explanation: explanation.trim() } : {}),
      },
      feedbackPolicy,
      allowHints,
      ...(allowHints && hintText.trim() ? { hintText: hintText.trim() } : {}),
    };

    onChangeRef.current(config, isValid);
  }, [
    question,
    options,
    correctOptionId,
    explanation,
    feedbackPolicy,
    allowHints,
    hintText,
    isValid,
  ]);

  const handleAddOption = () => {
    if (options.length >= 10) return;
    const nextIdx = options.length + 1;
    const newId = `opt_${Date.now()}_${nextIdx}`;
    setOptions([...options, { id: newId, text: '' }]);
  };

  const handleRemoveOption = (idToRemove: string) => {
    if (options.length <= 2) return;
    const nextOptions = options.filter((opt) => opt.id !== idToRemove);
    setOptions(nextOptions);

    // CRITICAL: If the deleted option was selected as correct, clear correctOptionId.
    // Do NOT silently pick the first option.
    if (correctOptionId === idToRemove) {
      setCorrectOptionId('');
    }
  };

  const handleOptionTextChange = (id: string, text: string) => {
    setOptions(options.map((opt) => (opt.id === id ? { ...opt, text } : opt)));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Question Text */}
      <div>
        <label
          htmlFor="mcq-question"
          style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}
        >
          Question Prompt <span style={{ color: 'var(--ui-danger)' }}>*</span>
        </label>
        <textarea
          id="mcq-question"
          rows={3}
          required
          placeholder="e.g. What is the capital of France?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            marginTop: '0.25rem',
            padding: '0.5rem',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--ui-border)',
            backgroundColor: 'var(--ui-bg)',
            color: 'var(--ui-text)',
            fontSize: '0.9rem',
            fontFamily: 'inherit',
          }}
        />
        {question.trim().length > 0 && question.trim().length < 3 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--ui-danger)' }}>
            Must be at least 3 characters.
          </span>
        )}
      </div>

      {/* Options List */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '0.5rem',
          }}
        >
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
            Choices ({options.length}/10){' '}
            <span style={{ color: 'var(--ui-danger)' }}>*</span>
          </label>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleAddOption}
            disabled={options.length >= 10}
          >
            + Add Option
          </Button>
        </div>

        <p style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', margin: '0 0 0.5rem' }}>
          Select the radio button next to the single correct option. (2–10 options required)
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {options.map((opt, idx) => {
            const isCorrect = correctOptionId === opt.id;
            return (
              <div
                key={opt.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${isCorrect ? 'var(--ui-primary)' : 'var(--ui-border)'}`,
                  background: isCorrect ? 'var(--ui-surface-muted)' : 'var(--ui-surface)',
                }}
              >
                {/* Radio button for correct option */}
                <input
                  type="radio"
                  id={`radio-${opt.id}`}
                  name="mcq-correct-choice"
                  checked={isCorrect}
                  onChange={() => setCorrectOptionId(opt.id)}
                  aria-label={`Mark option ${idx + 1} as correct`}
                  style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                />

                <span
                  style={{
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    color: 'var(--ui-text-muted)',
                    minWidth: '22px',
                  }}
                >
                  {String.fromCharCode(65 + idx)}.
                </span>

                <input
                  type="text"
                  required
                  placeholder={`Choice ${idx + 1} text`}
                  value={opt.text}
                  onChange={(e) => handleOptionTextChange(opt.id, e.target.value)}
                  style={{
                    flex: 1,
                    padding: '0.4rem 0.6rem',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--ui-border)',
                    backgroundColor: 'var(--ui-bg)',
                    color: 'var(--ui-text)',
                    fontSize: '0.875rem',
                  }}
                />

                {isCorrect && (
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      color: 'var(--ui-primary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    ✓ Correct
                  </span>
                )}

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveOption(opt.id)}
                  disabled={options.length <= 2}
                  aria-label={`Remove option ${idx + 1}`}
                  style={{ color: 'var(--ui-danger)', padding: '2px 8px' }}
                >
                  ✕
                </Button>
              </div>
            );
          })}
        </div>

        {!correctOptionId && (
          <div
            role="alert"
            style={{
              fontSize: '0.8rem',
              color: 'var(--ui-danger)',
              marginTop: '0.5rem',
              fontWeight: 500,
            }}
          >
            ⚠️ Please select which choice is the correct answer.
          </div>
        )}
      </div>

      {/* Answer Key Explanation */}
      <div>
        <label
          htmlFor="mcq-explanation"
          style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}
        >
          Explanation (Optional)
        </label>
        <p style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', margin: '0.15rem 0 0.35rem' }}>
          Displayed to learners after evaluation when using an immediate explanation feedback policy.
        </p>
        <textarea
          id="mcq-explanation"
          rows={2}
          placeholder="e.g. Paris is the capital and largest city of France."
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
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

      {/* Feedback Policy & Hints Configuration */}
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
            htmlFor="mcq-feedback-policy"
            style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-text)' }}
          >
            Feedback Policy:
          </label>
          <select
            id="mcq-feedback-policy"
            value={feedbackPolicy}
            onChange={(e) => setFeedbackPolicy(e.target.value as MultipleChoiceFeedbackPolicy)}
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
            Allow Hint on this Question
          </label>

          {allowHints && (
            <input
              type="text"
              required
              placeholder="Hint text delivered on learner request"
              value={hintText}
              onChange={(e) => setHintText(e.target.value)}
              style={{
                marginTop: '0.4rem',
                width: '100%',
                padding: '0.35rem 0.5rem',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--ui-border)',
                backgroundColor: 'var(--ui-bg)',
                color: 'var(--ui-text)',
                fontSize: '0.85rem',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
