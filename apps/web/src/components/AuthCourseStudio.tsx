import React, { useEffect, useState } from 'react';
import {
  CourseDto,
  CourseDraftDto,
  CourseVersionDto,
} from '@ule/contracts';
import { authClient } from '../services/auth-client';
import {
  createCourse,
  createCourseVersion,
  getCourseDraft,
  listCourses,
  listCourseVersions,
  updateCourseDraft,
} from '../services/courses';

export const AuthCourseStudio: React.FC = () => {
  const { data: session, isPending: sessionLoading } = authClient.useSession();

  // Auth Form State
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  // Courses State
  const [courses, setCourses] = useState<CourseDto[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');

  // Selected Course / Draft / Versions State
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CourseDraftDto | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [versions, setVersions] = useState<CourseVersionDto[]>([]);
  const [studioMessage, setStudioMessage] = useState<string | null>(null);
  const [studioError, setStudioError] = useState<string | null>(null);

  // Load courses whenever session becomes active
  useEffect(() => {
    if (session?.user) {
      loadCourses();
    } else {
      setCourses([]);
      setSelectedCourseId(null);
      setDraft(null);
      setVersions([]);
    }
  }, [session?.user]);

  // Load draft and versions when a course is selected
  useEffect(() => {
    if (selectedCourseId) {
      loadDraftAndVersions(selectedCourseId);
    }
  }, [selectedCourseId]);

  async function loadCourses() {
    setCoursesLoading(true);
    setStudioError(null);
    try {
      const data = await listCourses();
      setCourses(data);
    } catch (err: unknown) {
      const error = err as Error;
      setStudioError(`Failed to load courses: ${error.message}`);
    } finally {
      setCoursesLoading(false);
    }
  }

  async function loadDraftAndVersions(courseId: string) {
    setStudioError(null);
    try {
      const [draftData, versionsData] = await Promise.all([
        getCourseDraft(courseId),
        listCourseVersions(courseId),
      ]);
      setDraft(draftData);
      setDraftTitle(draftData.title);
      setDraftDesc(draftData.description || '');
      setVersions(versionsData);
    } catch (err: unknown) {
      const error = err as Error;
      setStudioError(`Failed to load course details: ${error.message}`);
    }
  }

  async function handleAuthSubmit(e: React.FormEvent) {
    e.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);

    try {
      if (authMode === 'signup') {
        const res = await authClient.signUp.email({
          email,
          password,
          name: name || email.split('@')[0],
        });
        if (res.error) {
          setAuthError(res.error.message || 'Registration failed');
        }
      } else {
        const res = await authClient.signIn.email({
          email,
          password,
        });
        if (res.error) {
          setAuthError(res.error.message || 'Sign in failed');
        }
      }
    } catch (err: unknown) {
      const error = err as Error;
      setAuthError(error.message);
    } finally {
      setAuthSubmitting(false);
    }
  }

  async function handleSignOut() {
    await authClient.signOut();
  }

  async function handleCreateCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setStudioError(null);
    setStudioMessage(null);

    try {
      const res = await createCourse({
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
      });
      setNewTitle('');
      setNewDesc('');
      setStudioMessage(`Created course "${res.draft.title}" (Private).`);
      await loadCourses();
      setSelectedCourseId(res.course.id);
    } catch (err: unknown) {
      const error = err as Error;
      setStudioError(error.message);
    }
  }

  async function handleSaveDraft() {
    if (!selectedCourseId || !draft) return;
    setStudioError(null);
    setStudioMessage(null);

    try {
      const updated = await updateCourseDraft(selectedCourseId, {
        title: draftTitle,
        description: draftDesc,
        expectedRevision: draft.revision,
      });
      setDraft(updated);
      setStudioMessage(`Draft revision ${updated.revision} saved successfully.`);
      await loadCourses();
    } catch (err: unknown) {
      const error = err as Error;
      setStudioError(error.message);
    }
  }

  async function handleCreateVersion() {
    if (!selectedCourseId) return;
    setStudioError(null);
    setStudioMessage(null);

    try {
      const version = await createCourseVersion(selectedCourseId);
      setStudioMessage(
        `Immutable Version ${version.versionNumber} created from draft rev ${version.draftRevision}.`,
      );
      await loadDraftAndVersions(selectedCourseId);
    } catch (err: unknown) {
      const error = err as Error;
      setStudioError(error.message);
    }
  }

  if (sessionLoading) {
    return <div className="card"><p>Checking authentication state...</p></div>;
  }

  // Unauthenticated State: Sign in / Sign up
  if (!session?.user) {
    return (
      <section className="card">
        <h2>Phase 1A: Author Authentication</h2>
        <p className="description">
          Sign in or register to test owner-scoped courses and immutable versioning.
        </p>

        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <button
            type="button"
            className={authMode === 'signin' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setAuthMode('signin')}
          >
            Sign In
          </button>
          <button
            type="button"
            className={authMode === 'signup' ? 'btn-primary' : 'btn-secondary'}
            onClick={() => setAuthMode('signup')}
          >
            Register
          </button>
        </div>

        {authError && <div className="error-banner">{authError}</div>}

        <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {authMode === 'signup' && (
            <div>
              <label htmlFor="auth-name" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>
                Full Name
              </label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ada Lovelace"
                required
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>
              Email Address
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="author@ule.internal"
              required
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <div>
            <label htmlFor="auth-password" style={{ display: 'block', fontSize: '0.85rem', marginBottom: '4px' }}>
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>

          <button
            type="submit"
            className="btn-primary"
            disabled={authSubmitting}
            style={{ marginTop: '8px' }}
          >
            {authSubmitting ? 'Authenticating...' : authMode === 'signup' ? 'Register Account' : 'Sign In'}
          </button>
        </form>
      </section>
    );
  }

  // Authenticated State: Courses, Drafts, Versions
  return (
    <section className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h2>Course Authoring Studio</h2>
          <p style={{ margin: 0, fontSize: '0.9rem', color: '#666' }}>
            Signed in as <strong>{session.user.name}</strong> ({session.user.email})
          </p>
        </div>
        <button type="button" className="btn-secondary" onClick={handleSignOut}>
          Sign Out
        </button>
      </div>

      {studioError && <div className="error-banner">{studioError}</div>}
      {studioMessage && (
        <div style={{ background: '#e6fffa', border: '1px solid #38b2ac', color: '#234e52', padding: '8px 12px', borderRadius: '4px', marginBottom: '12px' }}>
          {studioMessage}
        </div>
      )}

      {/* Create Course Form */}
      <form onSubmit={handleCreateCourse} style={{ background: '#f7fafc', padding: '12px', borderRadius: '6px', marginBottom: '20px' }}>
        <h3 style={{ margin: '0 0 8px 0', fontSize: '1rem' }}>Create New Private Course</h3>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          <input
            type="text"
            placeholder="Course Title (e.g. Modern Physics)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ flex: 1, padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0' }}
            required
          />
          <button type="submit" className="btn-primary">
            Create Course
          </button>
        </div>
        <input
          type="text"
          placeholder="Optional high-level description"
          value={newDesc}
          onChange={(e) => setNewDesc(e.target.value)}
          style={{ width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid #cbd5e0', fontSize: '0.9rem' }}
        />
      </form>

      {/* Course List & Selection */}
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1rem', marginBottom: '8px' }}>Your Private Courses ({courses.length})</h3>
        {coursesLoading ? (
          <p>Loading your courses...</p>
        ) : courses.length === 0 ? (
          <p style={{ color: '#718096', fontStyle: 'italic' }}>You have not created any courses yet.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {courses.map((c) => (
              <button
                key={c.id}
                type="button"
                className={selectedCourseId === c.id ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setSelectedCourseId(c.id)}
                style={{ textAlign: 'left', padding: '8px 12px' }}
              >
                <div><strong>Course {c.id.slice(0, 8)}...</strong></div>
                <div style={{ fontSize: '0.75rem', opacity: 0.8 }}>Visibility: {c.visibility}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Course Draft & Versions */}
      {selectedCourseId && draft && (
        <div style={{ borderTop: '2px solid #e2e8f0', paddingTop: '16px' }}>
          <h3>Editable Draft (Revision {draft.revision})</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '16px' }}>
            <div>
              <label htmlFor="draft-title" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600 }}>Draft Title</label>
              <input
                id="draft-title"
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0' }}
              />
            </div>
            <div>
              <label htmlFor="draft-desc" style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600 }}>Draft Description</label>
              <textarea
                id="draft-desc"
                value={draftDesc}
                onChange={(e) => setDraftDesc(e.target.value)}
                rows={3}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e0' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" className="btn-primary" onClick={handleSaveDraft}>
                Save Draft (Increment Revision)
              </button>
              <button type="button" className="btn-secondary" onClick={handleCreateVersion}>
                Create Immutable Version Snapshot
              </button>
            </div>
          </div>

          {/* Version History */}
          <h4>Immutable Version History ({versions.length})</h4>
          {versions.length === 0 ? (
            <p style={{ color: '#718096', fontStyle: 'italic' }}>No version snapshots created yet for this course.</p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {versions.map((v) => (
                <li
                  key={v.id}
                  style={{
                    background: '#edf2f7',
                    padding: '10px 14px',
                    borderRadius: '6px',
                    borderLeft: '4px solid #3182ce',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>Version {v.versionNumber}: {v.title}</strong>
                    <span style={{ fontSize: '0.8rem', color: '#4a5568' }}>
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#4a5568', marginTop: '4px' }}>
                    Snapshot Schema: {v.schemaVersion} | From Draft Rev: {v.draftRevision}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
