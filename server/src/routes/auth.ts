import { Router, Request, Response } from 'express';
import { supabase } from '../supabase';
import { authenticate } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/signup
 * 用户注册
 */
router.post('/signup', async (req: Request, res: Response) => {
    try {
        const { email, password, username } = req.body;
        const shouldAutoConfirmEmail = process.env.NODE_ENV !== 'production';

        if (!email || !password || !username) {
            res.status(400).json({ error: 'Email, password and username are required' });
            return;
        }

        // 检查用户名唯一�?
        const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', username)
            .single();

        if (existing) {
            res.status(409).json({ error: 'Username already taken' });
            return;
        }

        // 创建 Supabase Auth 用户
        const { data, error } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: shouldAutoConfirmEmail, // 跳过邮件验证（开发环境）
            user_metadata: { username }
        });

        if (error) {
            res.status(400).json({ error: error.message });
            return;
        }

        // 直接登录获取 session
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (signInError) {
            res.status(400).json({ error: signInError.message });
            return;
        }

        res.status(201).json({
            user: {
                id: data.user.id,
                email: data.user.email,
                username
            },
            session: signInData.session
        });
    } catch (err: any) {
        console.error('[Auth] Signup error:', err);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/auth/login
 * 用户登录
 */
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            res.status(400).json({ error: 'Email and password are required' });
            return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            res.status(401).json({ error: 'Invalid email or password' });
            return;
        }

        // 获取 profile 信息
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();

        res.json({
            user: {
                id: data.user.id,
                email: data.user.email,
                username: profile?.username || data.user.email,
                avatar: profile?.avatar_url || '',
                role: profile?.role || 'user'
            },
            session: data.session
        });
    } catch (err: any) {
        console.error('[Auth] Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/auth/logout
 * 用户登出
 */
router.post('/logout', authenticate, async (req: Request, res: Response) => {
    try {
        // Supabase 无需服务端操作，客户端自行清�?session 即可
        res.json({ message: 'Logged out successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Logout failed' });
    }
});

/**
 * GET /api/auth/me
 * 获取当前用户信息
 */
router.get('/me', authenticate, async (req: Request, res: Response) => {
    try {
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', req.userId)
            .single();

        if (error || !profile) {
            res.status(404).json({ error: 'Profile not found' });
            return;
        }

        res.json({
            id: profile.id,
            username: profile.username,
            email: profile.email,
            avatar: profile.avatar_url,
            role: profile.role,
            createdAt: profile.created_at
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

export default router;

