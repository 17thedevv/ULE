import React, { useCallback, useEffect, useState } from 'react';
import { QuestionBankItemDto, QuestionType } from '@ule/contracts';
import {
  createQuestionBankItem,
  fetchQuestionBankItems,
  publishQuestionVersion,
} from '../../services/creator';
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

  const loadItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchQuestionBankItems(typeFilter ? { questionType: typeFilter } : undefined);
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

    let content: Record<string, unknown> = {};
    let answerKey: Record<string, unknown> | undefined;
    let rubric: Record<string, unknown> | undefined;

    if (qType === 'MULTIPLE_CHOICE') {
      content = {
        options: [
          { id: 'opt-1', text: 'Option A: Authoritative server state' },
          { id: 'opt-2', text: 'Option B: Client-inferred state' },
        ],
      };
      answerKey = { correctOptionId: 'opt-1' };
    } else if (qType === 'ESSAY') {
      rubric = {
        criteria: [
          {
            id: 'c1',
            title: 'Architectural Soundness',
            maxPoints: points,
            levels: [
              { points, description: 'Clearly decouples services with versioned contracts' },
            ],
          },
        ],
      };
    }

    try {
      await createQuestionBankItem({
        title: title.trim(),
        prompt: prompt.trim(),
        type: qType,
        defaultPoints: points,
        content,
        answerKey,
        rubric,
        tags,
      });
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
                  <option value="MULTIPLE_CHOICE">MULTIPLE_CHOICE (Automated)</option>
                  <option value="ESSAY">ESSAY (Rubric / Human)</option>
                  <option value="CODE_EXECUTION">CODE_EXECUTION (Automated)</option>
                  <option value="FILE_RESPONSE">FILE_RESPONSE (Human)</option>
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
          <option value="">All Question Types</option>
          <option value="MULTIPLE_CHOICE">MULTIPLE_CHOICE</option>
          <option value="ESSAY">ESSAY</option>
          <option value="CODE_EXECUTION">CODE_EXECUTION</option>
          <option value="FILE_RESPONSE">FILE_RESPONSE</option>
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
