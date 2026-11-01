import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CourseDraftDto, CourseDto } from '@ule/contracts';
import { createCourse, fetchCourseDraft, fetchCreatorCourses } from '../../services/creator';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

interface CourseWithDraft extends CourseDto {
  draft?: CourseDraftDto | null;
}

export default function StudioPage() {
  const [courses, setCourses] = useState<CourseWithDraft[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  // Create course modal / form
  const [showCreate, setShowCreate] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [creating, setCreating] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadCourses = async () => {
    setLoading(true);
    setError(null);
    try {
      const baseCourses = await fetchCreatorCourses();
      const withDrafts: CourseWithDraft[] = await Promise.all(
        baseCourses.map(async (c) => {
          const draft = await fetchCourseDraft(c.id).catch(() => null);
          return { ...c, draft };
        }),
      );
      setCourses(withDrafts);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load creator courses.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setActionError(null);
    setCreating(true);
    try {
      const res = await createCourse({
        title: title.trim(),
        description: description.trim() || undefined,
      });
      setShowCreate(false);
      setTitle('');
      setDescription('');
      navigate(`/studio/courses/${res.course.id}/edit`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create course.';
      setActionError(msg);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--ui-text)', margin: '0 0 0.25rem' }}>
            Creator Studio
          </h1>
          <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.9rem', margin: 0 }}>
            Author course drafts, configure activity blocks, and publish immutable version snapshots.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <Button variant="secondary" onClick={() => navigate('/studio/question-bank')}>
            Question Bank ❓
          </Button>
          <Button variant="primary" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? 'Cancel' : '+ New Course'}
          </Button>
        </div>
      </div>

      {actionError && (
        <div style={{ padding: '0.75rem', backgroundColor: 'var(--ui-surface)', border: '1px solid var(--ui-danger)', color: 'var(--ui-danger)', borderRadius: 'var(--ui-radius-sm)', fontSize: '0.85rem', marginBottom: '1rem' }}>
          ⚠️ {actionError}
        </div>
      )}

      {/* Create Course Drawer */}
      {showCreate && (
        <Card style={{ marginBottom: '1.5rem', border: '1px solid var(--ui-primary)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--ui-text)', margin: '0 0 0.75rem' }}>
            Create New Course
          </h3>
          <form onSubmit={handleCreateCourse} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-text)' }}>
              Course Title:
              <input
                type="text"
                required
                placeholder="e.g. Distributed Systems Masterclass"
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
              Description:
              <textarea
                rows={2}
                placeholder="Brief summary of what learners will study..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
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
              <Button type="submit" variant="primary" disabled={creating || !title.trim()}>
                {creating ? 'Creating…' : 'Create Course & Open Editor'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {loading && <LoadingState message="Loading creator courses…" />}
      {!loading && error && (
        <ErrorState
          title="Could not load creator courses"
          message={error}
          onRetry={loadCourses}
        />
      )}
      {!loading && !error && courses !== null && courses.length === 0 && (
        <EmptyState
          icon="🗂️"
          title="No courses created yet"
          description="Create your first course to begin authoring activity blocks and publishing snapshots."
        />
      )}
      {!loading && !error && courses && courses.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {courses.map((course) => (
            <Card key={course.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--ui-text)', margin: 0 }}>
                  {course.draft?.title || `Course ${course.id.slice(0, 8)}`}
                </h3>
                <Badge variant={course.visibility === 'PUBLIC' ? 'success' : 'neutral'}>
                  {course.visibility}
                </Badge>
              </div>

              {course.draft?.description && (
                <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0 0 1rem', lineHeight: 1.5, flex: 1 }}>
                  {course.draft.description}
                </p>
              )}

              <div style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', marginBottom: '1rem' }}>
                Draft Rev: #{course.draft?.revision ?? 1} | Created: {new Date(course.createdAt).toLocaleDateString()}
              </div>

              <div style={{ marginTop: 'auto' }}>
                <Button
                  variant="primary"
                  onClick={() => navigate(`/studio/courses/${course.id}/edit`)}
                >
                  Edit Course Draft →
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
