import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config();

// Route imports
import authRoutes from './routes/auth';
import imageRoutes from './routes/images';
import taskRoutes from './routes/tasks';
import modelRoutes from './routes/models';
import adminRoutes from './routes/admin';
import { isSupabaseConfigured, supabase } from './supabase';
import { getSettings, getLoadingMessages } from './settings';

const app = express();
const PORT = process.env.PORT || 3001;

// ============================================
// Middleware
// ============================================

// 从环境变量读取允许的来源列表，严格限制跨域访问
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
    .split(',').map(s => s.trim());

// 1. 手动处理 Preflight/OPTIONS，确保 PNA 头部正确发送
app.options('*', (req, res) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    // 私有网络访问（Public IP -> Localhost）
    res.header('Access-Control-Allow-Private-Network', 'true');
    res.sendStatus(204);
});

// 2. 标准 CORS 配置：仅允许白名单来源
app.use(cors({
    origin: function (origin, callback) {
        // 无来源请求（如服务器间调用）仅在开发环境放行
        if (!origin) {
            return callback(null, process.env.NODE_ENV === 'development');
        }
        if (ALLOWED_ORIGINS.includes(origin)) {
            return callback(null, true);
        }
        callback(new Error(`CORS 策略拒绝来源: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// 3. Ensure PNA header is also on actual responses (GET/POST)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Private-Network', 'true');
    next();
});

// 限制 JSON 请求体大小，防止内存耗尽攻击（图片上传应使用 multipart/form-data）
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

// ============================================
// API Routes
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/models', modelRoutes);
app.use('/api/admin', adminRoutes);

// ============================================
// Public API（无需认证，供前端获取管理员配置的数据）
// ============================================

/** 获取全局可用模型（管理员上传的 + 未隐藏的） */
app.get('/api/public/models', async (_req, res) => {
    try {
        const { data, error } = await supabase
            .from('custom_models')
            .select('*')
            .eq('is_hidden', false)
            .order('created_at', { ascending: false });
        if (error) { res.json([]); return; }
        res.json(data || []);
    } catch {
        res.json([]);
    }
});

/** 获取前端加载消息（管理员可在后台自定义） */
app.get('/api/public/settings', (_req, res) => {
    res.json({ loadingMessages: getLoadingMessages() });
});

// ============================================
// Health Check
// ============================================
app.get('/health', (_req: Request, res: Response) => {
    res.json({
        status: 'ok',
        database: isSupabaseConfigured() ? 'SUPABASE' : 'NOT_CONFIGURED',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// 404 Handler
// ============================================
app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// ============================================
// Global Error Handler
// ============================================
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[Server Error]', err.message, err.stack);
    // 不向客户端暴露内部错误详情
    const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
    res.status(statusCode).json({ error: 'Internal server error' });
});

// ============================================
// Start Server
// ============================================
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`\n⚡️ [Server]: Running at http://localhost:${PORT}`);
    console.log(`   [Network]: Access via http://<YOUR_IP>:${PORT}`);
    console.log(`   [Database]: ${isSupabaseConfigured() ? 'Supabase Connected' : 'Not Configured'}`);
    console.log(`   [Routes]: /api/auth, /api/images, /api/tasks, /api/models, /api/admin`);
});
