import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearSupabaseAuthStorage, supabase, supabaseAuthStorageKey } from '../lib/supabase';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar: string;
  role?: string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  signup: (email: string, password: string, username: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_RECOVERY_TIMEOUT_MS = 12000;
const PROFILE_TIMEOUT_MS = 3000;
const AUTH_ACTION_TIMEOUT_MS = 15000;
const PROFILE_RETRY_COOLDOWN_MS = 30000;

type SessionIdentity = {
  userId: string;
  email: string;
  username?: string | null;
};

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
};

const isPersistedSession = (value: unknown): value is Session => {
  return typeof value === 'object'
    && value !== null
    && 'access_token' in value
    && 'refresh_token' in value
    && 'expires_at' in value;
};

const readStoredJson = <T,>(key: string): T | null => {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(key);
  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch (error) {
    console.warn(`[Auth] Failed to parse persisted auth payload for "${key}".`, error);
    return null;
  }
};

const decodeBase64Url = (value: string): string | null => {
  if (!value) {
    return null;
  }

  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    return window.atob(padded);
  } catch (error) {
    console.warn('[Auth] Failed to decode persisted session token.', error);
    return null;
  }
};

const getUsername = (value: unknown): string | null => {
  if (typeof value !== 'object' || value === null || !('username' in value)) {
    return null;
  }

  return typeof value.username === 'string' ? value.username : null;
};

const getSessionIdentity = (activeSession: Session | null): SessionIdentity | null => {
  if (!activeSession) {
    return null;
  }

  if (activeSession.user?.id) {
    return {
      userId: activeSession.user.id,
      email: activeSession.user.email || '',
      username: getUsername(activeSession.user.user_metadata),
    };
  }

  const payloadSegment = activeSession.access_token?.split('.')[1];
  const decodedPayload = payloadSegment ? decodeBase64Url(payloadSegment) : null;
  if (!decodedPayload) {
    return null;
  }

  try {
    const payload = JSON.parse(decodedPayload) as Record<string, unknown>;
    if (typeof payload.sub !== 'string') {
      return null;
    }

    return {
      userId: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      username: getUsername(payload.user_metadata),
    };
  } catch (error) {
    console.warn('[Auth] Failed to parse persisted session identity.', error);
    return null;
  }
};

const readPersistedSession = (): Session | null => {
  const storedSession = readStoredJson<Session>(supabaseAuthStorageKey);
  if (!isPersistedSession(storedSession)) {
    return null;
  }

  const storedUser = readStoredJson<{ user?: Session['user'] | null }>(`${supabaseAuthStorageKey}-user`);
  if (!storedSession.user && storedUser?.user) {
    return { ...storedSession, user: storedUser.user } as Session;
  }

  return storedSession;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);
  const activeSessionUserIdRef = useRef<string | null>(null);
  const profileCacheRef = useRef<Map<string, User>>(new Map());
  const profileRequestRef = useRef<Map<string, Promise<User>>>(new Map());
  const profileFailureRef = useRef<Map<string, number>>(new Map());
  const profileWarningRef = useRef<Map<string, number>>(new Map());

  const buildFallbackUser = useCallback((userId: string, email: string, username?: string | null): User => ({
    id: userId,
    username: username?.trim() || email.split('@')[0] || 'User',
    email,
    avatar: ''
  }), []);

  const fetchProfile = useCallback(async (userId: string, email: string): Promise<User> => {
    const cachedProfile = profileCacheRef.current.get(userId);
    if (cachedProfile) {
      return cachedProfile;
    }

    const lastFailureAt = profileFailureRef.current.get(userId) || 0;
    if (Date.now() - lastFailureAt < PROFILE_RETRY_COOLDOWN_MS) {
      return buildFallbackUser(userId, email);
    }

    const existingRequest = profileRequestRef.current.get(userId);
    if (existingRequest) {
      return existingRequest;
    }

    const request = (async () => {
      try {
        const { data, error } = await withTimeout(
          supabase
            .from('profiles')
            .select('id,username,email,avatar_url,role')
            .eq('id', userId)
            .maybeSingle(),
          PROFILE_TIMEOUT_MS,
          'Profile lookup timed out'
        );

        if (error || !data) {
          if (error) {
            profileFailureRef.current.set(userId, Date.now());
          }
          return buildFallbackUser(userId, email);
        }

        const profile = {
          id: data.id,
          username: data.username || email.split('@')[0],
          email: data.email || email,
          avatar: data.avatar_url || '',
          role: data.role
        };
        profileCacheRef.current.set(userId, profile);
        profileFailureRef.current.delete(userId);
        return profile;
      } catch (error) {
        profileFailureRef.current.set(userId, Date.now());

        const lastWarningAt = profileWarningRef.current.get(userId) || 0;
        if (Date.now() - lastWarningAt >= PROFILE_RETRY_COOLDOWN_MS) {
          console.warn('[Auth] Falling back to session user because profile lookup failed.', error);
          profileWarningRef.current.set(userId, Date.now());
        }

        return buildFallbackUser(userId, email);
      } finally {
        profileRequestRef.current.delete(userId);
      }
    })();

    profileRequestRef.current.set(userId, request);
    return request;
  }, [buildFallbackUser]);

  const applySession = useCallback((nextSession: Session | null) => {
    activeSessionUserIdRef.current = getSessionIdentity(nextSession)?.userId ?? null;
    setSession(nextSession);
  }, []);

  const hydrateUserFromSession = useCallback(async (activeSession: Session | null) => {
    const sessionIdentity = getSessionIdentity(activeSession);

    if (!sessionIdentity) {
      if (isMountedRef.current) {
        setUser(null);
      }
      return;
    }

    const fallbackUser = buildFallbackUser(
      sessionIdentity.userId,
      sessionIdentity.email,
      sessionIdentity.username
    );

    if (isMountedRef.current && activeSessionUserIdRef.current === sessionIdentity.userId) {
      setUser((current) => current?.id === fallbackUser.id
        ? { ...fallbackUser, avatar: current.avatar, role: current.role }
        : fallbackUser);
    }

    const profile = await fetchProfile(sessionIdentity.userId, sessionIdentity.email);
    if (isMountedRef.current && activeSessionUserIdRef.current === sessionIdentity.userId) {
      setUser(profile);
    }
  }, [buildFallbackUser, fetchProfile]);

  useEffect(() => {
    isMountedRef.current = true;
    const persistedSession = readPersistedSession();

    if (persistedSession) {
      applySession(persistedSession);
      void hydrateUserFromSession(persistedSession);
    }

    const init = async () => {
      try {
        const { data: { session: existingSession } } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_RECOVERY_TIMEOUT_MS,
          'Session recovery timed out'
        );

        if (!isMountedRef.current) {
          return;
        }

        if (!existingSession) {
          clearSupabaseAuthStorage();
          applySession(null);
          setUser(null);
          return;
        }

        applySession(existingSession);
        await hydrateUserFromSession(existingSession);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        if (error instanceof Error && error.message === 'Session recovery timed out') {
          console.warn('[Auth] Session recovery exceeded timeout. Keeping persisted session until Supabase responds.');
          return;
        }

        console.error('[Auth] Init error:', error);
        if (!persistedSession && isMountedRef.current) {
          applySession(null);
          setUser(null);
        }
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false);
        }
      }
    };

    void init();

    const authState = supabase.auth.onAuthStateChange(async (event, newSession) => {
      if (!isMountedRef.current) {
        return;
      }

      if (event === 'SIGNED_OUT') {
        clearSupabaseAuthStorage();
      }

      applySession(newSession);
      await hydrateUserFromSession(newSession);
    });

    return () => {
      isMountedRef.current = false;
      authState.data.subscription.unsubscribe();
    };
  }, [applySession, hydrateUserFromSession]);

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        AUTH_ACTION_TIMEOUT_MS,
        'Login request timed out. Check your network or VPN and try again.'
      );

      if (error) {
        return { error: error.message };
      }

      if (data.session) {
        applySession(data.session);
        void hydrateUserFromSession(data.session);
      }

      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Login failed';
      return { error: message };
    }
  };

  const signup = async (email: string, password: string, username: string): Promise<{ error?: string }> => {
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username }
          }
        }),
        AUTH_ACTION_TIMEOUT_MS,
        'Signup request timed out. Check your network or VPN and try again.'
      );

      if (error) {
        return { error: error.message };
      }

      if (data.session) {
        applySession(data.session);
        void hydrateUserFromSession(data.session);
      }

      return {};
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Signup failed';
      return { error: message };
    }
  };

  const logout = async () => {
    try {
      await withTimeout(
        supabase.auth.signOut(),
        AUTH_ACTION_TIMEOUT_MS,
        'Logout request timed out'
      );
    } catch (error) {
      console.warn('[Auth] Remote logout failed, clearing local session anyway.', error);
    } finally {
      clearSupabaseAuthStorage();
      setUser(null);
      applySession(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        isAuthenticated: !!session,
        isLoading,
        login,
        signup,
        logout
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
