import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  CourseDraftDto,
  CourseVersionDto,
  DraftBlockInstanceDto,
  DraftValidationResponseDto,
} from '@ule/contracts';
import {
  addDraftBlock,
  deleteDraftBlock,
  fetchCourseDraft,
  fetchCourseVersions,
  fetchDraftBlocks,
  publishCourseVersion,
  reorderDraftBlocks,
  updateCourseDraft,
  validateDraftBlocks,
} from '../../services/creator';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

export default function CourseDraftEditor() {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();

  const [draft, setDraft] = useState<CourseDraftDto | null>(null);
  const [blocks, setBlocks] = useState<DraftBlockInstanceDto[]>([]);
  const [versions, setVersions] = useState<CourseVersionDto[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Actions state
  const [validationResult, setValidationResult] = useState<DraftValidationResponseDto | null>(null);
  const [validating, setValidating] = useState<boolean>(false);
  const [publishing, setPublishing] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Add block state
  const [showAddBlock, setShowAddBlock] = useState<boolean>(false);
  const [newBlockTitle, setNewBlockTitle] = useState<string>('');
  const [newBlockType, setNewBlockType] = useState<string>('video');
  const [newBlockUrl, setNewBlockUrl] = useState<string>('https://example.com/video.mp4');
  const [addingBlock, setAddingBlock] = useState<boolean>(false);

  // Edit draft title/description
  const [draftTitle, setDraftTitle] = useState<string>('');
  const [draftDesc, setDraftDesc] = useState<string>('');
  const [savingMeta, setSavingMeta] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    setError(null);
    try {
      const [draftData, blockList, versionList] = await Promise.all([
        fetchCourseDraft(courseId),
        fetchDraftBlocks(courseId),
        fetchCourseVersions(courseId).catch(() => []),
      ]);
      setDraft(draftData);
      setDraftTitle(draftData.title);
      setDraftDesc(draftData.description || '');
      setBlocks(blockList.sort((a, b) => a.orderIndex - b.orderIndex));
      setVersions(versionList);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load course draft.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveMeta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !draft) return;
    setActionError(null);
    setActionSuccess(null);
    setSavingMeta(true);
    try {
      const updated = await updateCourseDraft(courseId, {
        title: draftTitle,
        description: draftDesc,
        expectedRevision: draft.revision,
      });
      setDraft(updated);
      setActionSuccess('Course draft metadata updated.');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update metadata.';
      setActionError(msg);
    } finally {
      setSavingMeta(false);
    }
  };

  const handleAddBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseId || !draft || !newBlockTitle.trim()) return;

    setActionError(null);
    setActionSuccess(null);
    setAddingBlock(true);

    let config: Record<string, unknown> = {};
    if (newBlockType === 'video') {
      config = { url: newBlockUrl, allowSkip: true };
    } else if (newBlockType === 'multiple-choice') {
      config = {
        prompt: 'Select the correct architectural principle:',
        options: [
          { id: 'opt-1', text: 'Loose coupling with clear boundaries' },
          { id: 'opt-2', text: 'Tight direct database connections from clients' },
        ],
        correctOptionId: 'opt-1',
      };
    } else if (newBlockType === 'cloze') {
      config = {
        template: 'ULE backend uses [[NestJS]] with [[PostgreSQL]] database.',
        blanks: [
          { id: 'b1', answer: 'NestJS' },
          { id: 'b2', answer: 'PostgreSQL' },
        ],
      };
    }

    try {
      await addDraftBlock(courseId, {
        title: newBlockTitle.trim(),
        blockTypeId: newBlockType,
        config,
        expectedRevision: draft.revision,
      });
      setNewBlockTitle('');
      setShowAddBlock(false);
      setActionSuccess('Activity block added successfully.');
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to add block.';
      setActionError(msg);
    } finally {
      setAddingBlock(false);
    }
  };

  const handleDeleteBlock = async (blockId: string) => {
    if (!courseId || !draft) return;
    setActionError(null);
    setActionSuccess(null);
    try {
      await deleteDraftBlock(courseId, blockId, draft.revision);
      setActionSuccess('Activity block deleted.');
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete block.';
      setActionError(msg);
    }
  };

  const handleMoveBlock = async (index: number, direction: 'UP' | 'DOWN') => {
    if (!courseId || !draft) return;
    const targetIndex = direction === 'UP' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= blocks.length) return;

    const newBlocks = [...blocks];
    const [moved] = newBlocks.splice(index, 1);
    newBlocks.splice(targetIndex, 0, moved);

    const blockIds = newBlocks.map((b) => b.id);
    setActionError(null);
    setActionSuccess(null);
    try {
      await reorderDraftBlocks(courseId, {
        blockIds,
        expectedRevision: draft.revision,
      });
      setActionSuccess('Blocks reordered successfully.');
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to reorder blocks.';
      setActionError(msg);
    }
  };

  const handleValidate = async () => {
    if (!courseId) return;
    setActionError(null);
    setActionSuccess(null);
    setValidating(true);
    try {
      const res = await validateDraftBlocks(courseId);
      setValidationResult(res);
      if (res.valid) {
        setActionSuccess('All activity blocks are valid and ready for publishing!');
      } else {
        setActionError(`Draft contains ${res.invalidBlocksCount} validation error(s).`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to validate blocks.';
      setActionError(msg);
    } finally {
      setValidating(false);
    }
  };

  const handlePublish = async () => {
    if (!courseId) return;
    setActionError(null);
    setActionSuccess(null);
    setPublishing(true);
    try {
      const newVersion = await publishCourseVersion(courseId);
      setActionSuccess(
        `Course Version snapshot v${newVersion.versionNumber} published successfully! Immutable and ready for learner grants.`,
      );
      await loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to publish course version.';
      setActionError(msg);
    } finally {
      setPublishing(false);
    }
  };

  if (!courseId) {
    return (
      <ErrorState
        title="Invalid Course"
        message="No course ID specified."
        onRetry={() => navigate('/studio/courses')}
      />
    );
  }

  if (loading) {
    return <LoadingState message="Loading course draft and blocks…" />;
  }

  if (error || !draft) {
    return (
      <ErrorState
        title="Could not load course draft"
        message={error ?? 'Draft not found.'}
        onRetry={loadData}
      />
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <Button variant="ghost" onClick={() => navigate('/studio/courses')} style={{ marginBottom: '0.5rem' }}>
          ← Back to Studio Courses
        </Button>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--ui-text)', margin: '0 0 0.25rem' }}>
              Course Draft Editor: {draft.title}
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
              Mutable Draft Revision: <strong>#{draft.revision}</strong> | Last updated: {new Date(draft.updatedAt).toLocaleString()}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button variant="secondary" disabled={validating} onClick={handleValidate}>
              {validating ? 'Validating…' : 'Validate Draft'}
            </Button>
            <Button variant="primary" disabled={publishing} onClick={handlePublish}>
              {publishing ? 'Publishing…' : 'Publish Version 🚀'}
            </Button>
          </div>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: '0.75rem', backgroundColor: 'var(--ui-surface)', border: '1px solid var(--ui-danger)', color: 'var(--ui-danger)', borderRadius: 'var(--ui-radius-sm)', fontSize: '0.85rem' }}>
          ⚠️ {actionError}
        </div>
      )}

      {actionSuccess && (
        <div style={{ padding: '0.75rem', backgroundColor: 'var(--ui-surface)', border: '1px solid var(--ui-success)', color: 'var(--ui-success)', borderRadius: 'var(--ui-radius-sm)', fontSize: '0.85rem' }}>
          ✓ {actionSuccess}
        </div>
      )}

      {/* Validation Results Banner */}
      {validationResult && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>
              Draft Validation Status
            </h3>
            <Badge variant={validationResult.valid ? 'success' : 'danger'}>
              {validationResult.valid ? 'Valid for Publishing' : 'Errors Found'}
            </Badge>
          </div>
          <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0 0 0.5rem' }}>
            Total Blocks: {validationResult.totalBlocks} | Invalid Blocks: {validationResult.invalidBlocksCount}
          </p>
          {validationResult.blocks.some((b) => !b.valid) && (
            <ul style={{ fontSize: '0.8rem', color: 'var(--ui-danger)', margin: 0, paddingLeft: '1.25rem' }}>
              {validationResult.blocks
                .filter((b) => !b.valid)
                .map((b) => (
                  <li key={b.blockId}>
                    <strong>{b.title}</strong>: {b.errors.join(', ')}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      )}

      {/* Draft Metadata Form */}
      <Card>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.75rem' }}>
          Draft Metadata
        </h3>
        <form onSubmit={handleSaveMeta} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
            Course Title:
            <input
              type="text"
              required
              value={draftTitle}
              onChange={(e) => setDraftTitle(e.target.value)}
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
            Description:
            <textarea
              rows={2}
              value={draftDesc}
              onChange={(e) => setDraftDesc(e.target.value)}
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

          <div>
            <Button type="submit" variant="secondary" disabled={savingMeta}>
              {savingMeta ? 'Saving…' : 'Save Metadata'}
            </Button>
          </div>
        </form>
      </Card>

      {/* Activity Blocks */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.2rem' }}>
              Activity Blocks ({blocks.length})
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)', margin: 0 }}>
              Learners progress through blocks in sequential order index.
            </p>
          </div>
          <Button variant="primary" onClick={() => setShowAddBlock(!showAddBlock)}>
            {showAddBlock ? 'Cancel' : '+ Add Activity Block'}
          </Button>
        </div>

        {/* Add Block Form Drawer */}
        {showAddBlock && (
          <Card style={{ marginBottom: '1rem', border: '1px solid var(--ui-primary)' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.75rem' }}>
              Add Activity Block
            </h3>
            <form onSubmit={handleAddBlock} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                <label style={{ flex: 1, minWidth: 200, fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                  Block Title:
                  <input
                    type="text"
                    required
                    placeholder="e.g. Architecture Overview Video"
                    value={newBlockTitle}
                    onChange={(e) => setNewBlockTitle(e.target.value)}
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
                  Block Type:
                  <select
                    value={newBlockType}
                    onChange={(e) => setNewBlockType(e.target.value)}
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
                    <option value="video">📺 Video (Completion only)</option>
                    <option value="multiple-choice">❓ Multiple Choice (Graded)</option>
                    <option value="cloze">✍️ Cloze / Fill-in-Blank (Graded)</option>
                  </select>
                </label>
              </div>

              {newBlockType === 'video' && (
                <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                  Video URL:
                  <input
                    type="url"
                    required
                    value={newBlockUrl}
                    onChange={(e) => setNewBlockUrl(e.target.value)}
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
              )}

              <div>
                <Button type="submit" variant="primary" disabled={addingBlock || !newBlockTitle.trim()}>
                  {addingBlock ? 'Adding…' : 'Add Block'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Block List */}
        {blocks.length === 0 && (
          <Card>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
              No activity blocks in this course draft yet. Click "+ Add Activity Block" to add your first learning activity.
            </p>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {blocks.map((block, idx) => (
            <Card key={block.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <Badge variant="neutral">#{idx + 1}</Badge>
                <div>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.15rem' }}>
                    {block.title}
                  </h4>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)' }}>
                    Type: <code>{block.blockTypeId}</code> (v{block.typeVersion})
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Button
                  variant="ghost"
                  disabled={idx === 0}
                  onClick={() => handleMoveBlock(idx, 'UP')}
                  aria-label={`Move ${block.title} up`}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  disabled={idx === blocks.length - 1}
                  onClick={() => handleMoveBlock(idx, 'DOWN')}
                  aria-label={`Move ${block.title} down`}
                >
                  ↓
                </Button>
                <Button
                  variant="danger"
                  onClick={() => handleDeleteBlock(block.id)}
                  aria-label={`Delete ${block.title}`}
                >
                  ✕
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Published Versions */}
      {versions.length > 0 && (
        <Card>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.5rem' }}>
            Published Version Snapshots ({versions.length})
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)', margin: '0 0 0.75rem' }}>
            Published versions are immutable. Grants and learner progress are bound to these snapshots.
          </p>
          <ul style={{ fontSize: '0.85rem', color: 'var(--ui-text)', margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
            {versions.map((ver) => (
              <li key={ver.id}>
                <strong>Version {ver.versionNumber}</strong> — Published on {new Date(ver.createdAt).toLocaleString()} (Snapshot ID: <code>{ver.id.slice(0, 8)}…</code>)
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
