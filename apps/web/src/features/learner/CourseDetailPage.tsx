import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ABRunDto,
  CourseEnrollmentDto,
  CourseProgressDto,
  CourseQuestInstanceDto,
  LearnerCourseVersionDto,
  LearnerSkillProjectionDto,
  LearningEvidenceDto,
} from '@ule/contracts';
import { startRun } from '../../services/abp';
import {
  enrollInCourse,
  fetchCourseEnrollment,
  fetchCourseProgress,
  fetchCourseQuests,
  fetchEvidenceSummary,
  fetchGrantedCourses,
  fetchSkillProjections,
} from '../../services/learner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { LearningPlayer } from './LearningPlayer';

export default function CourseDetailPage() {
  const { courseVersionId } = useParams<{ courseVersionId: string }>();
  return <CourseDetail key={courseVersionId} courseVersionId={courseVersionId} />;
}

function CourseDetail({ courseVersionId }: { courseVersionId: string | undefined }) {
  const [course, setCourse] = useState<LearnerCourseVersionDto | null>(null);
  const [progress, setProgress] = useState<CourseProgressDto | null>(null);
  const [evidence, setEvidence] = useState<LearningEvidenceDto[]>([]);
  const [skills, setSkills] = useState<LearnerSkillProjectionDto[]>([]);
  const [quests, setQuests] = useState<CourseQuestInstanceDto[]>([]);
  const [enrollment, setEnrollment] = useState<CourseEnrollmentDto | null>(null);

  const [activeRun, setActiveRun] = useState<ABRunDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!courseVersionId) return;
    try {
      setLoading(true);
      setError(null);

      const allCourses = await fetchGrantedCourses();
      const current = allCourses.find((c) => c.id === courseVersionId) ?? null;

      if (!current) {
        throw new Error('Course not found or access grant has been revoked.');
      }

      const [prog, evList, skList, enr] = await Promise.all([
        fetchCourseProgress(courseVersionId),
        fetchEvidenceSummary(courseVersionId),
        fetchSkillProjections(courseVersionId),
        fetchCourseEnrollment(courseVersionId),
      ]);
      const qList = enr ? await fetchCourseQuests(courseVersionId).catch(() => []) : [];

      setCourse(current);
      setProgress(prog);
      setEvidence(evList);
      setSkills(skList);
      setEnrollment(enr);
      setQuests(qList);
    } catch (err) {
      setCourse(null);
      setError(err instanceof Error ? err.message : 'Failed to load course details.');
    } finally {
      setLoading(false);
    }
  }, [courseVersionId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleStartActivity = async (blockInstanceId: string) => {
    if (!courseVersionId) return;
    try {
      setLoading(true);
      setError(null);
      const idempotencyKey = `start_run_${blockInstanceId}_${Date.now()}`;
      const run = await startRun({
        courseVersionId,
        blockInstanceId,
        idempotencyKey,
      });
      setActiveRun(run);
      const prog = await fetchCourseProgress(courseVersionId);
      setProgress(prog);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start activity.');
    } finally {
      setLoading(false);
    }
  };

  const handleEnroll = async () => {
    if (!courseVersionId) return;
    try {
      setLoading(true);
      setError(null);
      const res = await enrollInCourse(courseVersionId);
      setEnrollment(res.enrollment);
      setQuests(res.quests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enroll in quests.');
    } finally {
      setLoading(false);
    }
  };

  const handleRunUpdated = async (updated: ABRunDto) => {
    setActiveRun((current) => (current?.id === updated.id ? updated : current));
    if (!courseVersionId) return;
    setError(null);
    try {
      const [prog, evList, skList] = await Promise.all([
        fetchCourseProgress(courseVersionId),
        fetchEvidenceSummary(courseVersionId),
        fetchSkillProjections(courseVersionId),
      ]);
      setProgress(prog);
      setEvidence(evList);
      setSkills(skList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh course details.');
    }
  };

  if (loading && !course) {
    return <LoadingState message="Loading course curriculum and progress…" />;
  }

  if (error && !course) {
    return (
      <div>
        <Link to="/app/courses" style={{ color: 'var(--ui-primary)', fontSize: '0.875rem' }}>
          ← Back to Courses
        </Link>
        <div style={{ marginTop: '1rem' }}>
          <ErrorState title="Course Unavailable" message={error} onRetry={loadAll} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <Link
          to="/app/courses"
          style={{
            color: 'var(--ui-primary)',
            fontSize: '0.875rem',
            textDecoration: 'none',
            fontWeight: 500,
          }}
        >
          ← Back to My Courses
        </Link>
      </div>

      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
            {course?.title ?? 'Course Details'}
          </h1>
          <Badge variant="info">v{course?.versionNumber}</Badge>
        </div>
        {course?.description && (
          <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.95rem', margin: '0.5rem 0 0' }}>
            {course.description}
          </p>
        )}
      </div>

      {error && <ErrorState message={error} />}

      {activeRun && (
        <LearningPlayer
          key={activeRun.id}
          run={activeRun}
          onRunUpdated={handleRunUpdated}
          onClose={() => setActiveRun(null)}
        />
      )}

      {progress && (
        <Card>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
              Course Progress
            </h2>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ui-primary)' }}>
              {progress.percentComplete}% ({progress.completedBlocks}/{progress.totalBlocks} completed)
            </span>
          </div>

          <div
            style={{
              width: '100%',
              height: '8px',
              background: 'var(--ui-surface-muted)',
              borderRadius: '9999px',
              overflow: 'hidden',
              marginBottom: '1rem',
            }}
          >
            <div
              style={{
                width: `${progress.percentComplete}%`,
                height: '100%',
                background: 'var(--ui-primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>

          <div
            style={{
              padding: '0.65rem 0.85rem',
              background: 'var(--ui-warning-bg)',
              border: '1px solid var(--ui-warning)',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.8rem',
              color: 'var(--ui-warning)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <span>⚖️</span>
            <span>
              <strong>Learning Science Boundary:</strong> Activity completion reflects practice participation,{' '}
              <strong>never verified skill mastery</strong>. Verified mastery requires proctored evaluation.
            </span>
          </div>
        </Card>
      )}

      <div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '1rem', color: 'var(--ui-text)' }}>
          Curriculum Activities
        </h2>

        {progress?.blocks && progress.blocks.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {progress.blocks.map((block) => {
              const isSelected = activeRun?.blockInstanceId === block.blockInstanceId;
              return (
                <Card
                  key={block.blockInstanceId}
                  style={{
                    borderColor: isSelected ? 'var(--ui-primary)' : 'var(--ui-border)',
                    background: isSelected ? 'var(--ui-surface-muted)' : 'var(--ui-surface)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
                      {block.title}
                    </h3>
                    <Badge
                      variant={
                        block.status === 'COMPLETED'
                          ? 'success'
                          : block.status === 'IN_PROGRESS'
                            ? 'primary'
                            : 'neutral'
                      }
                    >
                      {block.status === 'COMPLETED'
                        ? '✓ Completed'
                        : block.status === 'IN_PROGRESS'
                          ? 'In Progress'
                          : 'Not Started'}
                    </Badge>
                  </div>

                  <p style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)', margin: '0 0 1rem' }}>
                    Type: <code>{block.blockTypeId}</code> | Attempts: {block.attemptsCount}
                  </p>

                  <Button
                    variant={isSelected ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => handleStartActivity(block.blockInstanceId)}
                    isLoading={loading && isSelected}
                  >
                    {isSelected ? 'Currently Active' : block.status === 'COMPLETED' ? 'Review / Retry' : 'Start Activity'}
                  </Button>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No activities" description="No activities have been published in this course version." />
        )}
      </div>

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
              Course Quests &amp; Journey
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0.25rem 0 0' }}>
              Practice milestones and participation rewards (Course XP isolated).
            </p>
          </div>

          {!enrollment && (
            <Button variant="secondary" size="sm" onClick={handleEnroll} isLoading={loading}>
              Enroll in Quests
            </Button>
          )}
        </div>

        {quests.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
            {quests.map((q) => (
              <Card key={q.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
                    {q.title}
                  </h3>
                  <Badge variant={q.status === 'COMPLETED' ? 'success' : 'primary'}>
                    {q.status}
                  </Badge>
                </div>
                {q.description && (
                  <p style={{ fontSize: '0.82rem', color: 'var(--ui-text-muted)', margin: '0 0 0.5rem' }}>
                    {q.description}
                  </p>
                )}
                <div style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)' }}>
                  Objectives: {q.objectives?.length ?? 0}
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
              {enrollment
                ? 'No active quests configured for this CourseVersion.'
                : 'Click "Enroll in Quests" to begin tracking practice quests.'}
            </p>
          </Card>
        )}
      </div>

      <div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--ui-text)' }}>
          Skill Development Projections
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', marginBottom: '1rem' }}>
          Conservative read model derived from verified server evidence. Claims state clearly: no premature mastery.
        </p>

        {skills.length > 0 ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
            {skills.map((s) => (
              <Card key={s.skillId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
                    {s.skillName}
                  </h3>
                  <Badge
                    variant={
                      s.state === 'READY_TO_VERIFY'
                        ? 'success'
                        : s.state === 'DEVELOPING'
                          ? 'primary'
                          : 'neutral'
                    }
                  >
                    {s.state}
                  </Badge>
                </div>

                {s.learningObjective && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0 0 0.75rem' }}>
                    {s.learningObjective}
                  </p>
                )}

                <div
                  style={{
                    fontSize: '0.78rem',
                    color: 'var(--ui-text-muted)',
                    background: 'var(--ui-surface-muted)',
                    padding: '0.5rem',
                    borderRadius: 'var(--radius-sm)',
                    marginBottom: '0.75rem',
                  }}
                >
                  Evidence: {s.evidenceCount} total | Independent: {s.independentCount} | Assisted: {s.assistedCount} | Repeats: {s.repeatedCount}
                </div>

                {s.reasons && s.reasons.length > 0 && (
                  <div style={{ marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-text)' }}>
                      Transparent Rationale:
                    </span>
                    <ul style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', margin: '0.25rem 0 0 1rem' }}>
                      {s.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {s.limitations && s.limitations.length > 0 && (
                  <div>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--ui-warning)' }}>
                      Missing Evidence / Limitations:
                    </span>
                    <ul style={{ fontSize: '0.78rem', color: 'var(--ui-warning)', margin: '0.25rem 0 0 1rem' }}>
                      {s.limitations.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {s.proposedAction && (
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
                    <strong>LII Proposal:</strong> <Badge variant="info">{s.proposedAction.category}</Badge>
                    <p style={{ margin: '0.25rem 0 0', color: 'var(--ui-text-muted)' }}>
                      {s.proposedAction.reason}
                    </p>
                    {!s.proposedAction.isAvailable && (
                      <span style={{ color: 'var(--ui-danger)', fontSize: '0.72rem', display: 'block', marginTop: '0.25rem' }}>
                        [Verification capability not yet active in this version]
                      </span>
                    )}
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState title="No skills mapped" description="No skills are mapped to activities in this course version." />
        )}
      </div>

      <div>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 600, marginBottom: '0.5rem', color: 'var(--ui-text)' }}>
          Trusted Evidence Ledger
        </h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', marginBottom: '1rem' }}>
          Idempotent runtime evaluation records with traceable assistance provenance.
        </p>

        {evidence.length > 0 ? (
          <div style={{ overflowX: 'auto' }}>
            <table
              style={{
                width: '100%',
                fontSize: '0.82rem',
                borderCollapse: 'collapse',
                background: 'var(--ui-surface)',
                border: '1px solid var(--ui-border)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <thead>
                <tr style={{ background: 'var(--ui-surface-muted)', textAlign: 'left', borderBottom: '1px solid var(--ui-border)' }}>
                  <th style={{ padding: '8px 12px' }}>Classification</th>
                  <th style={{ padding: '8px 12px' }}>Status</th>
                  <th style={{ padding: '8px 12px' }}>Skill</th>
                  <th style={{ padding: '8px 12px' }}>Outcome</th>
                  <th style={{ padding: '8px 12px' }}>Provenance</th>
                  <th style={{ padding: '8px 12px' }}>Observation</th>
                  <th style={{ padding: '8px 12px' }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {evidence.map((ev) => (
                  <tr key={ev.id} style={{ borderBottom: '1px solid var(--ui-border)' }}>
                    <td style={{ padding: '8px 12px' }}>
                      <Badge
                        variant={
                          ev.classification === 'INDEPENDENT_CORRECT'
                            ? 'success'
                            : ev.classification === 'ASSISTED_CORRECT'
                              ? 'warning'
                              : ev.classification === 'UNGRADED_PARTICIPATION'
                                ? 'info'
                                : 'neutral'
                        }
                      >
                        {ev.classification}
                      </Badge>
                    </td>
                    <td style={{ padding: '8px 12px' }}>{ev.status}</td>
                    <td style={{ padding: '8px 12px' }}>{ev.skillCode || 'Unmapped'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {ev.deferred ? (
                        <Badge variant="warning">Deferred</Badge>
                      ) : ev.isCorrect === true ? (
                        'Correct'
                      ) : ev.isCorrect === false ? (
                        'Incorrect'
                      ) : (
                        'Ungraded'
                      )}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {ev.supportProvenance || (ev.assisted ? 'Assisted' : 'Independent')}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      {ev.isSameItemRepetition ? `Repeat (#${ev.repetitionCount})` : 'Novel (1st)'}
                    </td>
                    <td style={{ padding: '8px 12px', color: 'var(--ui-text-muted)' }}>
                      {ev.exclusionReason || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Card>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0, fontStyle: 'italic' }}>
              No evidence records ingested yet. Complete an activity to generate traceable evidence.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
