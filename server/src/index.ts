import express, { Request, Response } from 'express';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Route imports
import authRoutes from './routes/auth';
import imageRoutes from './routes/images';
import taskRoutes from './routes/tasks';
import modelRoutes from './routes/models';
import { isSupabaseConfigured } from './supabase';

const app = express();
const PORT = process.env.PORT || 3001;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

const isAllowedOrigin = (origin?: string): boolean => {
    if (!origin) return true; // Allow non-browser clients and same-origin requests.
    return ALLOWED_ORIGINS.includes(origin);
};

// ============================================
// Middleware
// ============================================

// 1. Manually handle Preflight/OPTIONS to ensure PNA header is sent.
// The 'cors' package sometimes doesn't play nice with PNA headers on preflight.
app.options('*', (req, res) => {
    const origin = req.headers.origin as string | undefined;
    if (!isAllowedOrigin(origin)) {
        res.sendStatus(403);
        return;
    }
    if (origin) {
        res.header('Access-Control-Allow-Origin', origin);
        res.header('Vary', 'Origin');
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
    res.header('Access-Control-Allow-Credentials', 'true');
    // Critical for Private Network Access (Public IP -> Localhost)
    res.header('Access-Control-Allow-Private-Network', 'true');
    res.sendStatus(204);
});

// 2. Standard CORS for other requests
app.use(cors({
    origin: function (origin, callback) {
        if (isAllowedOrigin(origin)) return callback(null, true);
        return callback(new Error('CORS origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
}));

// 3. Ensure PNA header is also on actual responses (GET/POST)
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Private-Network', 'true');
    next();
});

app.use(express.json({ limit: '2mb' }));
app.use(morgan('dev'));

// ============================================
// API Routes
// ============================================
app.use('/api/auth', authRoutes);
app.use('/api/images', imageRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/models', modelRoutes);

app.use((err: Error, _req: Request, res: Response, next: any) => {
    if (err.message === 'CORS origin not allowed') {
        res.status(403).json({ error: 'CORS origin not allowed' });
        return;
    }
    next(err);
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
app.use((err: Error, _req: Request, res: Response, _next: any) => {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================
// Start Server
// ============================================
app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`\n⚡️ [Server]: Running at http://localhost:${PORT}`);
    console.log(`   [Network]: Access via http://<YOUR_IP>:${PORT}`);
    console.log(`   [Database]: ${isSupabaseConfigured() ? 'Supabase Connected' : 'Not Configured'}`);
    console.log(`   [Routes]: /api/auth, /api/images, /api/tasks, /api/models`);
});
