// Supabase Edge Function: Generate AI Image
// Handles AI generation - Supabase auto-authenticates via request.sb

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Environment variables - loaded once at module level
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_KEY') || ''
const BIZYAIR_API_KEY = Deno.env.get('BIZYAIR_API_KEY')
const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || ['http://localhost:3000', 'http://localhost:5173']
const MAX_REQUEST_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_PROMPT_LENGTH = 4000
const MAX_MODEL_ID_LENGTH = 100

// TypeScript interfaces
interface GenerateRequest {
  modelId: string
  prompt: string
  params: {
    web_app_id: string
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

// Validate environment variables at startup
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables: SUPABASE_URL or SUPABASE_SERVICE_KEY')
}

// Get CORS headers based on request origin
const getCorsHeaders = (req: Request) => {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes('*') 
    ? '*' 
    : ALLOWED_ORIGINS.find(allowed => origin === allowed) || ALLOWED_ORIGINS[0]
  
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

// JSON response helper
const jsonResponse = (data: unknown, status: number = 200, corsHeaders: Record<string, string>) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// Safe JSON stringify helper
const safeStringify = (obj: unknown): string => {
  try {
    return JSON.stringify(obj)
  } catch {
    return '[Object with circular reference]'
  }
}

// Validate request body
const validateRequest = (body: unknown): { valid: boolean; data?: GenerateRequest; error?: string } => {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid request body' }
  }
  
  const { modelId, prompt, params } = body as Partial<GenerateRequest>
  
  // Check required fields
  if (!modelId || typeof modelId !== 'string') {
    return { valid: false, error: 'Missing or invalid modelId' }
  }
  
  if (!prompt || typeof prompt !== 'string') {
    return { valid: false, error: 'Missing or invalid prompt' }
  }
  
  if (!params || typeof params !== 'object') {
    return { valid: false, error: 'Missing or invalid params' }
  }
  
  // Check field lengths
  if (modelId.length > MAX_MODEL_ID_LENGTH) {
    return { valid: false, error: `modelId exceeds maximum length of ${MAX_MODEL_ID_LENGTH}` }
  }
  
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `prompt exceeds maximum length of ${MAX_PROMPT_LENGTH}` }
  }
  
  // Validate params structure
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

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req)
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders)
  }

  // Check request body size
  const contentLength = parseInt(req.headers.get('content-length') || '0')
  if (contentLength > MAX_REQUEST_SIZE) {
    return jsonResponse({ error: 'Request too large' }, 413, corsHeaders)
  }

  try {
    // Validate environment variables
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      console.error('Server configuration error: Missing Supabase credentials')
      return jsonResponse({ error: 'Server configuration error' }, 500, corsHeaders)
    }
    
    // Get auth header from request
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401, corsHeaders)
    }
    
    // Create client with user's token to validate
    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      console.error('Auth error:', userError)
      return jsonResponse({ error: 'Unauthorized - please login' }, 401, corsHeaders)
    }
    
    const userId = user.id
    console.log(`[Generate] User ${userId} authenticated`)

    // Parse request body
    let body: unknown
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400, corsHeaders)
    }

    // Validate request
    const validation = validateRequest(body)
    if (!validation.valid || !validation.data) {
      return jsonResponse({ error: validation.error }, 400, corsHeaders)
    }
    
    const { modelId, prompt, params } = validation.data

    // Check BizyAir API key
    if (!BIZYAIR_API_KEY) {
      console.error('BizyAir API not configured')
      return jsonResponse({ error: 'Server configuration error' }, 500, corsHeaders)
    }

    // Create admin client for database operations
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Create task
    console.log(`[Generate] Creating task for user ${userId}`)
    const { data: task, error: taskError } = await adminClient
      .from('generation_tasks')
      .insert({
        user_id: userId,
        model_id: modelId,
        prompt,
        params,
        status: 'PENDING'
      })
      .select()
      .single()

    if (taskError || !task) {
      console.error('Create task error:', taskError)
      return jsonResponse({ error: 'Failed to create task' }, 500, corsHeaders)
    }

    console.log(`[Generate] Task created: ${task.id}`)

    // Call BizyAir
    const payload = {
      web_app_id: params.web_app_id,
      input_values: params.input_values
    }

    console.log(`[Generate] Calling BizyAir...`)
    
    const response = await fetch('https://api.bizyair.cn/w/v1/webapp/task/openapi/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BIZYAIR_API_KEY}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`BizyAir Error ${response.status}:`, errorText)
      
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: `BizyAir API Error: ${errorText.substring(0, 200)}` })
        .eq('id', task.id)
      
      return jsonResponse({ error: 'AI generation failed', taskId: task.id }, 502, corsHeaders)
    }

    // Safely parse BizyAir response
    let result: BizyAirResponse
    try {
      result = await response.json()
    } catch (parseError) {
      const errorText = await response.text()
      console.error('Failed to parse BizyAir response:', errorText)
      
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: 'Invalid response from AI service' })
        .eq('id', task.id)
      
      return jsonResponse({ error: 'Invalid response from AI service', taskId: task.id }, 502, corsHeaders)
    }
    
    console.log(`[Generate] BizyAir response:`, safeStringify(result).substring(0, 300))

    // Check for failure
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

    // Extract image URL
    let imageUrl: string | null = null
    
    if (result.outputs?.[0]) {
      const output = result.outputs[0]
      imageUrl = output.data?.images?.[0] || output.file_url || output.object_url || null
      if (typeof imageUrl === 'object') imageUrl = imageUrl?.url
    }
    
    imageUrl = imageUrl || result.data?.file_url || null

    if (!imageUrl) {
      console.error('No image URL in response')
      await adminClient
        .from('generation_tasks')
        .update({ status: 'FAILED', error: 'No image URL in response' })
        .eq('id', task.id)
      
      return jsonResponse({ error: 'No image generated', taskId: task.id }, 502, corsHeaders)
    }

    // Update task and save image with proper error handling
    const width = params.input_values?.width || 1024
    const height = params.input_values?.height || 1024
    
    try {
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
            user_id: userId,
            url: imageUrl,
            prompt,
            width,
            height,
            model_name: modelId,
            is_public: false,
            params
          })
      ])
      
      console.log(`[Generate] Success: ${task.id}`)
    } catch (dbError) {
      console.error('Database operation failed:', dbError)
      // Try to at least update task status
      await adminClient
        .from('generation_tasks')
        .update({
          status: 'COMPLETED',
          result_url: imageUrl,
          completed_at: new Date().toISOString(),
          progress: 100
        })
        .eq('id', task.id)
        .catch(err => console.error('Failed to update task status:', err))
    }

    return jsonResponse({
      success: true,
      taskId: task.id,
      imageUrl,
      message: 'Image generated successfully'
    }, 200, corsHeaders)

  } catch (error) {
    console.error('=== FATAL ERROR ===')
    console.error('Error:', error instanceof Error ? error.message : String(error))
    console.error('Stack:', error instanceof Error ? error.stack : 'No stack trace')
    
    // Never expose internal error details to client
    return jsonResponse({ 
      error: 'Internal server error'
    }, 500, corsHeaders)
  }
})
