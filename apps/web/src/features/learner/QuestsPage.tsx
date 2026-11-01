import React, { useEffect, useState } from 'react';
import { CourseQuestInstanceDto } from '@ule/contracts';
import { fetchCourseQuests, fetchGrantedCourses } from '../../services/learner';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

interface QuestWithCourse {
  courseTitle: string;
  quest: CourseQuestInstanceDto;
}

export default function QuestsPage() {
  const [quests, setQuests] = useState<QuestWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQuests = async () => {
    try {
      setLoading(true);
      setError(null);
      const courses = await fetchGrantedCourses();

      const questsNested = await Promise.all(
        courses.map(async (c) => {
          try {
            const list = await fetchCourseQuests(c.id);
            return list.map((quest) => ({
              courseTitle: c.title,
              quest,
            }));
          } catch {
            return [];
          }
        }),
      );

      setQuests(questsNested.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuests();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
          Active Quests
        </h1>
        <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.95rem', margin: '0.25rem 0 0' }}>
          Practice milestones and curriculum journey objectives across your enrolled courses.
        </p>
      </div>

      <div
        style={{
          padding: '0.75rem 1rem',
          background: 'var(--ui-info-bg)',
          border: '1px solid var(--ui-info)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
          color: 'var(--ui-info)',
        }}
      >
        <strong>Dual Economy Invariant:</strong> Course XP is strictly scoped to parent courses.
        Quest completion acknowledges effort and practice, <strong>never verified skill mastery</strong>.
      </div>

      {loading && <LoadingState message="Loading your active quests…" />}

      {!loading && error && (
        <ErrorState title="Could not load quests" message={error} onRetry={loadQuests} />
      )}

      {!loading && !error && quests.length === 0 && (
        <EmptyState
          icon="🎯"
          title="No active quests"
          description="You are not enrolled in any quests yet. Open a granted course and click 'Enroll in Quests' to start tracking practice objectives."
        />
      )}

      {!loading && !error && quests.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {quests.map(({ courseTitle, quest }) => (
            <Card key={quest.id}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
                    {quest.title}
                  </h2>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)' }}>
                    Course: {courseTitle}
                  </span>
                </div>
                <Badge variant={quest.status === 'COMPLETED' ? 'success' : 'primary'}>
                  {quest.status}
                </Badge>
              </div>

              {quest.description && (
                <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0.5rem 0 0.75rem' }}>
                  {quest.description}
                </p>
              )}

              {quest.objectives && quest.objectives.length > 0 && (
                <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--ui-border)', paddingTop: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                    Objectives:
                  </span>
                  <ul style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', margin: '0.25rem 0 0 1rem' }}>
                    {quest.objectives.map((obj) => (
                      <li key={obj.id}>
                        {obj.objectiveKey || obj.id}:{' '}
                        <strong>
                          {obj.currentCount} / {obj.targetCount}
                        </strong>{' '}
                        {obj.isCompleted ? '✓' : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
