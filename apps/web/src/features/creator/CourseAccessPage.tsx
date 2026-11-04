import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { CourseAccessGrantDto, CourseVersionDto } from '@ule/contracts';
import { ErrorState } from '../../components/states/ErrorState';
import { LoadingState } from '../../components/states/LoadingState';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { CreatorApiError, fetchCourseVersion } from '../../services/creator';
import {
  createCourseAccessGrant,
  fetchCourseAccessGrants,
  revokeCourseAccessGrant,
} from '../../services/grants';

type VersionSummary = Pick<CourseVersionDto, 'title' | 'versionNumber'>;

type AccessState =
  | { status: 'loading' }
  | { status: 'ready'; version: VersionSummary; grants: CourseAccessGrantDto[] }
  | { status: 'error'; statusCode?: number };

type AccessAction =
  | { kind: 'grant'; email: string }
  | { kind: 'revoke' | 'regrant'; grant: CourseAccessGrantDto };

function getStatusCode(error: unknown) {
  return error instanceof CreatorApiError ? error.statusCode : undefined;
}

function isVersionUnavailable(statusCode?: number) {
  return statusCode === 401 || statusCode === 403 || statusCode === 404;
}

const tableCellStyle: React.CSSProperties = {
  padding: '0.6rem 0.5rem',
  textAlign: 'left',
  borderBottom: '1px solid var(--ui-border)',
};

function VersionAccess({ courseId, versionId }: { courseId: string; versionId: string }) {
  const [access, setAccess] = useState<AccessState>({ status: 'loading' });
  const [loadRequest, setLoadRequest] = useState<{ version?: VersionSummary }>({});
  const [email, setEmail] = useState('');
  const [pending, setPending] = useState(false);
  const mutationInFlight = useRef(false);
  const [confirmingGrantId, setConfirmingGrantId] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState<{ message: string; canRetry?: boolean }>();

  useEffect(() => {
    let current = true;
    const version = loadRequest.version ?? fetchCourseVersion(courseId, versionId);
    void Promise.all([version, fetchCourseAccessGrants(courseId, versionId)]).then(
      ([{ title, versionNumber }, grants]) => {
        if (current) {
          setAccess({ status: 'ready', version: { title, versionNumber }, grants });
        }
      },
      (error: unknown) => {
        if (current) {
          setAccess({ status: 'error', statusCode: getStatusCode(error) });
        }
      },
    );
    return () => {
      current = false;
    };
  }, [courseId, versionId, loadRequest]);

  const version = access.status === 'ready' ? access.version : loadRequest.version;

  function reload() {
    setActionError(undefined);
    setConfirmingGrantId(null);
    setAccess({ status: 'loading' });
    setLoadRequest({ version });
  }

  async function manageAccess(action: AccessAction) {
    if (mutationInFlight.current) return;
    mutationInFlight.current = true;
    setPending(true);
    setNotice('');
    setActionError(undefined);

    try {
      if (action.kind === 'revoke') {
        await revokeCourseAccessGrant(courseId, versionId, action.grant.id);
      } else {
        const learner =
          action.kind === 'grant' ? { email: action.email } : { userId: action.grant.userId };
        await createCourseAccessGrant(courseId, versionId, learner);
      }
      if (action.kind === 'grant') setEmail('');
      setNotice(action.kind === 'revoke' ? 'Learner access revoked.' : 'Learner access is active.');
      reload();
    } catch (error) {
      setConfirmingGrantId(null);
      const statusCode = getStatusCode(error);
      if (
        action.kind !== 'revoke' &&
        error instanceof CreatorApiError &&
        statusCode === 404 &&
        error.message === 'Target learner user not found.'
      ) {
        setActionError({
          message: 'Learner account not found. The learner must register for ULE before you can grant access.',
        });
      } else if (statusCode === 401 || statusCode === 403) {
        setAccess({ status: 'error', statusCode });
      } else if (statusCode === 404) {
        reload();
        setActionError({ message: 'Learner access changed. Check the updated list and try again.' });
      } else if (statusCode === 400 && error instanceof CreatorApiError) {
        setActionError({ message: error.message });
      } else {
        setActionError({
          message: 'The access change could not be confirmed. Retry to reload the current access list.',
          canRetry: true,
        });
      }
    } finally {
      mutationInFlight.current = false;
      setPending(false);
    }
  }

  const unavailable = access.status === 'error' && isVersionUnavailable(access.statusCode);
  const actionsDisabled = pending || actionError?.canRetry;

  return (
    <div style={{ display: 'grid', gap: '1rem', maxWidth: '52rem' }}>
      <header>
        <Link to={`/studio/courses/${courseId}/edit`} style={{ color: 'var(--ui-primary)' }}>
          ← Back to Course Editor
        </Link>
        <h1 style={{ marginTop: '0.5rem' }}>Manage Learners</h1>
        {version && !unavailable && (
          <p style={{ color: 'var(--ui-text-muted)' }}>
            {version.title} — Version {version.versionNumber}
          </p>
        )}
      </header>

      {notice && !unavailable && <p role="status">{notice}</p>}
      {access.status === 'loading' && <LoadingState message="Loading learner access…" />}
      {access.status === 'error' && (
        unavailable ? (
          <ErrorState
            title="Course version unavailable"
            message={
              access.statusCode === 401
                ? 'Sign in again to manage learner access.'
                : 'Only the course owner can manage access to a published version.'
            }
          />
        ) : (
          <ErrorState
            title="Could not load learner access"
            message="Check your connection and try again."
            onRetry={reload}
          />
        )
      )}

      {access.status === 'ready' && (
        <>
          <Card>
            <h2>Grant access</h2>
            <p style={{ color: 'var(--ui-text-muted)', margin: '0.35rem 0 1rem' }}>
              Grants apply to this published version only. Learners must already have a ULE account.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const learnerEmail = email.trim();
                if (!actionsDisabled && learnerEmail) {
                  void manageAccess({ kind: 'grant', email: learnerEmail });
                }
              }}
            >
              <label htmlFor="learner-email">Learner email</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.25rem' }}>
                <input
                  id="learner-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  disabled={actionsDisabled}
                  style={{
                    flex: '1 1 15rem',
                    minWidth: 0,
                    padding: '0.45rem 0.6rem',
                    border: '1px solid var(--ui-border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--ui-bg)',
                    color: 'var(--ui-text)',
                  }}
                />
                <Button type="submit" variant="primary" disabled={actionsDisabled || !email.trim()}>
                  Grant Access
                </Button>
              </div>
            </form>
          </Card>

          {actionError && (
            <ErrorState
              title="Could not update learner access"
              message={actionError.message}
              onRetry={actionError.canRetry ? reload : undefined}
            />
          )}

          <Card>
            <h2>Learner access</h2>
            {access.grants.length === 0 ? (
              <p style={{ color: 'var(--ui-text-muted)' }}>
                No learners have been granted access to this version.
              </p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table
                  aria-label="Learner access grants"
                  style={{ width: '100%', borderCollapse: 'collapse' }}
                >
                  <thead>
                    <tr>
                      <th scope="col" style={tableCellStyle}>
                        Learner
                      </th>
                      <th scope="col" style={tableCellStyle}>
                        Status
                      </th>
                      <th scope="col" style={tableCellStyle}>
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {access.grants.map((grant) => {
                      const active = grant.status === 'ACTIVE';
                      const learner = grant.userEmail || grant.userName || grant.userId;
                      return (
                        <tr key={grant.id}>
                          <th scope="row" style={{ ...tableCellStyle, overflowWrap: 'anywhere' }}>
                            {learner}
                          </th>
                          <td style={tableCellStyle}>
                            <Badge variant={active ? 'success' : 'neutral'}>
                              {active ? 'Active' : 'Revoked'}
                            </Badge>
                          </td>
                          <td style={tableCellStyle}>
                            {confirmingGrantId === grant.id ? (
                              <div role="group" aria-label={`Confirm revoke for ${learner}`}>
                                <p>Revoke access to this version?</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="danger"
                                    disabled={actionsDisabled}
                                    onClick={() => void manageAccess({ kind: 'revoke', grant })}
                                  >
                                    Confirm Revoke
                                  </Button>
                                  <Button
                                    type="button"
                                    size="sm"
                                    autoFocus
                                    disabled={actionsDisabled}
                                    onClick={() => setConfirmingGrantId(null)}
                                  >
                                    Cancel
                                  </Button>
                                </div>
                              </div>
                            ) : active ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="danger"
                                disabled={actionsDisabled}
                                onClick={() => setConfirmingGrantId(grant.id)}
                              >
                                Revoke
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={actionsDisabled}
                                onClick={() => void manageAccess({ kind: 'regrant', grant })}
                              >
                                Re-grant
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

export default function CourseAccessPage() {
  const { courseId, versionId } = useParams();
  if (!courseId || !versionId) return <ErrorState title="Course version unavailable" />;
  return (
    <VersionAccess
      key={JSON.stringify([courseId, versionId])}
      courseId={courseId}
      versionId={versionId}
    />
  );
}
