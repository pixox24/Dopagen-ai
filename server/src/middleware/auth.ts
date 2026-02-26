import { Request, Response, NextFunction } from 'express';
import { supabase, supabaseAuth } from '../supabase';

// 扩展 Express Request 类型
declare global {
    namespace Express {
        interface Request {
            userId?: string;
            userRole?: string;
        }
    }
}

/**
 * 验证用户身份的中间件
 * 从 Authorization header 中提取 Bearer token，使用 Supabase 验证
 */
export const authenticate = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return;
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        // 使用 Anon Key 客户端验证 Token 更符合 Auth 逻辑
        const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

        if (error || !user) {
            console.warn('[Auth] Token Validation Failed:', error?.message);
            res.status(401).json({ error: 'Invalid or expired token' });
            return;
        }

        // 查询用户 profile 获取角色
        // 这里使用 service role 的 supabase 客户端来查询 profile，避免 RLS 限制（虽然用户查自己也没问题）
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

/**
 * 管理员权限中间件（需先经过 authenticate）
 */
export const requireAdmin = (req: Request, res: Response, next: NextFunction): void => {
    if (req.userRole !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }
    next();
};

/**
 * 可选认证：有 token 则验证，无 token 也放行
 */
export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        next();
        return;
    }

    const token = authHeader.replace('Bearer ', '');

    try {
        const { data: { user } } = await supabaseAuth.auth.getUser(token);
        if (user) {
            req.userId = user.id;
        }
    } catch (_) {
        // 可选认证，忽略错误
    }

    next();
};
