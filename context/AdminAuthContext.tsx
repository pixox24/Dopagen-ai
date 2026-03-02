import React, { createContext, useContext, useState, useEffect } from 'react';
import { adminApi, clearAdminToken, getAdminSession } from '../services/adminApi';

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

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
    const [adminUsername, setAdminUsername] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // 启动时直接检查 localStorage 中的 session（无需网络请求）
    useEffect(() => {
        const session = getAdminSession();
        if (session) {
            setIsAdminAuthenticated(true);
            setAdminUsername(session.username);
        }
        setIsLoading(false);
    }, []);

    const adminLogin = async (username: string, password: string): Promise<{ success: boolean; error?: string }> => {
        try {
            const result = await adminApi.login(username, password);
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
