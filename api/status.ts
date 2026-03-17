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

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    const SUPABASE_KEY = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY || env.SUPABASE_ANON_KEY || '';

    if (!BIZYAIR_API_KEY) {
        return {
            status: 500,
            headers: CORS_HEADERS,
            body: { error: 'Server config error: Missing BIZYAIR_API_KEY' }
        };
    }

    const { requestId, taskId, taskDetails } = body || {};
    if (!requestId) {
        return {
            status: 400,
            headers: CORS_HEADERS,
            body: { error: 'Missing requestId' }
        };
    }

    try {
        const detailRes = await fetch(
            `https://api.bizyair.cn/w/v1/webapp/task/openapi/detail?requestId=${encodeURIComponent(requestId)}`,
            {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${BIZYAIR_API_KEY}` },
            }
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
            const outputsRes = await fetch(
                `https://api.bizyair.cn/w/v1/webapp/task/openapi/outputs?requestId=${encodeURIComponent(requestId)}`,
                {
                    method: 'GET',
                    headers: { 'Authorization': `Bearer ${BIZYAIR_API_KEY}` }
                }
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
                return {
                    status: 200,
                    headers: CORS_HEADERS,
                    body: {
                        requestId,
                        status: 'FAILED',
                        error: 'BizyAir indicated success, but no parsable image URLs were returned',
                        bizyStatus,
                        queueCount,
                    }
                };
            }

            if (SUPABASE_URL && SUPABASE_KEY && taskId && taskDetails) {
                const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { autoRefreshToken: false, persistSession: false }
                });

                void (async () => {
                    try {
                        await supabase
                            .from('generation_tasks')
                            .upsert({
                                id: taskId,
                                user_id: taskDetails.userId || null,
                                model_id: taskDetails.modelId,
                                prompt: taskDetails.prompt,
                                params: taskDetails.params,
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
                    requestId,
                    status: 'COMPLETED',
                    resultUrl,
                    images,
                    progress: 100,
                    bizyStatus: 'Success',
                    queueCount,
                }
            };
        }

        if (bizyStatus === 'Failed' || bizyStatus === 'Canceled') {
            const errorMsg = data.error_message || detail?.error_message || `BizyAir error: ${bizyStatus}`;

            if (SUPABASE_URL && SUPABASE_KEY && taskId && taskDetails) {
                const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: { autoRefreshToken: false, persistSession: false }
                });

                void (async () => {
                    try {
                        await supabase.from('generation_tasks').upsert({
                            id: taskId,
                            user_id: taskDetails.userId || null,
                            model_id: taskDetails.modelId,
                            prompt: taskDetails.prompt,
                            params: taskDetails.params,
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
                    requestId,
                    status: bizyStatus === 'Canceled' ? 'CANCELLED' : 'FAILED',
                    error: errorMsg,
                    bizyStatus,
                    queueCount,
                }
            };
        }

        const progress = bizyStatus === 'Queuing' ? 10 : bizyStatus === 'Preparing' ? 35 : 80;

        return {
            status: 200,
            headers: CORS_HEADERS,
            body: {
                requestId,
                status: bizyStatus === 'Queuing' ? 'QUEUED' : 'PROCESSING',
                progress,
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
