import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import { ThemeSwitcher } from '../theme/ThemeSwitcher';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  devOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/app', icon: '🏠' },
  { label: 'My Courses', path: '/app/courses', icon: '📚' },
  { label: 'Assessments', path: '/app/exams', icon: '📝' },
  { label: 'Skills', path: '/app/skills', icon: '⚡' },
  { label: 'Quests', path: '/app/quests', icon: '🎯' },
  { label: '── Creator', path: '/studio', icon: '✏️' },
  { label: 'My Studio', path: '/studio/courses', icon: '🗂️' },
  { label: 'Grading', path: '/studio/grading', icon: '🎓' },
  { label: '── Dev', path: '/dev', icon: '🔧', devOnly: true },
  { label: 'Verification', path: '/dev/verification', icon: '🔍', devOnly: true },
];

const isDev =
  import.meta.env.DEV ||
  (typeof window !== 'undefined' && window.location.pathname.startsWith('/dev'));

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

function Sidebar({ isOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const isFirstRender = useRef(true);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    onClose();
  }, [location.pathname, onClose]);

  // Escape key closes the drawer
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  const visibleItems = NAV_ITEMS.filter((item) => !item.devOnly || isDev);

  return (
    <>
      {isOpen && (
        <div
          aria-hidden="true"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 40,
            background: 'rgb(0 0 0 / 35%)',
            display: 'none',
          }}
          className="sidebar-backdrop"
        />
      )}

      <nav
        id="app-sidebar"
        aria-label="Main navigation"
        role="navigation"
        style={{
          width: '220px',
          flexShrink: 0,
          background: 'var(--ui-sidebar-bg)',
          borderRight: '1px solid var(--ui-sidebar-border)',
          display: 'flex',
          flexDirection: 'column',
          paddingTop: '1rem',
          overflowY: 'auto',
          height: '100%',
        }}
      >
        <ul
          style={{
            listStyle: 'none',
            padding: '0 0.5rem',
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
          role="list"
        >
          {visibleItems.map((item) => {
            const isSectionHeader = item.label.startsWith('──');
            if (isSectionHeader) {
              return (
                <li key={item.path} role="presentation">
                  <span
                    style={{
                      display: 'block',
                      padding: '0.6rem 0.75rem 0.2rem',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: 'var(--ui-sidebar-text-muted)',
                    }}
                  >
                    {item.label.replace('── ', '')}
                  </span>
                </li>
              );
            }

            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/app' || item.path === '/studio' || item.path === '/dev'}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    textDecoration: 'none',
                    fontSize: '0.875rem',
                    fontWeight: isActive ? 600 : 400,
                    background: isActive
                      ? 'var(--ui-sidebar-active-bg)'
                      : 'transparent',
                    color: isActive
                      ? 'var(--ui-sidebar-active-text)'
                      : 'var(--ui-sidebar-text)',
                    transition: 'background 0.1s, color 0.1s',
                  })}
                >
                  <span aria-hidden="true" style={{ fontSize: '1rem' }}>
                    {item.icon}
                  </span>
                  {item.label}
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

interface TopbarProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  toggleRef: React.RefObject<HTMLButtonElement | null>;
}

function Topbar({ isSidebarOpen, onToggleSidebar, toggleRef }: TopbarProps) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const [signoutError, setSignoutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleLogout = async () => {
    setIsSigningOut(true);
    setSignoutError(null);
    try {
      await logout();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign out failed. Please retry.';
      setSignoutError(msg);
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        height: '56px',
        background: 'var(--ui-topbar-bg)',
        borderBottom: '1px solid var(--ui-topbar-border)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 1rem',
        gap: '0.75rem',
        flexShrink: 0,
      }}
    >
      <button
        ref={toggleRef as React.RefObject<HTMLButtonElement>}
        type="button"
        aria-label={isSidebarOpen ? 'Close navigation menu' : 'Open navigation menu'}
        aria-expanded={isSidebarOpen}
        aria-controls="app-sidebar"
        onClick={onToggleSidebar}
        className="topbar-hamburger"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: 'var(--radius-sm)',
          color: 'var(--ui-text)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1.2rem',
        }}
      >
        {isSidebarOpen ? '✕' : '☰'}
      </button>

      <NavLink
        to="/app"
        aria-label="Universal Learning Engine — Home"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          textDecoration: 'none',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            background: 'var(--ui-primary)',
            color: 'var(--ui-primary-contrast)',
            fontWeight: 700,
            fontSize: '0.9rem',
            padding: '3px 8px',
            borderRadius: 'var(--radius-sm)',
            letterSpacing: '0.05em',
          }}
        >
          ULE
        </span>
        <span
          className="topbar-title"
          style={{
            fontWeight: 600,
            fontSize: '0.95rem',
            color: 'var(--ui-text)',
          }}
        >
          Universal Learning Engine
        </span>
      </NavLink>

      <div style={{ flex: 1 }} />

      {/* User Session State */}
      <div
        className="topbar-auth"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.625rem',
        }}
      >
        {isLoading ? (
          <span
            style={{
              fontSize: '0.8rem',
              color: 'var(--ui-text-muted)',
            }}
          >
            Checking session…
          </span>
        ) : isAuthenticated && user ? (
          <>
            <span
              className="user-avatar"
              aria-hidden="true"
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'var(--ui-primary)',
                color: 'var(--ui-primary-contrast)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {user.name ? user.name.charAt(0).toUpperCase() : user.email.charAt(0).toUpperCase()}
            </span>
            <span
              className="topbar-username"
              style={{
                fontSize: '0.85rem',
                fontWeight: 500,
                color: 'var(--ui-text)',
                maxWidth: '160px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {user.name || user.email}
            </span>
            {signoutError && (
              <span
                role="alert"
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--ui-danger)',
                  fontWeight: 500,
                  whiteSpace: 'nowrap',
                }}
              >
                {signoutError}
              </span>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={isSigningOut}
              className="btn-signout"
              aria-label="Sign out"
              style={{
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.8rem',
                fontWeight: 600,
                background: 'var(--ui-surface-muted)',
                color: 'var(--ui-text)',
                border: '1px solid var(--ui-border)',
                cursor: isSigningOut ? 'not-allowed' : 'pointer',
                opacity: isSigningOut ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {isSigningOut ? 'Signing out…' : 'Sign Out'}
            </button>
          </>
        ) : (
          <NavLink
            to="/login"
            className="btn-signin"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              padding: '4px 12px',
              borderRadius: 'var(--radius-sm)',
              fontSize: '0.85rem',
              fontWeight: 600,
              textDecoration: 'none',
              background: 'var(--ui-primary)',
              color: 'var(--ui-primary-contrast)',
              whiteSpace: 'nowrap',
            }}
          >
            Sign In
          </NavLink>
        )}
      </div>

      <ThemeSwitcher compact />
    </header>
  );
}

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement | null>(null);

  const closeSidebar = useCallback(() => {
    setIsSidebarOpen(false);
    setTimeout(() => toggleRef.current?.focus(), 50);
  }, []);

  const toggle = useCallback(() => {
    setIsSidebarOpen((prev) => !prev);
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--ui-bg)',
      }}
    >
      <Topbar
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={toggle}
        toggleRef={toggleRef}
      />

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <div className="sidebar-desktop">
          <Sidebar isOpen={true} onClose={() => {}} />
        </div>

        {isSidebarOpen && (
          <div
            className="sidebar-mobile"
            style={{
              position: 'fixed',
              top: '56px',
              left: 0,
              bottom: 0,
              zIndex: 60,
              width: '220px',
              boxShadow: 'var(--shadow-md)',
            }}
          >
            <Sidebar isOpen={isSidebarOpen} onClose={closeSidebar} />
          </div>
        )}

        {isSidebarOpen && (
          <div
            aria-hidden="true"
            onClick={closeSidebar}
            className="sidebar-mobile"
            style={{
              position: 'fixed',
              inset: 0,
              top: '56px',
              zIndex: 55,
              background: 'rgb(0 0 0 / 40%)',
            }}
          />
        )}

        <main
          id="main-content"
          tabIndex={-1}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem',
            maxWidth: '1200px',
            width: '100%',
          }}
        >
          {children}
        </main>
      </div>

      <style>{`
        .sidebar-desktop { display: flex; }
        .sidebar-mobile  { display: none; }
        .topbar-hamburger { display: none; }

        @media (max-width: 767px) {
          .sidebar-desktop  { display: none; }
          .sidebar-mobile   { display: flex; }
          .topbar-hamburger { display: flex; }
          .topbar-title     { display: none; }
        }

        @media (max-width: 640px) {
          .topbar-username { display: none; }
        }
      `}</style>
    </div>
  );
}
