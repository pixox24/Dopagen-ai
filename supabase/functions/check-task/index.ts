// Supabase Edge Function: Check Task Status
// Queries BizyAir for task status and updates database

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  || Deno.env.get('SERVICE_ROLE_KEY')
  || Deno.env.get('SUPABASE_SERVICE_KEY')
  || Deno.env.get('SERVICE_KEY')
  || ''
const BIZYAIR_API_KEY = Deno.env.get('BIZYAIR_API_KEY')
const ALLOWED_ORIGINS = Deno.env.get('ALLOWED_ORIGINS')?.split(',') || ['http://localhost:3000', 'http://localhost:5173']

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (data: unknown, status: number = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

interface BizyAirStatusResponse {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    // Validate environment variables
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !BIZYAIR_API_KEY) {
      console.error('Missing environment variables')
      return jsonResponse({ error: 'Server configuration error' }, 500)
    }

    // Parse request
    let body: { taskId?: string }
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { taskId } = body
    if (!taskId) {
      return jsonResponse({ error: 'Missing taskId' }, 400)
    }

    // Create admin client
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Get task from database
    const { data: task, error: taskError } = await adminClient
      .from('generation_tasks')
      .select('*')
      .eq('id', taskId)
      .single()

    if (taskError || !task) {
      console.error('Task not found:', taskError)
      return jsonResponse({ error: 'Task not found' }, 404)
    }

    // If task is already completed or failed, return current status
    if (task.status === 'COMPLETED' || task.status === 'FAILED') {
      return jsonResponse({
        taskId: task.id,
        status: task.status,
        resultUrl: task.result_url,
        error: task.error,
        progress: task.progress
      })
    }

    // If task is PENDING or PROCESSING, check if we have result_json with external task ID
    // Note: BizyAir API doesn't provide a separate task query endpoint in the current implementation
    // So we check if the task has been pending for too long and update accordingly

    const createdAt = new Date(task.created_at).getTime()
    const now = Date.now()
    const elapsedMinutes = (now - createdAt) / (1000 * 60)

    // If task has been processing for more than 10 minutes, mark as failed
    if (task.status === 'PROCESSING' && elapsedMinutes > 10) {
      await adminClient
        .from('generation_tasks')
        .update({
          status: 'FAILED',
          error: 'Generation timeout - please try again'
        })
        .eq('id', taskId)

      return jsonResponse({
        taskId: task.id,
        status: 'FAILED',
        error: 'Generation timeout - please try again'
      })
    }

    // Return current status
    return jsonResponse({
      taskId: task.id,
      status: task.status,
      resultUrl: task.result_url,
      error: task.error,
      progress: task.progress,
      message: task.status === 'PROCESSING' ? 'Still processing, please wait' : 'Pending'
    })

  } catch (error) {
    console.error('Check task error:', error)
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
