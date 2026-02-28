import { Request, Response, NextFunction } from 'express';
import { supabase, supabaseAuth } from '../supabase';

declare global {
    namespace Express {
        interface Request {
            userId?: string;
            userRole?: string;
        }
    }
}

export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return;
    }

    const token = authHeader.slice('Bearer '.length);

    try {
        const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

        if (error || !user) {
            console.warn('[Auth] Token validation failed:', error?.message);
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }

        const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

        req.userId = user.id;
        req.userRole = profile?.role || 'user';
        next();
    } catch (err) {
        console.error('[Auth] Unexpected error during verification:', err);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (req.userRole !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
};

export const optionalAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
    }

    const token = authHeader.slice('Bearer '.length);

    try {
        const { data: { user } } = await supabaseAuth.auth.getUser(token);
        if (user) {
            req.userId = user.id;
        }
    } catch {
        // optional auth: ignore errors and continue
    }

    next();
};
