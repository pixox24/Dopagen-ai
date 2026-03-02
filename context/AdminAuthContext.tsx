import React, { createContext, useContext, useState, useEffect } from 'react';

// 管理员认证上下文
// 独立于普通用户的 AuthContext，为 Admin 后台提供单独的登录鉴权

interface AdminAuthContextType {
    isAdminAuthenticated: boolean;
    adminUsername: string | null;
    adminLogin: (username: string, password: string) => { success: boolean; error?: string };
    adminLogout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType>({
    isAdminAuthenticated: false,
    adminUsername: null,
    adminLogin: () => ({ success: false }),
    adminLogout: () => { },
});

// 管理员凭据（临时硬编码，后续可迁移至数据库或环境变量）
const ADMIN_CREDENTIALS = [
    { username: 'fever8', password: '312151' },
];

const ADMIN_SESSION_KEY = 'dopagen_admin_session';

export const AdminAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);
    const [adminUsername, setAdminUsername] = useState<string | null>(null);

    // 初始化时检查本地会话
    useEffect(() => {
        try {
            const stored = sessionStorage.getItem(ADMIN_SESSION_KEY);
            if (stored) {
                const session = JSON.parse(stored);
                // 验证会话有效期（8小时）
                if (session.username && session.timestamp && Date.now() - session.timestamp < 8 * 60 * 60 * 1000) {
                    setIsAdminAuthenticated(true);
                    setAdminUsername(session.username);
                } else {
                    sessionStorage.removeItem(ADMIN_SESSION_KEY);
                }
            }
        } catch {
            sessionStorage.removeItem(ADMIN_SESSION_KEY);
        }
    }, []);

    const adminLogin = (username: string, password: string): { success: boolean; error?: string } => {
        const matched = ADMIN_CREDENTIALS.find(
            (cred) => cred.username === username && cred.password === password
        );

        if (matched) {
            setIsAdminAuthenticated(true);
            setAdminUsername(matched.username);
            // 存入 sessionStorage（关闭浏览器自动失效）
            sessionStorage.setItem(
                ADMIN_SESSION_KEY,
                JSON.stringify({ username: matched.username, timestamp: Date.now() })
            );
            return { success: true };
        }

        return { success: false, error: 'Invalid admin credentials' };
    };

    const adminLogout = () => {
        setIsAdminAuthenticated(false);
        setAdminUsername(null);
        sessionStorage.removeItem(ADMIN_SESSION_KEY);
    };

    return (
        <AdminAuthContext.Provider value={{ isAdminAuthenticated, adminUsername, adminLogin, adminLogout }}>
            {children}
        </AdminAuthContext.Provider>
    );
};

export const useAdminAuth = () => useContext(AdminAuthContext);
