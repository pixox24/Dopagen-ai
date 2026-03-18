import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Utils deduplicate and collect arrays of URLs
const dedupe = (arr: string[]) => [...new Set(arr.filter(Boolean))];

const collectImages = (v: any, urls: string[] = [], seen = new Set<any>()): string[] => {
    if (v == null || typeof v !== 'object' || seen.has(v)) {
        if (typeof v === 'string') {
            const n = v.trim().toLowerCase();
            if (n.startsWith('http://') || n.startsWith('https://') || n.startsWith('data:image/')) urls.push(v);
        }
        return urls;
    }
    seen.add(v);
    const items = Array.isArray(v) ? v : Object.values(v);
    items.forEach(item => collectImages(item, urls, seen));
    return urls;
};

type EnvLike = Record<string, string | undefined>;

interface HandlerResult {
    status: number;
    body?: unknown;
    headers?: Record<string, string>;
}

interface FailurePayload {
    error: string;
    failureCode: 'timeout' | 'invalid_input' | 'quota' | 'provider_error' | 'network' | 'cancelled' | 'empty_output' | 'unknown';
    failureHint: string;
    failureDetail?: string;
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const BIZYAIR_DETAIL_TIMEOUT_MS = 15000;
const BIZYAIR_OUTPUTS_TIMEOUT_MS = 20000;

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
            throw new Error(`BizyAir status request timed out after ${Math.round(timeoutMs / 1000)} seconds`);
        }
        throw error;
    } finally {
        clearTimeout(timeoutId);
    }
};

const normalizeProviderMessage = (value: unknown) => {
    if (typeof value !== 'string') {
        return '';
    }

    return value.replace(/\s+/g, ' ').trim();
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

const mapProgressStage = (bizyStatus: string) => {
    const normalized = bizyStatus.toLowerCase();

    if (normalized.includes('queu')) {
        return {
            stage: 'queued' as const,
            progress: 12,
            status: 'QUEUED' as const,
        };
    }

    if (
        normalized.includes('prepar') ||
        normalized.includes('alloc') ||
        normalized.includes('init') ||
        normalized.includes('warm')
    ) {
        return {
            stage: 'preparing' as const,
            progress: 38,
            status: 'PROCESSING' as const,
        };
    }

    return {
        stage: 'generating' as const,
        progress: 72,
        status: 'PROCESSING' as const,
    };
};

const classifyFailure = (rawError: unknown, bizyStatus: string): FailurePayload => {
    const detail = normalizeProviderMessage(rawError);
    const normalized = `${bizyStatus} ${detail}`.toLowerCase();

    if (bizyStatus === 'Canceled' || normalized.includes('cancel')) {
        return {
            error: 'Generation was cancelled before the result was returned.',
            failureCode: 'cancelled',
            failureHint: 'Start a new generation when you are ready.',
            failureDetail: detail || 'The provider reported that the task was cancelled.',
        };
    }

    if (normalized.includes('timeout') || normalized.includes('timed out') || normalized.includes('deadline')) {
        return {
            error: 'The image service took too long to finish this request.',
            failureCode: 'timeout',
            failureHint: 'Try again with 1K quality or a simpler prompt.',
            failureDetail: detail || 'The provider timed out while generating the image.',
        };
    }

    if (
        normalized.includes('quota') ||
        normalized.includes('rate limit') ||
        normalized.includes('too many') ||
        normalized.includes('capacity') ||
        normalized.includes('limit exceeded')
    ) {
        return {
            error: 'The image service is busy or your request hit a temporary limit.',
            failureCode: 'quota',
            failureHint: 'Wait a moment and try again, or switch to another model.',
            failureDetail: detail || 'The provider rejected the request because of capacity limits.',
        };
    }

    if (
        normalized.includes('no parsable image') ||
        normalized.includes('no image url') ||
        normalized.includes('empty output') ||
        normalized.includes('no image returned')
    ) {
        return {
            error: 'The model finished, but it did not return a usable image.',
            failureCode: 'empty_output',
            failureHint: 'Retry the task or switch to another model if it happens again.',
            failureDetail: detail || 'The provider returned success without an image URL.',
        };
    }

    if (
        normalized.includes('invalid') ||
        normalized.includes('required') ||
        normalized.includes('parameter') ||
        normalized.includes('schema') ||
        normalized.includes('prompt') ||
        normalized.includes('reference image') ||
        normalized.includes('input')
    ) {
        return {
            error: 'Some generation settings were rejected by the model.',
            failureCode: 'invalid_input',
            failureHint: 'Check your prompt, reference images, and model parameters, then try again.',
            failureDetail: detail || 'The provider reported invalid input settings.',
        };
    }

    if (
        normalized.includes('network') ||
        normalized.includes('connection') ||
        normalized.includes('gateway') ||
        normalized.includes('proxy') ||
        normalized.includes('502') ||
        normalized.includes('503') ||
        normalized.includes('504')
    ) {
        return {
            error: 'The connection to the image service failed during generation.',
            failureCode: 'network',
            failureHint: 'Retry in a moment. If it keeps happening, lower the quality or switch models.',
            failureDetail: detail || 'The provider reported a network or gateway failure.',
        };
    }

    return {
        error: 'The image service failed before it could return a result.',
        failureCode: detail ? 'provider_error' : 'unknown',
        failureHint: 'Retry the task. If the same model keeps failing, switch to another one.',
        failureDetail: detail || 'No additional provider detail was returned.',
    };
};

export async function handleStatusRequest(method: string | undefined, body: any, env: EnvLike = process.env): Promise<HandlerResult> {
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
    const SUPABASE_URL = env.VITE_SUPABASE_URL || env.SUPABASE_URL || '';
    const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY || '';

    if (!BIZYAIR_API_KEY) {
        return {
            status: 500,
            headers: CORS_HEADERS,
            body: { error: 'Server config error: Missing BIZYAIR_API_KEY' }
        };
    }

    const { requestId, taskId, taskDetails } = body || {};
    if (!requestId && !taskId) {
        return {
            status: 400,
            headers: CORS_HEADERS,
            body: { error: 'Missing requestId or taskId' }
        };
    }

    try {
        const supabase = SUPABASE_URL && SUPABASE_KEY
            ? createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: { autoRefreshToken: false, persistSession: false }
            })
            : null;
        let effectiveRequestId = typeof requestId === 'string' ? requestId : '';

        if (taskId && supabase) {
            const { data: persistedTask } = await supabase
                .from('generation_tasks')
                .select('status,result_url,params')
                .eq('id', taskId)
                .maybeSingle();

            const persistedParams = isRecord(persistedTask?.params) ? persistedTask.params : {};
            const persistedRequestId = typeof persistedParams.providerRequestId === 'string'
                ? persistedParams.providerRequestId
                : typeof persistedParams.requestId === 'string'
                    ? persistedParams.requestId
                    : '';

            if (!effectiveRequestId && persistedRequestId) {
                effectiveRequestId = persistedRequestId;
            }

            if (persistedTask?.status === 'COMPLETED' && persistedTask.result_url) {
                return {
                    status: 200,
                    headers: CORS_HEADERS,
                    body: {
                        requestId: effectiveRequestId || persistedRequestId || undefined,
                        status: 'COMPLETED',
                        resultUrl: persistedTask.result_url,
                        images: [persistedTask.result_url],
                        progress: 100,
                        stage: 'completed',
                        bizyStatus: 'Success',
                        queueCount: 0,
                    }
                };
            }

            if (persistedTask?.status === 'FAILED') {
                const failure = classifyFailure(
                    persistedParams.providerError || 'The provider failed before returning a result.',
                    'Failed'
                );

                return {
                    status: 200,
                    headers: CORS_HEADERS,
                    body: {
                        requestId: effectiveRequestId || persistedRequestId || undefined,
                        status: 'FAILED',
                        stage: 'failed',
                        progress: 100,
                        bizyStatus: 'Failed',
                        queueCount: -1,
                        ...failure,
                    }
                };
            }

            if (!effectiveRequestId) {
                const persistedStatus = persistedTask?.status || 'SUBMITTING';
                const normalizedStatus = String(persistedStatus).toUpperCase();
                const isPreparing = normalizedStatus === 'PROCESSING';
                const providerLabel = normalizedStatus === 'SUBMITTING'
                    ? 'Submitting'
                    : isPreparing
                        ? 'Preparing'
                        : 'Queued';

                return {
                    status: 200,
                    headers: CORS_HEADERS,
                    body: {
                        requestId: undefined,
                        status: isPreparing ? 'PROCESSING' : 'QUEUED',
                        progress: normalizedStatus === 'SUBMITTING' ? 6 : isPreparing ? 20 : 10,
                        stage: normalizedStatus === 'SUBMITTING' ? 'queued' : isPreparing ? 'preparing' : 'queued',
                        bizyStatus: providerLabel,
                        queueCount: -1,
                    }
                };
            }
        }

        if (!effectiveRequestId) {
            return {
                status: 200,
                headers: CORS_HEADERS,
                body: {
                    requestId: undefined,
                    status: 'QUEUED',
                    progress: 6,
                    stage: 'queued',
                    bizyStatus: 'Submitting',
                    queueCount: -1,
                }
            };
        }

        const detailRes = await fetchWithTimeout(
            `https://api.bizyair.cn/w/v1/webapp/task/openapi/detail?requestId=${encodeURIComponent(effectiveRequestId)}`,
            {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${BIZYAIR_API_KEY}` },
            },
            BIZYAIR_DETAIL_TIMEOUT_MS
        );

        if (!detailRes.ok) {
            return {
                status: 502,
                headers: CORS_HEADERS,
                body: { error: 'BizyAir status api error' }
            };
        }

        const detail = await detailRes.json() as any;
        const data = detail?.data || {};
        const bizyStatus = data.status || 'Preparing';
        const queueInfo = data.queue_info || data.queueInfo || {};
        const queueCount = queueInfo.queue_count ?? queueInfo.queueCount ?? -1;

        if (bizyStatus === 'Success') {
            const outputsRes = await fetchWithTimeout(
                `https://api.bizyair.cn/w/v1/webapp/task/openapi/outputs?requestId=${encodeURIComponent(effectiveRequestId)}`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${BIZYAIR_API_KEY}` }
                },
                BIZYAIR_OUTPUTS_TIMEOUT_MS
            );

            if (!outputsRes.ok) {
                return {
                    status: 502,
                    headers: CORS_HEADERS,
                    body: { error: 'BizyAir outputs fetch error' }
                };
            }

            const outputs = await outputsRes.json();
            const images = dedupe(collectImages(outputs));
            const resultUrl = images[0];

            if (!resultUrl) {
                const failure = classifyFailure('No parsable image URLs were returned from a successful provider response.', bizyStatus);
                return {
                    status: 200,
                    headers: CORS_HEADERS,
                    body: {
                        requestId,
                        status: 'FAILED',
                        stage: 'failed',
                        progress: 95,
                        bizyStatus,
                        queueCount,
                        ...failure,
                    }
                };
            }

            if (supabase && taskId && taskDetails) {
                void (async () => {
                    try {
                        await supabase
                            .from('generation_tasks')
                            .upsert({
                                id: taskId,
                                user_id: taskDetails.userId || null,
                                model_id: taskDetails.modelId,
                                prompt: taskDetails.prompt,
                                params: buildPersistedParams(taskDetails.params, {
                                    providerRequestId: effectiveRequestId,
                                    submissionState: 'accepted',
                                    submissionUpdatedAt: new Date().toISOString(),
                                }),
                                status: 'COMPLETED',
                                result_url: resultUrl,
                                created_at: new Date().toISOString(),
                            }, { onConflict: 'id' });
                    } catch (dbErr) {
                        console.error('Failed lazy persistence to Supabase:', dbErr);
                    }
                })();
            }

            return {
                    status: 200,
                    headers: CORS_HEADERS,
                    body: {
                    requestId: effectiveRequestId,
                    status: 'COMPLETED',
                    resultUrl,
                    images,
                    progress: 100,
                    stage: 'completed',
                    bizyStatus: 'Success',
                    queueCount,
                }
            };
        }

        if (bizyStatus === 'Failed' || bizyStatus === 'Canceled') {
            const failure = classifyFailure(
                data.error_message || detail?.error_message || `BizyAir error: ${bizyStatus}`,
                bizyStatus
            );

            if (supabase && taskId && taskDetails) {
                void (async () => {
                    try {
                        await supabase.from('generation_tasks').upsert({
                            id: taskId,
                            user_id: taskDetails.userId || null,
                            model_id: taskDetails.modelId,
                            prompt: taskDetails.prompt,
                            params: buildPersistedParams(taskDetails.params, {
                                providerRequestId: effectiveRequestId,
                                providerError: failure.failureDetail || failure.error,
                                submissionState: 'accepted',
                                submissionUpdatedAt: new Date().toISOString(),
                            }),
                            status: 'FAILED',
                        }, { onConflict: 'id' });
                    } catch {
                        // Ignore persistence failures so polling can still return the BizyAir error
                    }
                })();
            }

            return {
                status: 200,
                headers: CORS_HEADERS,
                body: {
                    requestId: effectiveRequestId,
                    status: bizyStatus === 'Canceled' ? 'CANCELLED' : 'FAILED',
                    stage: 'failed',
                    progress: 100,
                    bizyStatus,
                    queueCount,
                    ...failure,
                }
            };
        }

        const stageInfo = mapProgressStage(bizyStatus);

        return {
            status: 200,
            headers: CORS_HEADERS,
            body: {
                requestId: effectiveRequestId,
                status: stageInfo.status,
                progress: stageInfo.progress,
                stage: stageInfo.stage,
                bizyStatus,
                queueCount,
            }
        };
    } catch (error: any) {
        console.error('API Status Check Error:', error);
        return {
            status: 500,
            headers: CORS_HEADERS,
            body: { error: `Internal proxy server error: ${error?.message || 'Unknown error'}` }
        };
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const result = await handleStatusRequest(req.method, req.body, process.env);

    Object.entries(result.headers || {}).forEach(([key, value]) => {
        res.setHeader(key, value);
    });

    if (result.body === undefined) {
        return res.status(result.status).end();
    }

    return res.status(result.status).json(result.body);
}
