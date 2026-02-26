import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

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

  // 获取用户 profile 信息
  const fetchProfile = async (userId: string, email: string): Promise<User | null> => {
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
    } catch (err) {
      console.error('[Auth] Fetch profile unexpected error:', err);
      return null;
    }
  };

  // 初始化：检查现有 session
  useEffect(() => {
    const init = async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();

        if (existingSession?.user) {
          setSession(existingSession);
          const profile = await fetchProfile(existingSession.user.id, existingSession.user.email || '');
          setUser(profile);
        }
      } catch (err) {
        console.error('[Auth] Init error:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    // 设置超时，避免无限加载
    const timeoutId = setTimeout(() => {
      setIsLoading(false);
    }, 3000);
    
    init();
    
    return () => clearTimeout(timeoutId);

    // 监听认证状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, newSession) => {
      setSession(newSession);
      if (newSession?.user) {
        const profile = await fetchProfile(newSession.user.id, newSession.user.email || '');
        setUser(profile);
      } else {
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

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
    } catch (err: any) {
      return { error: err.message || 'Login failed' };
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
    } catch (err: any) {
      return { error: err.message || 'Signup failed' };
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
