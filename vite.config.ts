import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import vercel from 'vite-plugin-vercel';
import { handleGenerateRequest } from './api/generate';
import { handleStatusRequest } from './api/status';

const readJsonBody = async (req: NodeJS.ReadableStream): Promise<any> => {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  const rawBody = Buffer.concat(chunks).toString('utf8');
  return rawBody ? JSON.parse(rawBody) : {};
};

const createDevApiPlugin = (env: Record<string, string>) => ({
  name: 'local-api-routes',
  configureServer(server: any) {
    server.middlewares.use(async (req: any, res: any, next: () => void) => {
      if (!req.url?.startsWith('/api/')) {
        return next();
      }

      try {
        const pathname = req.url.split('?')[0];
        const body = await readJsonBody(req);

        const result = pathname === '/api/generate'
          ? await handleGenerateRequest(req.method, body, env)
          : pathname === '/api/status'
            ? await handleStatusRequest(req.method, body, env)
            : null;

        if (!result) {
          return next();
        }

        Object.entries(result.headers || {}).forEach(([key, value]) => {
          res.setHeader(key, value);
        });

        res.statusCode = result.status;
        if (result.body === undefined) {
          res.end();
          return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(result.body));
      } catch (error: any) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
          error: `Local API middleware error: ${error?.message || 'Unknown error'}`
        }));
      }
    });
  }
});

const getManualChunk = (id: string) => {
  const normalizedId = id.replace(/\\/g, '/');

  if (!normalizedId.includes('/node_modules/')) {
    return undefined;
  }

  if (
    normalizedId.includes('/@lottiefiles/dotlottie-react/') ||
    normalizedId.includes('/dotlottie-web/')
  ) {
    return 'vendor-lottie';
  }

  if (normalizedId.includes('/@supabase/supabase-js/')) {
    return 'vendor-supabase';
  }

  if (
    normalizedId.includes('/react-router-dom/') ||
    normalizedId.includes('/react-router/')
  ) {
    return 'vendor-router';
  }

  if (
    normalizedId.includes('/react-dom/') ||
    normalizedId.includes('/react/') ||
    normalizedId.includes('/scheduler/')
  ) {
    return 'vendor-react';
  }

  if (normalizedId.includes('/localforage/')) {
    return 'vendor-offline-store';
  }

  if (normalizedId.includes('/browser-image-compression/')) {
    return 'vendor-image-utils';
  }

  return undefined;
};

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  process.env.BIZYAIR_API_KEY = env.BIZYAIR_API_KEY;
  process.env.VITE_SUPABASE_URL = env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_ANON_KEY = env.VITE_SUPABASE_ANON_KEY;
  process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

  return {
    server: {
      port: 3000,
      host: '0.0.0.0',
      watch: {
        usePolling: true
      }
    },
    plugins: [react(), createDevApiPlugin(process.env as Record<string, string>), vercel()],
    define: {
      'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      'process.env.BIZYAIR_API_KEY': JSON.stringify(env.BIZYAIR_API_KEY),
      'process.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL),
      'process.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.VITE_SUPABASE_ANON_KEY),
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: getManualChunk,
        }
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      }
    }
  };
});
