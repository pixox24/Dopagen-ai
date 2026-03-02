import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

// Add a check to confirm env loading
if (!supabaseUrl) {
    console.warn('[Supabase] Warning: SUPABASE_URL is not set. Please check your .env file in the server directory.');
}
if (!supabaseServiceKey) {
    console.warn('[Supabase] Warning: SUPABASE_SERVICE_KEY is not set. Database features will be disabled.');
}

// Initializing Supabase client with Service Role Key for admin operations
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

// 初始化 Supabase Auth 客户端（用于 Token 验证）
// 严禁回退到 Service Key —— 这会导致灾难性的权限提升
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
if (!supabaseAnonKey && supabaseUrl) {
    console.error('[致命错误] SUPABASE_ANON_KEY 未设置。绝不能将 Service Role Key 用作 Anon Key 的回退。');
}
export const supabaseAuth: SupabaseClient = createClient(
    supabaseUrl,
    supabaseAnonKey || '',
    { auth: { autoRefreshToken: false, persistSession: false } }
);

export const isSupabaseConfigured = (): boolean => {
    return !!supabaseUrl && !!supabaseServiceKey;
};
