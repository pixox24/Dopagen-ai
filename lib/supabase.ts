import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabaseProjectRef = (() => {
    try {
        return supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : '';
    } catch {
        return '';
    }
})();

export const supabaseAuthStorageKey = supabaseProjectRef ? `sb-${supabaseProjectRef}-auth-token` : 'supabase.auth.token';

export const clearSupabaseAuthStorage = () => {
    if (typeof window === 'undefined') {
        return;
    }

    try {
        window.localStorage.removeItem(supabaseAuthStorageKey);
        window.localStorage.removeItem(`${supabaseAuthStorageKey}-user`);
        window.localStorage.removeItem(`${supabaseAuthStorageKey}-code-verifier`);
    } catch (error) {
        console.warn('[Supabase] Failed to clear persisted auth storage.', error);
    }
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: supabaseAuthStorageKey,
    }
});
