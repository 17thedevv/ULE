import React, { useCallback, useEffect, useState } from 'react';
import { QuestionBankItemDto, QuestionType } from '@ule/contracts';
import {
  createQuestionBankItem,
  fetchQuestionBankItems,
  publishQuestionVersion,
} from '../../services/creator';
import { buildQuestionPayload } from './question-payload-builder';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

export default function QuestionBankPage() {
  const [items, setItems] = useState<QuestionBankItemDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter
  const [typeFilter, setTypeFilter] = useState<string>('');

  // Add question form state
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [qType, setQType] = useState<QuestionType>('MULTIPLE_CHOICE');
  const [points, setPoints] = useState<number>(10);
  const [tagsInput, setTagsInput] = useState<string>('architecture, fundamentals');
  const [creating, setCreating] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Interactive customizable question content state
  const [optionsList, setOptionsList] = useState<Array<{ id: string; text: string }>>([
    { id: 'opt_1', text: 'Option A: Authoritative server state' },
    { id: 'opt_2', text: 'Option B: Client-inferred state' },
  ]);
  const [singleChoiceOption, setSingleChoiceOption] = useState<string>('opt_1');
  const [multiChoiceOptions, setMultiChoiceOptions] = useState<string[]>(['opt_1']);
  const [trueFalseValue, setTrueFalseValue] = useState<boolean>(true);
  const [matchingPairs, setMatchingPairs] = useState<
    Array<{ premiseId: string; premiseText: string; targetId: string; targetText: string }>
  >([
    { premiseId: 'p_1', premiseText: 'PostgreSQL', targetId: 't_1', targetText: 'Authoritative database' },
    { premiseId: 'p_2', premiseText: 'React + Vite', targetId: 't_2', targetText: 'Single Page Application' },
  ]);
  const [orderingItems, setOrderingItems] = useState<Array<{ id: string; text: string }>>([
    { id: 'o_1', text: 'Define API contract' },
    { id: 'o_2', text: 'Implement backend service' },
    { id: 'o_3', text: 'Integrate frontend client' },
  ]);
  const [clozeTemplate, setClozeTemplate] = useState<string>(
    'ULE backend uses {{blank_1}} as the primary server framework.',
  );
  const [clozeBlankKey, setClozeBlankKey] = useState<string>('blank_1');
  const [clozeVariants, setClozeVariants] = useState<string>('NestJS, Nest.js');
  const [shortTextAnswers, setShortTextAnswers] = useState<string>('PostgreSQL, Postgres');
  const [numericValue, setNumericValue] = useState<number>(15);
  const [numericTolerance, setNumericTolerance] = useState<number>(0);
  const [numericUnit, setNumericUnit] = useState<string>('seconds');
  const [essayCriterionName, setEssayCriterionName] = useState<string>('Architectural Soundness');
  const [essayCriterionDescription, setEssayCriterionDescription] = useState<string>(
    'Evaluation of system architecture and modular boundaries',
  );

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQuestionBankItems(typeFilter ? { type: typeFilter } : undefined);
      setItems(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load question bank.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !prompt.trim()) return;

    setActionError(null);
    setActionSuccess(null);
    setCreating(true);

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const payload = buildQuestionPayload({
      title,
      prompt,
      type: qType,
      points,
      tags,
      optionsList,
      singleChoiceOption,
      multiChoiceOptions,
      trueFalseValue,
      matchingPairs,
      orderingItems,
      clozeTemplate,
      clozeTargetBlanks: [{ blankKey: clozeBlankKey, hint: 'Framework name' }],
      clozeAcceptedVariants: {
        [clozeBlankKey]: clozeVariants
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      },
      shortTextAnswers: shortTextAnswers
        .split(',')
        .map((a) => a.trim())
        .filter(Boolean),
      numericValue,
      numericTolerance,
      numericUnit,
      essayCriterionName,
      essayCriterionDescription,
    });

    try {
      await createQuestionBankItem(payload);
      setTitle('');
      setPrompt('');
      setShowAddForm(false);
      setActionSuccess('Question created in Question Bank.');
      await loadItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create question.';
      setActionError(msg);
    } finally {
      setCreating(false);
    }
  };

  const handlePublishVersion = async (itemId: string) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const ver = await publishQuestionVersion(itemId);
      setActionSuccess(`Question version published: v${ver.versionNumber}`);
      await loadItems();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to publish version.';
      setActionError(msg);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ui-text)', margin: '0 0 0.25rem' }}>
            Author Question Bank
          </h1>
          <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Reusable assessment items with versioned blueprints, secret answer keys, and rubric criteria.
          </p>
        </div>
        <Button variant="primary" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? 'Cancel' : '+ New Question'}
        </Button>
      </div>

      {actionError && (
        <div style={{ padding: '0.75rem', backgroundColor: 'var(--ui-surface)', border: '1px solid var(--ui-danger)', color: 'var(--ui-danger)', borderRadius: 'var(--ui-radius-sm)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          ⚠️ {actionError}
        </div>
      )}

      {actionSuccess && (
        <div style={{ padding: '0.75rem', backgroundColor: 'var(--ui-surface)', border: '1px solid var(--ui-success)', color: 'var(--ui-success)', borderRadius: 'var(--ui-radius-sm)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          ✓ {actionSuccess}
        </div>
      )}

      {/* Add Form */}
      {showAddForm && (
        <Card style={{ marginBottom: '1.5rem', border: '1px solid var(--ui-primary)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.75rem' }}>
            Create Question Bank Item
          </h3>
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ flex: 1, minWidth: 200, fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                Title:
                <input
                  type="text"
                  required
                  placeholder="e.g. Invariant Boundary MCQ"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  style={{
                    display: 'block',
                    marginTop: '0.25rem',
                    padding: '0.4rem',
                    borderRadius: 'var(--ui-radius-sm)',
                    border: '1px solid var(--ui-border)',
                    backgroundColor: 'var(--ui-bg)',
                    color: 'var(--ui-text)',
                    width: '100%',
                  }}
                />
              </label>

              <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                Question Type:
                <select
                  value={qType}
                  onChange={(e) => setQType(e.target.value as QuestionType)}
                  style={{
                    display: 'block',
                    marginTop: '0.25rem',
                    padding: '0.4rem',
                    borderRadius: 'var(--ui-radius-sm)',
                    border: '1px solid var(--ui-border)',
                    backgroundColor: 'var(--ui-bg)',
                    color: 'var(--ui-text)',
                  }}
                >
                  <option value="SINGLE_CHOICE">SINGLE_CHOICE (Single select)</option>
                  <option value="MULTIPLE_CHOICE">MULTIPLE_CHOICE (Multi-select)</option>
                  <option value="TRUE_FALSE">TRUE_FALSE (Binary boolean)</option>
                  <option value="CLOZE">CLOZE (Fill-in-the-blank)</option>
                  <option value="SHORT_TEXT">SHORT_TEXT (Short phrase)</option>
                  <option value="NUMERIC">NUMERIC (Number with tolerance)</option>
                  <option value="ESSAY">ESSAY (Rubric / Human evaluated)</option>
                  <option value="MATCHING">MATCHING (Pair association)</option>
                  <option value="ORDERING">ORDERING (Sequence)</option>
                </select>
              </label>

              <label style={{ width: 100, fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                Points:
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={points}
                  onChange={(e) => setPoints(parseInt(e.target.value, 10) || 1)}
                  style={{
                    display: 'block',
                    marginTop: '0.25rem',
                    padding: '0.4rem',
                    borderRadius: 'var(--ui-radius-sm)',
                    border: '1px solid var(--ui-border)',
                    backgroundColor: 'var(--ui-bg)',
                    color: 'var(--ui-text)',
                    width: '100%',
                  }}
                />
              </label>
            </div>

            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
              Prompt Text (Markdown supported):
              <textarea
                rows={3}
                required
                placeholder="Write the full question prompt presented to the examinee..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  padding: '0.4rem',
                  borderRadius: 'var(--ui-radius-sm)',
                  border: '1px solid var(--ui-border)',
                  backgroundColor: 'var(--ui-bg)',
                  color: 'var(--ui-text)',
                  width: '100%',
                  fontFamily: 'inherit',
                }}
              />
            </label>

            {/* Interactive Question Options & Answer Key Configuration */}
            <div
              style={{
                padding: '0.85rem',
                borderRadius: 'var(--ui-radius-sm)',
                border: '1px solid var(--ui-border)',
                background: 'var(--ui-surface-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '0.88rem', color: 'var(--ui-text)' }}>
                  Question Configuration & Answer Key ({qType})
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--ui-text-muted)' }}>
                  Interactive Creator Template
                </span>
              </div>

              {/* SINGLE CHOICE & MULTIPLE CHOICE CONFIGURATION */}
              {(qType === 'SINGLE_CHOICE' || qType === 'MULTIPLE_CHOICE') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    Options ({qType === 'SINGLE_CHOICE' ? 'Select 1 correct option' : 'Check all correct options'}):
                  </span>
                  {optionsList.map((opt, idx) => {
                    const isChecked = qType === 'SINGLE_CHOICE'
                      ? singleChoiceOption === opt.id
                      : multiChoiceOptions.includes(opt.id);

                    return (
                      <div key={opt.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        <input
                          type={qType === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                          name="qbank_choice"
                          checked={isChecked}
                          onChange={() => {
                            if (qType === 'SINGLE_CHOICE') {
                              setSingleChoiceOption(opt.id);
                            } else {
                              setMultiChoiceOptions((prev) =>
                                prev.includes(opt.id)
                                  ? prev.filter((id) => id !== opt.id)
                                  : [...prev, opt.id],
                              );
                            }
                          }}
                        />
                        <input
                          type="text"
                          value={opt.text}
                          onChange={(e) => {
                            const val = e.target.value;
                            setOptionsList((prev) =>
                              prev.map((o, i) => (i === idx ? { ...o, text: val } : o)),
                            );
                          }}
                          style={{
                            flex: 1,
                            padding: '0.3rem 0.5rem',
                            borderRadius: 'var(--ui-radius-sm)',
                            border: '1px solid var(--ui-border)',
                            backgroundColor: 'var(--ui-bg)',
                            color: 'var(--ui-text)',
                            fontSize: '0.85rem',
                          }}
                        />
                        {optionsList.length > 2 && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              setOptionsList((prev) => prev.filter((_, i) => i !== idx));
                              setMultiChoiceOptions((prev) => prev.filter((id) => id !== opt.id));
                              if (singleChoiceOption === opt.id) {
                                const remaining = optionsList.filter((_, i) => i !== idx);
                                if (remaining.length > 0) setSingleChoiceOption(remaining[0].id);
                              }
                            }}
                          >
                            Remove
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  <div style={{ marginTop: '0.25rem' }}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const newId = `opt_${Date.now()}`;
                        setOptionsList((prev) => [...prev, { id: newId, text: `Option ${prev.length + 1}` }]);
                      }}
                    >
                      + Add Option
                    </Button>
                  </div>
                </div>
              )}

              {/* TRUE / FALSE CONFIGURATION */}
              {qType === 'TRUE_FALSE' && (
                <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>Correct Value:</span>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="tf_value"
                      checked={trueFalseValue === true}
                      onChange={() => setTrueFalseValue(true)}
                    />
                    True
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem', cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="tf_value"
                      checked={trueFalseValue === false}
                      onChange={() => setTrueFalseValue(false)}
                    />
                    False
                  </label>
                </div>
              )}

              {/* CLOZE CONFIGURATION */}
              {qType === 'CLOZE' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    Template Text (Use {'{{blank_key}}'} markers):
                    <input
                      type="text"
                      value={clozeTemplate}
                      onChange={(e) => setClozeTemplate(e.target.value)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '0.2rem',
                        padding: '0.3rem 0.5rem',
                        borderRadius: 'var(--ui-radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <label style={{ width: '40%', fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                      Blank Key:
                      <input
                        type="text"
                        value={clozeBlankKey}
                        onChange={(e) => setClozeBlankKey(e.target.value)}
                        style={{
                          display: 'block',
                          width: '100%',
                          marginTop: '0.2rem',
                          padding: '0.3rem 0.5rem',
                          borderRadius: 'var(--ui-radius-sm)',
                          border: '1px solid var(--ui-border)',
                          backgroundColor: 'var(--ui-bg)',
                          color: 'var(--ui-text)',
                          fontSize: '0.85rem',
                        }}
                      />
                    </label>
                    <label style={{ flex: 1, fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                      Accepted Answer Variants (comma separated):
                      <input
                        type="text"
                        value={clozeVariants}
                        onChange={(e) => setClozeVariants(e.target.value)}
                        style={{
                          display: 'block',
                          width: '100%',
                          marginTop: '0.2rem',
                          padding: '0.3rem 0.5rem',
                          borderRadius: 'var(--ui-radius-sm)',
                          border: '1px solid var(--ui-border)',
                          backgroundColor: 'var(--ui-bg)',
                          color: 'var(--ui-text)',
                          fontSize: '0.85rem',
                        }}
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* SHORT TEXT CONFIGURATION */}
              {qType === 'SHORT_TEXT' && (
                <label style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                  Acceptable Answers (comma separated):
                  <input
                    type="text"
                    value={shortTextAnswers}
                    onChange={(e) => setShortTextAnswers(e.target.value)}
                    style={{
                      display: 'block',
                      width: '100%',
                      marginTop: '0.2rem',
                      padding: '0.3rem 0.5rem',
                      borderRadius: 'var(--ui-radius-sm)',
                      border: '1px solid var(--ui-border)',
                      backgroundColor: 'var(--ui-bg)',
                      color: 'var(--ui-text)',
                      fontSize: '0.85rem',
                    }}
                  />
                </label>
              )}

              {/* NUMERIC CONFIGURATION */}
              {qType === 'NUMERIC' && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <label style={{ flex: 1, fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    Expected Value:
                    <input
                      type="number"
                      value={numericValue}
                      onChange={(e) => setNumericValue(parseFloat(e.target.value) || 0)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '0.2rem',
                        padding: '0.3rem 0.5rem',
                        borderRadius: 'var(--ui-radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </label>
                  <label style={{ width: 100, fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    Tolerance:
                    <input
                      type="number"
                      value={numericTolerance}
                      onChange={(e) => setNumericTolerance(parseFloat(e.target.value) || 0)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '0.2rem',
                        padding: '0.3rem 0.5rem',
                        borderRadius: 'var(--ui-radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </label>
                  <label style={{ width: 120, fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    Unit:
                    <input
                      type="text"
                      value={numericUnit}
                      onChange={(e) => setNumericUnit(e.target.value)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '0.2rem',
                        padding: '0.3rem 0.5rem',
                        borderRadius: 'var(--ui-radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </label>
                </div>
              )}

              {/* ESSAY RUBRIC CONFIGURATION */}
              {qType === 'ESSAY' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    Rubric Criterion Name:
                    <input
                      type="text"
                      value={essayCriterionName}
                      onChange={(e) => setEssayCriterionName(e.target.value)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '0.2rem',
                        padding: '0.3rem 0.5rem',
                        borderRadius: 'var(--ui-radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </label>
                  <label style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    Evaluation Guidance / Description:
                    <input
                      type="text"
                      value={essayCriterionDescription}
                      onChange={(e) => setEssayCriterionDescription(e.target.value)}
                      style={{
                        display: 'block',
                        width: '100%',
                        marginTop: '0.2rem',
                        padding: '0.3rem 0.5rem',
                        borderRadius: 'var(--ui-radius-sm)',
                        border: '1px solid var(--ui-border)',
                        backgroundColor: 'var(--ui-bg)',
                        color: 'var(--ui-text)',
                        fontSize: '0.85rem',
                      }}
                    />
                  </label>
                </div>
              )}

              {/* MATCHING PAIRS CONFIGURATION */}
              {qType === 'MATCHING' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    Matching Pairs (Premise ➔ Target Association):
                  </span>
                  {matchingPairs.map((pair, idx) => (
                    <div key={pair.premiseId} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        placeholder="Premise text"
                        value={pair.premiseText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMatchingPairs((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, premiseText: val } : p)),
                          );
                        }}
                        style={{
                          flex: 1,
                          padding: '0.3rem 0.5rem',
                          borderRadius: 'var(--ui-radius-sm)',
                          border: '1px solid var(--ui-border)',
                          backgroundColor: 'var(--ui-bg)',
                          color: 'var(--ui-text)',
                          fontSize: '0.85rem',
                        }}
                      />
                      <span style={{ color: 'var(--ui-text-muted)' }}>➔</span>
                      <input
                        type="text"
                        placeholder="Target text"
                        value={pair.targetText}
                        onChange={(e) => {
                          const val = e.target.value;
                          setMatchingPairs((prev) =>
                            prev.map((p, i) => (i === idx ? { ...p, targetText: val } : p)),
                          );
                        }}
                        style={{
                          flex: 1,
                          padding: '0.3rem 0.5rem',
                          borderRadius: 'var(--ui-radius-sm)',
                          border: '1px solid var(--ui-border)',
                          backgroundColor: 'var(--ui-bg)',
                          color: 'var(--ui-text)',
                          fontSize: '0.85rem',
                        }}
                      />
                      {matchingPairs.length > 2 && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setMatchingPairs((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const newIdx = matchingPairs.length + 1;
                        setMatchingPairs((prev) => [
                          ...prev,
                          {
                            premiseId: `p_${Date.now()}`,
                            premiseText: `Premise ${newIdx}`,
                            targetId: `t_${Date.now()}`,
                            targetText: `Target ${newIdx}`,
                          },
                        ]);
                      }}
                    >
                      + Add Pair
                    </Button>
                  </div>
                </div>
              )}

              {/* ORDERING SEQUENCE CONFIGURATION */}
              {qType === 'ORDERING' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    Sequence Items (In correct order from top to bottom):
                  </span>
                  {orderingItems.map((item, idx) => (
                    <div key={item.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <span style={{ width: 20, fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-text-muted)' }}>
                        {idx + 1}.
                      </span>
                      <input
                        type="text"
                        value={item.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          setOrderingItems((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, text: val } : it)),
                          );
                        }}
                        style={{
                          flex: 1,
                          padding: '0.3rem 0.5rem',
                          borderRadius: 'var(--ui-radius-sm)',
                          border: '1px solid var(--ui-border)',
                          backgroundColor: 'var(--ui-bg)',
                          color: 'var(--ui-text)',
                          fontSize: '0.85rem',
                        }}
                      />
                      {orderingItems.length > 2 && (
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setOrderingItems((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  <div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const newId = `o_${Date.now()}`;
                        setOrderingItems((prev) => [
                          ...prev,
                          { id: newId, text: `Step ${prev.length + 1}` },
                        ]);
                      }}
                    >
                      + Add Step
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
              Tags (comma separated):
              <input
                type="text"
                value={tagsInput}
                onChange={(e) => setTagsInput(e.target.value)}
                style={{
                  display: 'block',
                  marginTop: '0.25rem',
                  padding: '0.4rem',
                  borderRadius: 'var(--ui-radius-sm)',
                  border: '1px solid var(--ui-border)',
                  backgroundColor: 'var(--ui-bg)',
                  color: 'var(--ui-text)',
                  width: '100%',
                }}
              />
            </label>

            <div>
              <Button type="submit" variant="primary" disabled={creating || !title.trim() || !prompt.trim()}>
                {creating ? 'Creating…' : 'Save Question to Bank'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Filter Toolbar */}
      <div style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)' }}>Filter type:</span>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={{
            padding: '0.3rem 0.5rem',
            borderRadius: 'var(--ui-radius-sm)',
            border: '1px solid var(--ui-border)',
            backgroundColor: 'var(--ui-bg)',
            color: 'var(--ui-text)',
            fontSize: '0.85rem',
          }}
        >
          <option value="">All Question Types (9 allowlisted)</option>
          <option value="SINGLE_CHOICE">SINGLE_CHOICE</option>
          <option value="MULTIPLE_CHOICE">MULTIPLE_CHOICE</option>
          <option value="TRUE_FALSE">TRUE_FALSE</option>
          <option value="CLOZE">CLOZE</option>
          <option value="SHORT_TEXT">SHORT_TEXT</option>
          <option value="NUMERIC">NUMERIC</option>
          <option value="ESSAY">ESSAY</option>
          <option value="MATCHING">MATCHING</option>
          <option value="ORDERING">ORDERING</option>
        </select>
      </div>

      {loading && <LoadingState message="Loading question bank items…" />}
      {!loading && error && (
        <ErrorState
          title="Could not load question bank"
          message={error}
          onRetry={loadItems}
        />
      )}
      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon="❓"
          title="Question bank is empty"
          description="Create question bank items to compose structured assessment blueprints."
        />
      )}
      {!loading && !error && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {items.map((item) => (
            <Card key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>
                    {item.title}
                  </h3>
                  <Badge variant="neutral">{item.type}</Badge>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    {item.defaultPoints} pts
                  </span>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0 0 0.35rem', lineHeight: 1.4 }}>
                  {item.prompt}
                </p>
                {item.tags && item.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    {item.tags.map((t) => (
                      <span
                        key={t}
                        style={{
                          fontSize: '0.75rem',
                          padding: '0.1rem 0.4rem',
                          borderRadius: 'var(--ui-radius-sm)',
                          backgroundColor: 'var(--ui-surface-subtle)',
                          color: 'var(--ui-text-muted)',
                        }}
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <Button
                  variant="secondary"
                  onClick={() => handlePublishVersion(item.id)}
                >
                  Publish Snapshot
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
