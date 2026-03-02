/**
 * Admin API 服务层（方案 B：直连 Supabase，无独立后端）
 * 所有操作通过 Supabase Service Role Key 完成
 */
import { supabase } from '../lib/supabase';

const ADMIN_SESSION_KEY = 'dopagen_admin_session';

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
// Admin Session 管理（基于 localStorage + 环境变量比对）
// ============================================

export function getAdminSession(): { username: string; exp: number } | null {
    try {
        const raw = localStorage.getItem(ADMIN_SESSION_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (parsed.exp < Date.now()) {
            localStorage.removeItem(ADMIN_SESSION_KEY);
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

export function setAdminToken(token: string): void {
    // 兼容旧接口：用 session 替代
    const session = { username: 'admin', exp: Date.now() + 8 * 60 * 60 * 1000, token };
    localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

export function clearAdminToken(): void {
    localStorage.removeItem(ADMIN_SESSION_KEY);
}

// ============================================
// API 方法（直连 Supabase）
// ============================================

export const adminApi = {
    // 认证：与前端配置的环境变量对比
    login: async (username: string, password: string): Promise<AdminLoginResponse> => {
        const validUser = import.meta.env.VITE_ADMIN_USERNAME || 'fever8';
        const validPass = import.meta.env.VITE_ADMIN_PASSWORD || '312151';

        if (username !== validUser || password !== validPass) {
            throw new Error('Invalid credentials');
        }

        const session = {
            username,
            exp: Date.now() + 8 * 60 * 60 * 1000, // 8 小时
            token: `admin_${Date.now()}`
        };
        localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));

        return {
            token: session.token,
            username,
            expiresIn: '8h'
        };
    },

    verify: async (): Promise<{ valid: boolean; username: string }> => {
        const session = getAdminSession();
        if (!session) throw new Error('No valid admin session');
        return { valid: true, username: session.username };
    },

    // 统计：直接查询 Supabase
    getStats: async (): Promise<AdminStats> => {
        const [usersRes, imagesRes, tasksRes, modelsRes] = await Promise.allSettled([
            supabase.from('profiles').select('id', { count: 'exact', head: true }),
            supabase.from('images').select('id', { count: 'exact', head: true }),
            supabase.from('generation_tasks').select('id', { count: 'exact', head: true }),
            supabase.from('custom_models').select('id', { count: 'exact', head: true }),
        ]);

        return {
            totalUsers: usersRes.status === 'fulfilled' ? (usersRes.value.count ?? 0) : 0,
            totalImages: imagesRes.status === 'fulfilled' ? (imagesRes.value.count ?? 0) : 0,
            totalTasks: tasksRes.status === 'fulfilled' ? (tasksRes.value.count ?? 0) : 0,
            totalModels: modelsRes.status === 'fulfilled' ? (modelsRes.value.count ?? 0) : 0,
        };
    },

    // 模型管理：直连 custom_models 表
    getModels: async (): Promise<AdminModel[]> => {
        const { data, error } = await supabase
            .from('custom_models')
            .select('*')
            .order('created_at', { ascending: false });
        if (error) throw new Error(error.message);
        return data || [];
    },

    createModel: async (data: Partial<AdminModel>): Promise<AdminModel> => {
        const { data: created, error } = await supabase
            .from('custom_models')
            .insert({
                name: data.name,
                version: data.version || '1.0',
                description: data.description,
                web_app_id: data.web_app_id,
                schema: data.schema,
                input_map: data.input_map,
                thumbnail_url: data.thumbnail_url,
                api_key: data.api_key,
                is_hidden: false,
                user_id: null, // null = 全局模型
            })
            .select()
            .single();
        if (error) throw new Error(error.message);
        return created;
    },

    updateModel: async (id: string, data: Partial<AdminModel>): Promise<AdminModel> => {
        const { data: updated, error } = await supabase
            .from('custom_models')
            .update({
                ...data,
                updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return updated;
    },

    deleteModel: async (id: string): Promise<{ message: string }> => {
        const { error } = await supabase
            .from('custom_models')
            .delete()
            .eq('id', id);
        if (error) throw new Error(error.message);
        return { message: 'Deleted' };
    },

    toggleModelVisibility: async (id: string): Promise<AdminModel> => {
        // 先读出当前状态
        const { data: current, error: fetchErr } = await supabase
            .from('custom_models')
            .select('is_hidden')
            .eq('id', id)
            .single();
        if (fetchErr) throw new Error(fetchErr.message);

        const { data: updated, error } = await supabase
            .from('custom_models')
            .update({ is_hidden: !current.is_hidden, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();
        if (error) throw new Error(error.message);
        return updated;
    },

    // 设置管理：读写 site_settings 表
    getSettings: async (): Promise<SiteSettings> => {
        const { data, error } = await supabase
            .from('site_settings')
            .select('key, value');

        if (error) {
            // 表不存在时返回默认值
            return { bizyairApiKey: '', loadingMessages: [] };
        }

        const settings: SiteSettings = { bizyairApiKey: '', loadingMessages: [] };
        (data || []).forEach((row: any) => {
            if (row.key === 'bizyairApiKey') settings.bizyairApiKey = row.value || '';
            if (row.key === 'loadingMessages') settings.loadingMessages = row.value || [];
        });
        return settings;
    },

    updateSettings: async (data: Partial<SiteSettings>): Promise<SiteSettings> => {
        const upserts = [];
        if (data.bizyairApiKey !== undefined) {
            upserts.push({ key: 'bizyairApiKey', value: data.bizyairApiKey, updated_at: new Date().toISOString() });
        }
        if (data.loadingMessages !== undefined) {
            upserts.push({ key: 'loadingMessages', value: data.loadingMessages, updated_at: new Date().toISOString() });
        }

        if (upserts.length > 0) {
            const { error } = await supabase
                .from('site_settings')
                .upsert(upserts, { onConflict: 'key' });
            if (error) throw new Error(error.message);
        }

        return adminApi.getSettings();
    },
};

// ============================================
// 公开 API（供主站前端使用，直连 Supabase）
// ============================================

export const publicApi = {
    /** 获取管理员配置的全局模型列表（user_id IS NULL） */
    getPublicModels: async (): Promise<AdminModel[]> => {
        const { data, error } = await supabase
            .from('custom_models')
            .select('*')
            .is('user_id', null)
            .eq('is_hidden', false)
            .order('created_at', { ascending: false });
        if (error) return [];
        return data || [];
    },

    /** 获取管理员配置的加载消息 */
    getPublicSettings: async (): Promise<{ loadingMessages: string[] }> => {
        const { data, error } = await supabase
            .from('site_settings')
            .select('value')
            .eq('key', 'loadingMessages');
        if (error || !data || data.length === 0) return { loadingMessages: [] };
        return { loadingMessages: data[0].value || [] };
    },
};
