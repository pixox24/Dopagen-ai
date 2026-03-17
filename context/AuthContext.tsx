import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { clearSupabaseAuthStorage, supabase } from '../lib/supabase';

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

const SESSION_RECOVERY_TIMEOUT_MS = 6000;
const PROFILE_TIMEOUT_MS = 8000;
const AUTH_ACTION_TIMEOUT_MS = 15000;

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMountedRef = useRef(true);

  const buildFallbackUser = useCallback((userId: string, email: string, username?: string | null): User => ({
    id: userId,
    username: username?.trim() || email.split('@')[0] || 'User',
    email,
    avatar: ''
  }), []);

  const fetchProfile = useCallback(async (userId: string, email: string): Promise<User> => {
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('profiles')
          .select('id,username,email,avatar_url,role')
          .eq('id', userId)
          .single(),
        PROFILE_TIMEOUT_MS,
        'Profile lookup timed out'
      );

      if (error || !data) {
        return buildFallbackUser(userId, email);
      }

      return {
        id: data.id,
        username: data.username || email.split('@')[0],
        email: data.email || email,
        avatar: data.avatar_url || '',
        role: data.role
      };
    } catch (error) {
      console.warn('[Auth] Falling back to session user because profile lookup failed.', error);
      return buildFallbackUser(userId, email);
    }
  }, [buildFallbackUser]);

  const hydrateUserFromSession = useCallback(async (activeSession: Session | null) => {
    if (!activeSession?.user) {
      if (isMountedRef.current) {
        setUser(null);
      }
      return;
    }

    const fallbackUser = buildFallbackUser(
      activeSession.user.id,
      activeSession.user.email || '',
      typeof activeSession.user.user_metadata?.username === 'string'
        ? activeSession.user.user_metadata.username
        : null
    );

    if (isMountedRef.current) {
      setUser((current) => current?.id === fallbackUser.id
        ? { ...fallbackUser, avatar: current.avatar, role: current.role }
        : fallbackUser);
    }

    const profile = await fetchProfile(activeSession.user.id, activeSession.user.email || '');
    if (isMountedRef.current) {
      setUser(profile);
    }
  }, [buildFallbackUser, fetchProfile]);

  useEffect(() => {
    isMountedRef.current = true;
    let didSessionRecoveryTimeout = false;

    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) {
        didSessionRecoveryTimeout = true;
        console.warn('[Auth] Session recovery exceeded timeout. Falling back to logged-out state.');
        clearSupabaseAuthStorage();
        setSession(null);
        setUser(null);
        setIsLoading(false);
      }
    }, SESSION_RECOVERY_TIMEOUT_MS);

    const init = async () => {
      try {
        const { data: { session: existingSession } } = await withTimeout(
          supabase.auth.getSession(),
          SESSION_RECOVERY_TIMEOUT_MS,
          'Session recovery timed out'
        );

        if (!isMountedRef.current || didSessionRecoveryTimeout) {
          return;
        }

        setSession(existingSession);
        await hydrateUserFromSession(existingSession);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return;
        }

        console.error('[Auth] Init error:', error);
        clearSupabaseAuthStorage();
        if (isMountedRef.current) {
          setSession(null);
          setUser(null);
        }
      } finally {
        if (isMountedRef.current) {
          clearTimeout(timeoutId);
          setIsLoading(false);
        }
      }
    };

    void init();

    const authState = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMountedRef.current) {
        return;
      }

      setSession(newSession);
      await hydrateUserFromSession(newSession);
    });

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutId);
      authState.data.subscription.unsubscribe();
    };
  }, [hydrateUserFromSession]);

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
        setSession(data.session);
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
        setSession(data.session);
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
      setSession(null);
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
