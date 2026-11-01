import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CourseProgressDto,
  LearnerCourseVersionDto,
  LearnerSkillProjectionDto,
} from '@ule/contracts';
import {
  fetchCourseProgress,
  fetchGrantedCourses,
  fetchSkillProjections,
} from '../../services/learner';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/states/EmptyState';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';

interface CourseWithProgress {
  course: LearnerCourseVersionDto;
  progress: CourseProgressDto | null;
  skills: LearnerSkillProjectionDto[];
}

export default function LearnerDashboard() {
  const [courseData, setCourseData] = useState<CourseWithProgress[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDashboard = async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await fetchGrantedCourses();

      const combined = await Promise.all(
        list.map(async (course) => {
          const [progress, skills] = await Promise.all([
            fetchCourseProgress(course.id).catch(() => null),
            fetchSkillProjections(course.id).catch(() => []),
          ]);
          return { course, progress, skills };
        }),
      );

      setCourseData(combined);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load learner dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  const continueCandidate =
    courseData.find(
      (item) => item.progress && item.progress.percentComplete < 100,
    ) || (courseData.length > 0 ? courseData[0] : null);

  const allSkills = courseData.flatMap((item) => item.skills);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '1.6rem', fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
          Learner Workspace
        </h1>
        <p style={{ color: 'var(--ui-text-muted)', fontSize: '0.95rem', margin: '0.25rem 0 0' }}>
          Your authorized courses, verifiable evidence, and learning progression.
        </p>
      </div>

      {loading && <LoadingState message="Loading your courses and progress…" />}

      {!loading && error && (
        <ErrorState
          title="Could not load learning workspace"
          message={error}
          onRetry={loadDashboard}
        />
      )}

      {!loading && !error && courseData.length === 0 && (
        <EmptyState
          icon="📚"
          title="No courses granted yet"
          description="You do not have access to any course versions at this time. ULE courses remain private until an owner grants explicit access."
        />
      )}

      {!loading && !error && courseData.length > 0 && (
        <>
          {continueCandidate && (
            <Card
              style={{
                background: 'var(--ui-surface)',
                border: '1px solid var(--ui-primary)',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ maxWidth: '600px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '1.2rem' }}>⚡</span>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--ui-primary)', letterSpacing: '0.05em' }}>
                      Continue Learning
                    </span>
                    <Badge variant="info">v{continueCandidate.course.versionNumber}</Badge>
                  </div>
                  <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: '0 0 0.5rem', color: 'var(--ui-text)' }}>
                    {continueCandidate.course.title}
                  </h2>
                  {continueCandidate.course.description && (
                    <p style={{ fontSize: '0.9rem', color: 'var(--ui-text-muted)', margin: '0 0 1rem' }}>
                      {continueCandidate.course.description}
                    </p>
                  )}

                  {continueCandidate.progress && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem' }}>
                      <div
                        style={{
                          width: '160px',
                          height: '8px',
                          background: 'var(--ui-surface-muted)',
                          borderRadius: '9999px',
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: `${continueCandidate.progress.percentComplete}%`,
                            height: '100%',
                            background: 'var(--ui-primary)',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.82rem', color: 'var(--ui-text-muted)' }}>
                        {continueCandidate.progress.percentComplete}% (
                        {continueCandidate.progress.completedBlocks}/
                        {continueCandidate.progress.totalBlocks} completed)
                      </span>
                    </div>
                  )}
                </div>

                <div>
                  <Link to={`/app/courses/${continueCandidate.course.id}`}>
                    <Button variant="primary">Resume Learning →</Button>
                  </Link>
                </div>
              </div>
            </Card>
          )}

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
                My Granted Courses ({courseData.length})
              </h2>
              <Link to="/app/courses" style={{ fontSize: '0.85rem', color: 'var(--ui-primary)', textDecoration: 'none', fontWeight: 500 }}>
                View all courses →
              </Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.25rem' }}>
              {courseData.map(({ course, progress, skills }) => (
                <Card key={course.id} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)', lineHeight: 1.3 }}>
                        {course.title}
                      </h3>
                      <Badge variant="neutral">v{course.versionNumber}</Badge>
                    </div>

                    {course.description && (
                      <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0 0 1rem', lineHeight: 1.45 }}>
                        {course.description}
                      </p>
                    )}

                    {progress && (
                      <div style={{ marginBottom: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '0.25rem', color: 'var(--ui-text-muted)' }}>
                          <span>Curriculum Progress</span>
                          <span>{progress.percentComplete}%</span>
                        </div>
                        <div style={{ width: '100%', height: '6px', background: 'var(--ui-surface-muted)', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div style={{ width: `${progress.percentComplete}%`, height: '100%', background: 'var(--ui-primary)' }} />
                        </div>
                      </div>
                    )}

                    {skills.length > 0 && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', marginBottom: '1rem' }}>
                        Skills: {skills.map((s) => s.skillName).join(', ')}
                      </div>
                    )}
                  </div>

                  <div style={{ borderTop: '1px solid var(--ui-border)', paddingTop: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--ui-text-muted)' }}>
                      {course.blocks?.length ?? 0} activities
                    </span>
                    <Link to={`/app/courses/${course.id}`}>
                      <Button variant="secondary" size="sm">
                        Open Course →
                      </Button>
                    </Link>
                  </div>
                </Card>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
                Skill Development
              </h2>
              <Link to="/app/skills" style={{ fontSize: '0.85rem', color: 'var(--ui-primary)', textDecoration: 'none', fontWeight: 500 }}>
                Explore skill details →
              </Link>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: '0 0 1rem' }}>
              Transparent, evidence-based skill states. Invariant: <code>READY_TO_VERIFY</code> is never premature <code>VERIFIED</code> mastery.
            </p>

            {allSkills.length > 0 ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                {allSkills.map((skill) => (
                  <Card key={skill.skillId}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                      <h3 style={{ fontSize: '0.95rem', fontWeight: 600, margin: 0, color: 'var(--ui-text)' }}>
                        {skill.skillName}
                      </h3>
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

                    <p style={{ fontSize: '0.78rem', color: 'var(--ui-text-muted)', margin: 0 }}>
                      Evidence count: {skill.evidenceCount} ({skill.independentCount} independent, {skill.assistedCount} assisted)
                    </p>
                  </Card>
                ))}
              </div>
            ) : (
              <Card>
                <p style={{ fontSize: '0.85rem', color: 'var(--ui-text-muted)', margin: 0 }}>
                  Complete evaluated activities to begin generating skill evidence.
                </p>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
