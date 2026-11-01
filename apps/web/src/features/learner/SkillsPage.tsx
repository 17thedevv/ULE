import React, { useEffect, useState } from 'react';
import { LearnerSkillProjectionDto } from '@ule/contracts';
import { fetchGrantedCourses, fetchSkillProjections } from '../../services/learner';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

interface SkillWithCourse {
  courseTitle: string;
  courseVersionId: string;
  skill: LearnerSkillProjectionDto;
}

export default function SkillsPage() {
  const [skills, setSkills] = useState<SkillWithCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSkills = async () => {
    try {
      setLoading(true);
      setError(null);
      const courses = await fetchGrantedCourses();

      const skillsNested = await Promise.all(
        courses.map(async (c) => {
          try {
            const list = await fetchSkillProjections(c.id);
            return list.map((skill) => ({
              courseTitle: c.title,
              courseVersionId: c.id,
              skill,
            }));
          } catch {
            return [];
          }
        }),
      );

      setSkills(skillsNested.flat());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load skills.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSkills();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
          Skill Development
        </h1>
        <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.95rem', margin: '0.25rem 0 0' }}>
          Course-scoped skill proficiency projections derived deterministically from the evidence ledger.
        </p>
      </div>

      <div
        style={{
          padding: '0.75rem 1rem',
          background: 'var(--ui-warning-bg)',
          border: '1px solid var(--ui-warning)',
          borderRadius: 'var(--radius-sm)',
          fontSize: '0.85rem',
          color: 'var(--ui-warning)',
        }}
      >
        <strong>Absolute Pedagogical Invariant:</strong> In accordance with ULE learning science architecture,{' '}
        <code>READY_TO_VERIFY</code> indicates sufficient independent observations for proctored testing,{' '}
        <strong>never verified mastery</strong>. Full mastery requires verified exam performance.
      </div>

      {loading && <LoadingState message="Aggregating skill projections across courses…" />}

      {!loading && error && (
        <ErrorState title="Could not load skills" message={error} onRetry={loadSkills} />
      )}

      {!loading && !error && skills.length === 0 && (
        <EmptyState
          icon="⚡"
          title="No skills active yet"
          description="Complete evaluated practice activities within your courses to start building skill evidence."
        />
      )}

      {!loading && !error && skills.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
          {skills.map(({ courseTitle, skill }) => (
            <Card key={`${skill.skillId}-${skill.skillCode}`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
                    {skill.skillName}
                  </h2>
                  <span style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)' }}>
                    Course: {courseTitle}
                  </span>
                </div>
                <Badge
                  variant={
                    skill.state === 'READY_TO_VERIFY'
                      ? 'success'
                      : skill.state === 'DEVELOPING'
                        ? 'primary'
                        : 'neutral'
                  }
                >
                  {skill.state}
                </Badge>
              </div>

              {skill.learningObjective && (
                <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0.5rem 0' }}>
                  {skill.learningObjective}
                </p>
              )}

              <div
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--ui-text-muted)',
                  background: 'var(--ui-surface-muted)',
                  padding: '0.5rem',
                  borderRadius: 'var(--radius-sm)',
                  margin: '0.75rem 0',
                }}
              >
                Total Evidence: <strong>{skill.evidenceCount}</strong> | Independent: <strong>{skill.independentCount}</strong> | Assisted:{' '}
                <strong>{skill.assistedCount}</strong> | Repeats: <strong>{skill.repeatedCount}</strong>
              </div>

              {skill.reasons?.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                    Educational Reasoning:
                  </span>
                  <ul style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', margin: '0.25rem 0 0 1rem' }}>
                    {skill.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {skill.limitations?.length > 0 && (
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-warning)' }}>
                    Limitations &amp; Missing Evidence:
                  </span>
                  <ul style={{ fontSize: '0.78rem', color: 'var(--ui-warning)', margin: '0.25rem 0 0 1rem' }}>
                    {skill.limitations.map((l, i) => (
                      <li key={i}>{l}</li>
                    ))}
                  </ul>
                </div>
              )}

              {skill.proposedAction && (
                <div
                  style={{
                    marginTop: '0.75rem',
                    padding: '0.5rem',
                    background: 'var(--ui-surface-muted)',
                    border: '1px dashed var(--ui-border)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.78rem',
                  }}
                >
                  <strong>Recommended Next Step:</strong> <Badge variant="info">{skill.proposedAction.category}</Badge>
                  <p style={{ margin: '0.25rem 0 0', color: 'var(--ui-text-muted)' }}>
                    {skill.proposedAction.reason}
                  </p>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
