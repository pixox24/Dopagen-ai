import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

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

const BIZYAIR_CREATE_TIMEOUT_MS = 90000;

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

const createAdminClient = (env: EnvLike): SupabaseClient | null => {
    const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
    const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !supabaseServiceKey) {
        return null;
    }

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        }
    });
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const buildPersistedParams = (
    params: unknown,
    patch: Record<string, unknown> = {}
): Record<string, unknown> => {
    return {
        ...(isRecord(params) ? params : {}),
        ...patch,
    };
};

const upsertGenerationTask = async (
    adminClient: SupabaseClient | null,
    payload: Record<string, unknown>
) => {
    if (!adminClient) {
        return;
    }

    try {
        await adminClient
            .from('generation_tasks')
            .upsert(payload, { onConflict: 'id' });
    } catch (error) {
        console.warn('[Generate API] Failed to persist generation task.', error);
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
        const adminClient = createAdminClient(env);
        const submittedAt = new Date().toISOString();

        await upsertGenerationTask(adminClient, {
            id: taskId,
            model_id: modelId,
            prompt,
            params: buildPersistedParams(params, {
                submissionState: 'submitting',
                submissionUpdatedAt: submittedAt,
            }),
            status: 'SUBMITTING',
            created_at: submittedAt,
        });

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
            await upsertGenerationTask(adminClient, {
                id: taskId,
                model_id: modelId,
                prompt,
                params: buildPersistedParams(params, {
                    submissionState: 'failed',
                    providerError: errText.substring(0, 300),
                    submissionUpdatedAt: new Date().toISOString(),
                }),
                status: 'FAILED',
            });
            return {
                status: 502,
                headers: CORS_HEADERS,
                body: { error: `BizyAir Error: ${errText.substring(0, 300)}` }
            };
        }

        const result = await response.json() as any;
        const requestId = result?.data?.request_id || result?.data?.requestId || result?.data?.task_id || result?.request_id || result?.requestId || result?.task_id;

        if (!requestId) {
            await upsertGenerationTask(adminClient, {
                id: taskId,
                model_id: modelId,
                prompt,
                params: buildPersistedParams(params, {
                    submissionState: 'failed',
                    providerError: 'BizyAir missing requestId in payload',
                    submissionUpdatedAt: new Date().toISOString(),
                }),
                status: 'FAILED',
            });
            return {
                status: 502,
                headers: CORS_HEADERS,
                body: { error: 'BizyAir missing requestId in payload' }
            };
        }

        await upsertGenerationTask(adminClient, {
            id: taskId,
            model_id: modelId,
            prompt,
            params: buildPersistedParams(params, {
                providerRequestId: requestId,
                submissionState: 'accepted',
                submissionUpdatedAt: new Date().toISOString(),
            }),
            status: 'QUEUED',
        });

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

        const { taskId, modelId, prompt, params } = body || {};
        const adminClient = createAdminClient(env);
        const message = error?.message || 'Unknown error';

        if (taskId && params) {
            await upsertGenerationTask(adminClient, {
                id: taskId,
                model_id: modelId,
                prompt,
                params: buildPersistedParams(params, {
                    submissionState: message.includes('timed out') ? 'waiting_for_provider_ack' : 'error',
                    providerError: String(message).substring(0, 300),
                    submissionUpdatedAt: new Date().toISOString(),
                }),
                status: message.includes('timed out') ? 'SUBMITTING' : 'FAILED',
            });
        }

        if (taskId && message.includes('BizyAir create request timed out')) {
            return {
                status: 202,
                headers: CORS_HEADERS,
                body: {
                    success: true,
                    taskId,
                    status: 'PENDING',
                    recoverable: true,
                    submittedParams: params,
                    message: 'BizyAir accepted the request slowly. Keep polling this task by taskId while the provider returns its requestId.'
                }
            };
        }

        return {
            status: 500,
            headers: CORS_HEADERS,
            body: { error: `Internal server proxy error: ${message}` }
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
