import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

// 统一使用此 User 接口，消除 types.ts 中的重复定义
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // 使用 ref 追踪组件挂载状态，防止内存泄漏
  const isMountedRef = useRef(true);

  // 获取用户 profile 信息
  const fetchProfile = useCallback(async (userId: string, email: string): Promise<User | null> => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error || !data) {
        // Profile 可能还未创建（触发器延迟），返回基本信息
        return {
          id: userId,
          username: email.split('@')[0],
          email,
          avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${email.split('@')[0]}`
        };
      }

      return {
        id: data.id,
        username: data.username,
        email: data.email || email,
        avatar: data.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.username}`,
        role: data.role
      };
    } catch (err: unknown) {
      console.error('[Auth] Fetch profile unexpected error:', err);
      return null;
    }
  }, []);

  // 初始化：检查现有 session，并订阅 Auth 状态变化
  useEffect(() => {
    isMountedRef.current = true;

    // 安全超时：避免初始化卡住导致无限加载
    const timeoutId = setTimeout(() => {
      if (isMountedRef.current) setIsLoading(false);
    }, 5000);

    const init = async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();

        if (isMountedRef.current && existingSession?.user) {
          setSession(existingSession);
          const profile = await fetchProfile(existingSession.user.id, existingSession.user.email || '');
          if (isMountedRef.current) setUser(profile);
        }
      } catch (err: unknown) {
        console.error('[Auth] Init error:', err);
      } finally {
        if (isMountedRef.current) {
          clearTimeout(timeoutId);
          setIsLoading(false);
        }
      }
    };

    init();

    // 监听认证状态变化（修复原死代码：之前因提前 return 而永远不会执行）
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!isMountedRef.current) return;
        setSession(newSession);
        if (newSession?.user) {
          const profile = await fetchProfile(newSession.user.id, newSession.user.email || '');
          if (isMountedRef.current) setUser(profile);
        } else {
          setUser(null);
        }
      }
    );

    // 统一清理：同时清除超时定时器和 Auth 订阅
    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [fetchProfile]);

  const login = async (email: string, password: string): Promise<{ error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        return { error: error.message };
      }

      if (data.user) {
        const profile = await fetchProfile(data.user.id, data.user.email || '');
        setUser(profile);
        setSession(data.session);
      }

      return {};
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      return { error: message };
    }
  };

  const signup = async (email: string, password: string, username: string): Promise<{ error?: string }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username }
        }
      });

      if (error) {
        return { error: error.message };
      }

      if (data.user && data.session) {
        const profile = await fetchProfile(data.user.id, data.user.email || '');
        setUser(profile);
        setSession(data.session);
      }

      return {};
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Signup failed';
      return { error: message };
    }
  };

  const logout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isAuthenticated: !!user,
      isLoading,
      login,
      signup,
      logout
    }}>
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
