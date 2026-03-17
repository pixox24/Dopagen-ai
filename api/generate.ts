import type { VercelRequest, VercelResponse } from '@vercel/node';

type EnvLike = Record<string, string | undefined>;

interface HandlerResult {
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const BIZYAIR_CREATE_TIMEOUT_MS = 25000;

const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit, timeoutMs: number) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(input, {
            ...init,
            signal: controller.signal,
        });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`BizyAir create request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

export async function handleGenerateRequest(method: string | undefined, body: any, env: EnvLike = process.env): Promise<HandlerResult> {
    if (method === 'OPTIONS') {
        return {
            status: 200,
            headers: CORS_HEADERS
        };
    }

    if (method !== 'POST') {
        return {
            status: 405,
            headers: CORS_HEADERS,
            body: { error: 'Method not allowed' }
        };
    }

    const BIZYAIR_API_KEY = env.BIZYAIR_API_KEY || '';
    if (!BIZYAIR_API_KEY) {
        return {
            status: 500,
            headers: CORS_HEADERS,
            body: { error: 'Server config error: Missing BIZYAIR_API_KEY' }
        };
    }

    try {
        const { taskId, modelId, prompt, params } = body || {};

        if (!taskId || !modelId || !prompt || !params) {
            return {
                status: 400,
                headers: CORS_HEADERS,
                body: { error: 'Missing required fields' }
            };
        }

        const bizyPayload = {
            web_app_id: params.web_app_id,
            input_values: params.input_values,
        };

        const response = await fetchWithTimeout('https://api.bizyair.cn/w/v1/webapp/task/openapi/create', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${BIZYAIR_API_KEY}`,
                'X-Bizyair-Task-Async': 'enable',
            },
            body: JSON.stringify(bizyPayload)
        }, BIZYAIR_CREATE_TIMEOUT_MS);

        if (!response.ok) {
            const errText = await response.text();
            return {
                status: 502,
                headers: CORS_HEADERS,
                body: { error: `BizyAir Error: ${errText.substring(0, 300)}` }
            };
        }

        const result = await response.json() as any;
        const requestId = result?.data?.request_id || result?.data?.requestId || result?.data?.task_id || result?.request_id || result?.requestId || result?.task_id;

        if (!requestId) {
            return {
                status: 502,
                headers: CORS_HEADERS,
                body: { error: 'BizyAir missing requestId in payload' }
            };
        }

        return {
            status: 200,
            headers: CORS_HEADERS,
            body: {
                success: true,
                taskId,
                requestId,
                status: 'QUEUED'
            }
        };

    } catch (error: any) {
        console.error('API Generate Error:', error);
        return {
            status: 500,
            headers: CORS_HEADERS,
            body: { error: `Internal server proxy error: ${error?.message || 'Unknown error'}` }
        };
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const result = await handleGenerateRequest(req.method, req.body, process.env);

    Object.entries(result.headers || {}).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    if (result.body === undefined) {
        return res.status(result.status).end();
    }

    return res.status(result.status).json(result.body);
}
