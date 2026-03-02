/**
 * Admin API 服务层
 * 所有 Admin 操作通过后端 API 完成，不再直接操作数据库
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const ADMIN_TOKEN_KEY = 'dopagen_admin_token';

function getAdminToken(): string | null {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string): void {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken(): void {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
}

async function adminFetch<T = any>(path: string, options?: RequestInit): Promise<T> {
    const token = getAdminToken();
    const res = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options?.headers,
        },
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(err.error || `Request failed (${res.status})`);
    }

    return res.json();
}

// ============================================
// 类型定义
// ============================================

export interface AdminLoginResponse {
    token: string;
    username: string;
    expiresIn: string;
}

export interface AdminStats {
    totalUsers: number;
    totalImages: number;
    totalTasks: number;
    totalModels: number;
}

export interface AdminModel {
    id: string;
    name: string;
    version?: string;
    description?: string;
    web_app_id?: string | number;
    schema?: any;
    input_map?: any;
    thumbnail_url?: string;
    api_key?: string;
    is_hidden: boolean;
    user_id?: string | null;
    created_at: string;
    updated_at?: string;
}

export interface SiteSettings {
    bizyairApiKey: string;
    loadingMessages: string[];
}

// ============================================
// API 方法
// ============================================

export const adminApi = {
    // 认证
    login: (username: string, password: string) =>
        adminFetch<AdminLoginResponse>('/api/admin/login', {
            method: 'POST',
            body: JSON.stringify({ username, password }),
        }),

    verify: () =>
        adminFetch<{ valid: boolean; username: string }>('/api/admin/verify'),

    // 统计
    getStats: () =>
        adminFetch<AdminStats>('/api/admin/stats'),

    // 模型管理
    getModels: () =>
        adminFetch<AdminModel[]>('/api/admin/models'),

    createModel: (data: Partial<AdminModel>) =>
        adminFetch<AdminModel>('/api/admin/models', {
            method: 'POST',
            body: JSON.stringify(data),
        }),

    updateModel: (id: string, data: Partial<AdminModel>) =>
        adminFetch<AdminModel>(`/api/admin/models/${id}`, {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),

    deleteModel: (id: string) =>
        adminFetch<{ message: string }>(`/api/admin/models/${id}`, {
            method: 'DELETE',
        }),

    toggleModelVisibility: (id: string) =>
        adminFetch<AdminModel>(`/api/admin/models/${id}/toggle`, {
            method: 'PATCH',
        }),

    // 设置
    getSettings: () =>
        adminFetch<SiteSettings>('/api/admin/settings'),

    updateSettings: (data: Partial<SiteSettings>) =>
        adminFetch<SiteSettings>('/api/admin/settings', {
            method: 'PATCH',
            body: JSON.stringify(data),
        }),
};

// ============================================
// 公开 API（无需认证，供主站前端使用）
// ============================================

export const publicApi = {
    /** 获取管理员配置的全局模型列表 */
    getPublicModels: () =>
        adminFetch<AdminModel[]>('/api/public/models'),

    /** 获取管理员配置的加载消息 */
    getPublicSettings: () =>
        adminFetch<{ loadingMessages: string[] }>('/api/public/settings'),
};
