import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CourseProgressDto, LearnerCourseVersionDto } from '@ule/contracts';
import { fetchCourseProgress, fetchGrantedCourses } from '../../services/learner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

export default function CoursesPage() {
  const [courses, setCourses] = useState<LearnerCourseVersionDto[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, CourseProgressDto>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadCourses = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await fetchGrantedCourses();
      setCourses(list);

      const progressEntries = await Promise.all(
        list.map(async (c) => {
          try {
            const p = await fetchCourseProgress(c.id);
            return [c.id, p] as const;
          } catch {
            return null;
          }
        }),
      );

      const map: Record<string, CourseProgressDto> = {};
      progressEntries.forEach((entry) => {
        if (entry) map[entry[0]] = entry[1];
      });
      setProgressMap(map);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load courses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCourses();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
          My Granted Courses
        </h1>
        <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.95rem', margin: '0.25rem 0 0' }}>
          Immutable course versions you have been explicitly authorized to access.
        </p>
      </div>

      {loading && <LoadingState message="Loading your courses…" />}

      {!loading && error && (
        <ErrorState title="Could not load courses" message={error} onRetry={loadCourses} />
      )}

      {!loading && !error && courses.length === 0 && (
        <EmptyState
          icon="📚"
          title="No granted courses"
          description="Courses are private by default. You will see courses here once an educator or course owner grants you access."
        />
      )}

      {!loading && !error && courses.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {courses.map((c) => {
            const prog = progressMap[c.id];
            return (
              <Card key={c.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
                      {c.title}
                    </h2>
                    <Badge variant="neutral">v{c.versionNumber}</Badge>
                  </div>

                  {c.description && (
                    <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0 0 1rem' }}>
                      {c.description}
                    </p>
                  )}

                  {prog && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem', color: 'var(--ui-text-muted)' }}>
                        <span>Progress</span>
                        <span>{prog.percentComplete}% ({prog.completedBlocks}/{prog.totalBlocks})</span>
                      </div>
                      <div style={{ width: '100%', height: '6px', background: 'var(--ui-surface-muted)', borderRadius: '9999px', overflow: 'hidden' }}>
                        <div style={{ width: `${prog.percentComplete}%`, height: '100%', background: 'var(--ui-primary)' }} />
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--ui-border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                    {c.blocks?.length ?? 0} activities
                  </span>
                  <Link to={`/app/courses/${c.id}`}>
                    <Button variant="primary" size="sm">
                      Enter Course →
                    </Button>
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
