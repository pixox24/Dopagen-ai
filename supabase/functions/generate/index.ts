// Supabase Edge Function: Generate AI Image (真正的异步模式)
// 创建任务后立即返回 → BizyAir 调用在后台执行 → 前端轮询获取结果

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 声明 EdgeRuntime 全局对象（Supabase 运行时提供）
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void
}

// 环境变量 - 模块级加载
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
// 兼容多种命名
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || Deno.env.get('SERVICE_ROLE_KEY')
  || Deno.env.get('SUPABASE_SERVICE_KEY')
  || Deno.env.get('SERVICE_KEY')
  || ''
const BIZYAIR_API_KEY = Deno.env.get('BIZYAIR_API_KEY')

// CORS
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_REQUEST_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_PROMPT_LENGTH = 4000
const MAX_MODEL_ID_LENGTH = 100
const FETCH_TIMEOUT = 120000 // BizyAir 最大等待 120 秒

// TypeScript 接口定义
interface GenerateRequest {
  modelId: string
  prompt: string
  params: {
    web_app_id: string | number
    input_values: {
      width?: number
      height?: number
      [key: string]: unknown
    }
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
      images?: string[]
    }
    file_url?: string
    object_url?: string | { url?: string }
    error_msg?: string
    error_type?: string
  }>
}

// 环境变量启动检查
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_KEY')
}

// JSON 响应辅助函数
const jsonResponse = (data: unknown, status: number = 200, corsHeaders: Record<string, string>) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// 安全序列化
const safeStringify = (obj: unknown): string => {
  try { return JSON.stringify(obj) }
  catch { return '[Object with circular reference]' }
}

// 请求体验证
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
  // web_app_id 可以是 string 或 number
  if (!params.web_app_id && params.web_app_id !== 0) {
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

// 带超时的 fetch
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

// ========== 后台处理函数 ==========
// 负责调用 BizyAir API 并更新数据库，在函数返回后继续执行
async function processGenerationInBackground(
  adminClient: SupabaseClient,
  taskId: string,
  userId: string,
  modelId: string,
  prompt: string,
  params: GenerateRequest['params']
) {
  try {
    const payload = {
      web_app_id: params.web_app_id,
      input_values: params.input_values
    }

    console.log(`[后台] 任务 ${taskId}: 调用 BizyAir 中...`)

    const response = await fetchWithTimeout('https://api.bizyair.cn/w/v1/webapp/task/openapi/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BIZYAIR_API_KEY}`
      },
      body: JSON.stringify(payload)
    }, FETCH_TIMEOUT)

    // BizyAir 返回错误
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[后台] 任务 ${taskId}: BizyAir 错误 ${response.status}:`, errorText)
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: `BizyAir API Error: ${errorText.substring(0, 200)}` })
        .eq('id', taskId)
      return
    }

    // 解析响应
    let result: BizyAirResponse
    try {
      result = await response.json()
    } catch {
      console.error(`[后台] 任务 ${taskId}: 无法解析 BizyAir 响应`)
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: 'Invalid response from AI service' })
        .eq('id', taskId)
      return
    }

    console.log(`[后台] 任务 ${taskId}: BizyAir 响应:`, safeStringify(result).substring(0, 300))

    // 检查生成失败
    if (result.status === 'Failed' || result.data?.status === 'failed') {
      let errorMsg = 'Unknown error'
      if (result.outputs?.[0]) {
        errorMsg = result.outputs[0].error_msg || result.outputs[0].error_type || errorMsg
      }
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: errorMsg.substring(0, 300) })
        .eq('id', taskId)
      return
    }

    // 提取图片 URL
    let imageUrl: string | null = null
    if (result.outputs?.[0]) {
      const output = result.outputs[0]
      imageUrl = output.data?.images?.[0] || output.file_url || output.object_url || null
      if (typeof imageUrl === 'object') imageUrl = imageUrl?.url
    }
    imageUrl = imageUrl || result.data?.file_url || null

    if (!imageUrl) {
      console.error(`[后台] 任务 ${taskId}: 响应中无图片 URL`)
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: 'No image URL in response' })
        .eq('id', taskId)
      return
    }

    // ✅ 生成成功！更新数据库
    const width = params.input_values?.width || 1024
    const height = params.input_values?.height || 1024

    await adminClient
      .from('generation_tasks')
      .update({
        status: 'COMPLETED',
        result_url: imageUrl,
        result_json: result,
        completed_at: new Date().toISOString(),
        progress: 100
      })
      .eq('id', taskId)

    console.log(`[后台] 任务 ${taskId}: ✅ 生成完成!`)

  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    console.error(`[后台] 任务 ${taskId}: 致命错误:`, errMsg)
    await adminClient
      .from('generation_tasks')
      .update({ status: 'FAILED', error: `Processing error: ${errMsg.substring(0, 200)}` })
      .eq('id', taskId)
      .catch(() => { })
  }
}

// ========== 主请求处理 ==========
Deno.serve(async (req) => {
  const corsHeaders = CORS_HEADERS

  // CORS 预检
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)
  }

  // 检查请求体大小
  const contentLength = parseInt(req.headers.get('content-length') || '0')
  if (contentLength > MAX_REQUEST_SIZE) {
    return jsonResponse({ error: 'Request too large' }, 413, corsHeaders)
  }

  try {
    // 验证环境变量
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Server configuration error: Missing Supabase credentials')
      return jsonResponse({ error: 'Server configuration error' }, 500, corsHeaders)
    }

    // 从 JWT 中解析用户 ID
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401, corsHeaders)
    }

    let userId: string
    try {
      const token = authHeader.replace(/^Bearer\s+/i, '')
      const payloadBase64 = token.split('.')[1]
      const payloadJson = atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/'))
      const payload = JSON.parse(payloadJson)
      userId = payload.sub
      if (!userId) throw new Error('Missing sub claim')
      if (payload.role !== 'authenticated' && payload.role !== 'service_role') {
        return jsonResponse({ error: 'Unauthorized - please login' }, 401, corsHeaders)
      }
    } catch (e) {
      console.error('JWT parse error:', e)
      return jsonResponse({ error: 'Invalid authorization token' }, 401, corsHeaders)
    }

    console.log(`[Generate] 用户 ${userId} 已认证`)

    // 解析请求体
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders)
    }

    // 验证请求
    const validation = validateRequest(body)
    if (!validation.valid || !validation.data) {
      return jsonResponse({ error: validation.error }, 400, corsHeaders)
    }

    const { modelId, prompt, params } = validation.data

    // 检查 BizyAir API Key
    if (!BIZYAIR_API_KEY) {
      console.error('BizyAir API not configured')
      return jsonResponse({ error: 'Server configuration error' }, 500, corsHeaders)
    }

    // 创建数据库客户端
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // 在数据库中创建任务（状态: PROCESSING）
    console.log(`[Generate] 创建任务中...`)
    const { data: task, error: taskError } = await adminClient
      .from('generation_tasks')
      .insert({
        user_id: userId,
        model_id: modelId,
        prompt,
        params,
        status: 'PROCESSING'
      })
      .select()
      .single()

    if (taskError || !task) {
      console.error('创建任务失败:', taskError)
      return jsonResponse({ error: 'Failed to create task' }, 500, corsHeaders)
    }

    console.log(`[Generate] 任务已创建: ${task.id}，启动后台处理`)

    // 🚀 启动后台异步处理（函数返回后继续执行）
    EdgeRuntime.waitUntil(
      processGenerationInBackground(adminClient, task.id, userId, modelId, prompt, params)
    )

    // ⚡ 立即返回 202 Accepted（< 1秒）
    return jsonResponse({
      success: true,
      taskId: task.id,
      status: 'PROCESSING',
      message: 'Image generation started'
    }, 202, corsHeaders)

  } catch (error) {
    console.error('=== 致命错误 ===')
    console.error('Error:', error instanceof Error ? error.message : String(error))
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace')

    return jsonResponse({
      error: 'Internal server error'
    }, 500, corsHeaders)
  }
})
