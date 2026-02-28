// Supabase Edge Function: Generate AI Image
// Security hardened: strict auth, strict CORS, bounded request size/time.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY') || ''
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || ''
const BIZYAIR_API_KEY = Deno.env.get('BIZYAIR_API_KEY') || ''
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') || 'http://localhost:3000,http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean)

const MAX_REQUEST_SIZE = 10 * 1024 * 1024
const MAX_PROMPT_LENGTH = 4000
const MAX_MODEL_ID_LENGTH = 100
const FETCH_TIMEOUT = 120000

interface GenerateRequest {
  modelId: string
  prompt: string
  params: {
    web_app_id: string
    input_values: Record<string, unknown>
  }
}

interface BizyAirResponse {
  status?: string
  data?: {
    status?: string
    file_url?: string
  }
  outputs?: Array<{
    data?: {
      images?: Array<string | { url?: string }>
    }
    file_url?: string
    object_url?: string | { url?: string }
    error_msg?: string
    error_type?: string
  }>
}

const buildCorsHeaders = (origin: string | null) => {
  const requestOrigin = origin || ''
  const allowOrigin = requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : ''

  return {
    ...(allowOrigin ? { 'Access-Control-Allow-Origin': allowOrigin } : {}),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin'
  }
}

const jsonResponse = (data: unknown, status: number, corsHeaders: Record<string, string>) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

const validateRequest = (body: unknown): { valid: boolean; data?: GenerateRequest; error?: string } => {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' }
  }

  const { modelId, prompt, params } = body as Partial<GenerateRequest>

  if (!modelId || typeof modelId !== 'string') {
    return { valid: false, error: 'Missing or invalid modelId' }
  }
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, error: 'Missing or invalid prompt' }
  }
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Missing or invalid params' }
  }

  if (modelId.length > MAX_MODEL_ID_LENGTH) {
    return { valid: false, error: `modelId exceeds maximum length of ${MAX_MODEL_ID_LENGTH}` }
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `prompt exceeds maximum length of ${MAX_PROMPT_LENGTH}` }
  }

  if (!params.web_app_id || typeof params.web_app_id !== 'string') {
    return { valid: false, error: 'Missing or invalid params.web_app_id' }
  }
  if (!params.input_values || typeof params.input_values !== 'object') {
    return { valid: false, error: 'Missing or invalid params.input_values' }
  }

  return {
    valid: true,
    data: { modelId, prompt, params: params as GenerateRequest['params'] }
  }
}

async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeoutId)
  }
}

async function authenticateUser(req: Request): Promise<{ token: string; userId: string } | null> {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) {
    return null
  }

  const token = authHeader.slice('Bearer '.length)
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  })

  const { data: { user }, error } = await authClient.auth.getUser(token)
  if (error || !user) {
    return null
  }

  return { token, userId: user.id }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  const corsHeaders = buildCorsHeaders(origin)

  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse({ error: 'Origin not allowed' }, 403, corsHeaders)
  }

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)
  }

  const contentLength = parseInt(req.headers.get('content-length') || '0', 10)
  if (contentLength > MAX_REQUEST_SIZE) {
    return jsonResponse({ error: 'Request too large' }, 413, corsHeaders)
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !SUPABASE_ANON_KEY || !BIZYAIR_API_KEY) {
      return jsonResponse({ error: 'Server configuration error' }, 500, corsHeaders)
    }

    const authResult = await authenticateUser(req)
    if (!authResult) {
      return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders)
    }

    let bodyText = ''
    try {
      bodyText = await req.text()
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400, corsHeaders)
    }

    if (bodyText.length > MAX_REQUEST_SIZE) {
      return jsonResponse({ error: 'Request too large' }, 413, corsHeaders)
    }

    let body: unknown
    try {
      body = JSON.parse(bodyText)
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders)
    }

    const validation = validateRequest(body)
    if (!validation.valid || !validation.data) {
      return jsonResponse({ error: validation.error }, 400, corsHeaders)
    }

    const { modelId, prompt, params } = validation.data

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const { data: task, error: taskError } = await adminClient
      .from('generation_tasks')
      .insert({
        user_id: authResult.userId,
        model_id: modelId,
        prompt,
        params,
        status: 'PENDING'
      })
      .select()
      .single()

    if (taskError || !task) {
      return jsonResponse({ error: 'Failed to create task' }, 500, corsHeaders)
    }

    const payload = {
      web_app_id: params.web_app_id,
      input_values: params.input_values
    }

    let response: Response
    try {
      response = await fetchWithTimeout('https://api.bizyair.cn/w/v1/webapp/task/openapi/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${BIZYAIR_API_KEY}`
        },
        body: JSON.stringify(payload)
      }, FETCH_TIMEOUT)
    } catch (fetchError: unknown) {
      const isTimeout = fetchError instanceof Error && fetchError.name === 'AbortError'
      const errorMessage = isTimeout
        ? `AI service timeout after ${Math.floor(FETCH_TIMEOUT / 1000)} seconds`
        : 'AI service request failed'

      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: errorMessage })
        .eq('id', task.id)

      return jsonResponse({ error: errorMessage, taskId: task.id }, isTimeout ? 504 : 502, corsHeaders)
    }

    if (!response.ok) {
      const errorText = await response.text()
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: `BizyAir API Error: ${errorText.substring(0, 200)}` })
        .eq('id', task.id)

      return jsonResponse({ error: 'AI generation failed', taskId: task.id }, 502, corsHeaders)
    }

    let result: BizyAirResponse
    try {
      result = await response.json()
    } catch {
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: 'Invalid response from AI service' })
        .eq('id', task.id)

      return jsonResponse({ error: 'Invalid response from AI service', taskId: task.id }, 502, corsHeaders)
    }

    if (result.status === 'Failed' || result.data?.status === 'failed') {
      let errorMsg = 'Unknown error'
      if (result.outputs?.[0]) {
        errorMsg = result.outputs[0].error_msg || result.outputs[0].error_type || errorMsg
      }

      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: errorMsg.substring(0, 300) })
        .eq('id', task.id)

      return jsonResponse({ error: errorMsg, taskId: task.id }, 502, corsHeaders)
    }

    let imageUrl: string | null = null

    if (result.outputs?.[0]) {
      const output = result.outputs[0]
      const firstImage = output.data?.images?.[0]

      if (typeof firstImage === 'string') {
        imageUrl = firstImage
      } else if (firstImage && typeof firstImage === 'object') {
        imageUrl = firstImage.url || null
      } else if (typeof output.file_url === 'string') {
        imageUrl = output.file_url
      } else if (typeof output.object_url === 'string') {
        imageUrl = output.object_url
      } else if (output.object_url && typeof output.object_url === 'object') {
        imageUrl = output.object_url.url || null
      }
    }

    imageUrl = imageUrl || result.data?.file_url || null

    if (!imageUrl) {
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: 'No image URL in response' })
        .eq('id', task.id)

      return jsonResponse({ error: 'No image generated', taskId: task.id }, 502, corsHeaders)
    }

    const width = Number(params.input_values?.width) || 1024
    const height = Number(params.input_values?.height) || 1024

    await Promise.all([
      adminClient
        .from('generation_tasks')
        .update({
          status: 'COMPLETED',
          result_url: imageUrl,
          result_json: result,
          completed_at: new Date().toISOString(),
          progress: 100
        })
        .eq('id', task.id),

      adminClient
        .from('images')
        .insert({
          user_id: authResult.userId,
          url: imageUrl,
          prompt,
          width,
          height,
          model_name: modelId,
          is_public: false,
          params
        })
    ])

    return jsonResponse({
      success: true,
      taskId: task.id,
      imageUrl,
      status: 'COMPLETED',
      message: 'Image generated successfully'
    }, 200, corsHeaders)
  } catch (error) {
    console.error('Edge generate fatal error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500, corsHeaders)
  }
})
