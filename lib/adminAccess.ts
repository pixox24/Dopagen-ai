import type { User } from '../context/AuthContext';

const ADMIN_SESSION_STORAGE_KEY = 'dopagen_admin_session';
const TEMP_ADMIN_USERNAME = 'fever8';
const TEMP_ADMIN_PASSWORD = '312151';

type AdminSession = {
  username: string;
  grantedAt: string;
  source: 'temp_credentials';
};

const canUseStorage = () => typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';

export const isRoleAdmin = (user: User | null): boolean => {
  return user?.role?.toLowerCase() === 'admin';
};

export const getStoredAdminSession = (): AdminSession | null => {
  if (!canUseStorage()) return null;

  try {
    const raw = window.localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as AdminSession;
    if (!parsed?.username || !parsed?.grantedAt) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const hasAdminAccess = (user: User | null): boolean => {
  return isRoleAdmin(user) || !!getStoredAdminSession();
};

export const grantTempAdminAccess = (username: string, password: string): { success: boolean; error?: string } => {
  if (username !== TEMP_ADMIN_USERNAME || password !== TEMP_ADMIN_PASSWORD) {
    return { success: false, error: 'Invalid admin credentials' };
  }

  if (!canUseStorage()) {
    return { success: false, error: 'Storage is unavailable in this browser context' };
  }

  const session: AdminSession = {
    username,
    grantedAt: new Date().toISOString(),
    source: 'temp_credentials'
  };

  window.localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
  return { success: true };
};

export const revokeTempAdminAccess = () => {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
};

export const getCurrentAdminLabel = (user: User | null): string => {
  if (isRoleAdmin(user)) {
    return user?.username || 'System Admin';
  }

  const session = getStoredAdminSession();
  return session?.username || 'Admin';
};
