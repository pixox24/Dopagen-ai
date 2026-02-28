import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl) {
    console.warn('[Supabase] Warning: SUPABASE_URL is not set. Please check your server .env file.');
}
if (!supabaseServiceKey) {
    console.warn('[Supabase] Warning: SUPABASE_SERVICE_KEY is not set. Database features will be disabled.');
}
if (!supabaseAnonKey) {
    console.warn('[Supabase] Warning: SUPABASE_ANON_KEY is not set. Token verification will fail.');
}

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

export const supabaseAuth: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

export const isSupabaseConfigured = (): boolean => {
    return !!supabaseUrl && !!supabaseServiceKey;
};
