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

// Initializing Supabase Auth client (optional, but good for token verification)
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || supabaseServiceKey;
export const supabaseAuth: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = (): boolean => {
    return !!supabaseUrl && !!supabaseServiceKey;
};
