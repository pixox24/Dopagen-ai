import React, { createContext, useContext, useState, useEffect } from 'react';
import { adminApi, setAdminToken, clearAdminToken } from '../services/adminApi';

// ============================================
// 管理员认证上下文
// 通过后端 JWT 验证，不再在前端存储凭据
// ============================================

interface AdminAuthContextType {
    isAdminAuthenticated: boolean;
    adminUsername: string | null;
    isLoading: boolean;
    adminLogin: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
    adminLogout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
    isAdminAuthenticated: false,
    adminUsername: null,
    isLoading: true,
    adminLogin: async () => ({ success: false }),
    adminLogout: () => { },
});

const ADMIN_TOKEN_KEY = 'dopagen_admin_token';
const ADMIN_USER_KEY = 'dopagen_admin_user';

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
    const [adminUsername, setAdminUsername] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 启动时验证已存储的 token
    useEffect(() => {
        const verify = async () => {
            const token = localStorage.getItem(ADMIN_TOKEN_KEY);
            if (!token) {
                setIsLoading(false);
                return;
            }
            try {
                const result = await adminApi.verify();
                setIsAdminAuthenticated(true);
                setAdminUsername(result.username);
            } catch {
                // Token 无效或过期，清除
                localStorage.removeItem(ADMIN_TOKEN_KEY);
                localStorage.removeItem(ADMIN_USER_KEY);
            }
            setIsLoading(false);
        };
        verify();
    }, []);

    const adminLogin = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const result = await adminApi.login(username, password);
            setAdminToken(result.token);
            localStorage.setItem(ADMIN_USER_KEY, result.username);
            setIsAdminAuthenticated(true);
            setAdminUsername(result.username);
            return { success: true };
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Login failed';
            return { success: false, error: message };
        }
    };

    const adminLogout = () => {
        clearAdminToken();
        localStorage.removeItem(ADMIN_USER_KEY);
        setIsAdminAuthenticated(false);
        setAdminUsername(null);
    };

    return (
        <AdminAuthContext.Provider value={{ isAdminAuthenticated, adminUsername, isLoading, adminLogin, adminLogout }}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = () => useContext(AdminAuthContext);
