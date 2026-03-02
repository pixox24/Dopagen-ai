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

        if (!email || !password || !username) {
            res.status(400).json({ error: 'Email, password and username are required' });
            return;
        }

        // 输入校验：email 格式、密码长度、用户名规范
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            res.status(400).json({ error: 'Invalid email format' });
            return;
        }
        if (typeof password !== 'string' || password.length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters' });
            return;
        }
        if (typeof username !== 'string' || username.length < 2 || username.length > 30) {
            res.status(400).json({ error: 'Username must be 2-30 characters' });
            return;
        }
        // 用户名只允许字母、数字、下划线、中文
        const usernameRegex = /^[\w\u4e00-\u9fff]+$/;
        if (!usernameRegex.test(username)) {
            res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, and Chinese characters' });
            return;
        }

        // 检查用户名唯一性
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
            email_confirm: true,
            user_metadata: { username }
        });

        if (error) {
            res.status(400).json({ error: error.message });
            return;
        }

        // 不再在服务端执行 signInWithPassword，避免 Service Role 客户端上的 Session 泄漏
        // 返回用户信息，由前端自行登录
        res.status(201).json({
            user: {
                id: data.user.id,
                email: data.user.email,
                username
            },
            message: 'Registration successful. Please login.'
        });
    } catch (err: unknown) {
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

        // 基本格式校验
        if (typeof email !== 'string' || typeof password !== 'string') {
            res.status(400).json({ error: 'Invalid input types' });
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
    } catch (err: unknown) {
        console.error('[Auth] Login error:', err);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * POST /api/auth/logout
 * 用户登出
 */
router.post('/logout', authenticate, async (_req: Request, res: Response) => {
    try {
        res.json({ message: 'Logged out successfully' });
    } catch (_err: unknown) {
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
    } catch (_err: unknown) {
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

export default router;
