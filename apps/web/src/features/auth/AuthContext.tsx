import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AuthApiError,
  fetchCurrentUser,
  isSessionExpired,
  MeResponseDto,
  SessionDto,
  signInWithEmail,
  signOut,
  signUpWithEmail,
  subscribeSessionExpired,
  UserDto,
} from '../../services/auth';

export interface AuthContextValue {
  user: UserDto | null;
  session: SessionDto | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionExpired: boolean;
  error: string | null;
  login: (credentials: { email: string; password: string }) => Promise<MeResponseDto>;
  signUp: (payload: { email: string; password: string; name: string }) => Promise<MeResponseDto>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
  clearSessionExpired: () => void;
}

const defaultAuthContextValue: AuthContextValue = {
  user: null,
  session: null,
  isAuthenticated: false,
  isLoading: false,
  sessionExpired: false,
  error: null,
  login: async () => {
    throw new Error('AuthProvider is not mounted.');
  },
  signUp: async () => {
    throw new Error('AuthProvider is not mounted.');
  },
  logout: async () => {},
  refreshSession: async () => {},
  clearSessionExpired: () => {},
};

export const AuthContext = createContext<AuthContextValue>(defaultAuthContextValue);

export interface AuthProviderProps {
  children: React.ReactNode;
  initialSession?: { user: UserDto; session?: SessionDto } | null;
}

export function AuthProvider({ children, initialSession }: AuthProviderProps) {
  const [user, setUser] = useState<UserDto | null>(initialSession?.user ?? null);
  const [session, setSession] = useState<SessionDto | null>(initialSession?.session ?? null);
  const [isLoading, setIsLoading] = useState<boolean>(initialSession === undefined);
  const [sessionExpired, setSessionExpired] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const expiryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasAuthenticatedRef = useRef<boolean>(!!initialSession?.user);
  const refreshRequest = useRef<Promise<void> | null>(null);

  useEffect(() => {
    wasAuthenticatedRef.current = !!user;
  }, [user]);

  const clearTimer = useCallback(() => {
    if (expiryTimerRef.current) {
      clearTimeout(expiryTimerRef.current);
      expiryTimerRef.current = null;
    }
  }, []);

  const handleExpiry = useCallback(() => {
    clearTimer();
    setUser(null);
    setSession(null);
    setSessionExpired(true);
  }, [clearTimer]);

  // Schedule timer based on session.expiresAt
  useEffect(() => {
    clearTimer();

    if (session?.expiresAt) {
      const expiryTime = new Date(session.expiresAt).getTime();
      const now = Date.now();
      const remainingMs = expiryTime - now;

      if (remainingMs <= 0) {
        handleExpiry();
      } else {
        expiryTimerRef.current = setTimeout(() => {
          handleExpiry();
        }, remainingMs);
      }
    }

    return () => clearTimer();
  }, [session?.expiresAt, clearTimer, handleExpiry]);

  // Listen to application-wide 401 session expiration events
  useEffect(() => {
    const unsubscribe = subscribeSessionExpired(() => {
      handleExpiry();
    });
    return () => unsubscribe();
  }, [handleExpiry]);

  // Authoritative refresh against GET /api/v1/me
  const refreshSession = useCallback((): Promise<void> => {
    if (refreshRequest.current) return refreshRequest.current;
    setError(null);
    refreshRequest.current = fetchCurrentUser().then((res) => {
      if (res.session && isSessionExpired(res.session)) {
        handleExpiry();
      } else {
        setUser(res.user);
        setSession(res.session ?? null);
        setSessionExpired(false);
      }
    }).catch((err: unknown) => {
      if (err instanceof AuthApiError && err.statusCode === 401) {
        if (wasAuthenticatedRef.current) {
          setSessionExpired(true);
        }
        setUser(null);
        setSession(null);
        setError(null);
      } else {
        const msg = err instanceof Error ? err.message : 'Failed to retrieve session';
        setError(msg);
      }
    }).finally(() => {
      refreshRequest.current = null;
      setIsLoading(false);
    });
    return refreshRequest.current;
  }, [handleExpiry]);

  // Initialize session on mount if not provided via initialSession
  useEffect(() => {
    if (initialSession === undefined) {
      refreshSession();
    }
  }, [initialSession, refreshSession]);

  const login = useCallback(
    async (credentials: { email: string; password: string }): Promise<MeResponseDto> => {
      setError(null);
      try {
        const res = await signInWithEmail(credentials);
        setUser(res.user);
        setSession(res.session ?? null);
        setSessionExpired(false);
        return res;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Sign in failed';
        setError(msg);
        throw err;
      }
    },
    [],
  );

  const signUp = useCallback(
    async (payload: { email: string; password: string; name: string }): Promise<MeResponseDto> => {
      setError(null);
      try {
        const res = await signUpWithEmail(payload);
        setUser(res.user);
        setSession(res.session ?? null);
        setSessionExpired(false);
        return res;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Sign up failed';
        setError(msg);
        throw err;
      }
    },
    [],
  );

  const logout = useCallback(async (): Promise<void> => {
    setError(null);
    try {
      await signOut();
      clearTimer();
      setUser(null);
      setSession(null);
      setSessionExpired(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign out failed.';
      setError(msg);
      throw err;
    }
  }, [clearTimer]);

  const clearSessionExpired = useCallback(() => {
    setSessionExpired(false);
  }, []);

  const isAuthenticated = useMemo(() => {
    if (!user || sessionExpired) return false;
    if (session && isSessionExpired(session)) return false;
    return true;
  }, [user, sessionExpired, session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isAuthenticated,
      isLoading,
      sessionExpired,
      error,
      login,
      signUp,
      logout,
      refreshSession,
      clearSessionExpired,
    }),
    [
      user,
      session,
      isAuthenticated,
      isLoading,
      sessionExpired,
      error,
      login,
      signUp,
      logout,
      refreshSession,
      clearSessionExpired,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
