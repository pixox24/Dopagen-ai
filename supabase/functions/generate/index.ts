// Supabase Edge Function: Generate AI Image
// Handles AI generation - Supabase auto-authenticates via request.sb

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (data: any, status: number = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    // Get user from Supabase Auth - Edge Runtime validates JWT automatically
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    
    // Use the anon key from environment (set by Supabase automatically)
    // For Edge Functions, we can use the service key for admin operations
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_KEY') || ''
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return jsonResponse({ error: 'Server configuration error: Missing Supabase credentials' }, 500)
    }
    
    // Get auth header from request
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization header' }, 401)
    }
    
    // Create client with user's token to validate
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false }
    })
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()
    
    if (userError || !user) {
      console.error('Auth error:', userError)
      return jsonResponse({ error: 'Unauthorized - please login' }, 401)
    }
    
    const userId = user.id
    console.log(`[Generate] User ${userId} authenticated`)

    // Parse request body
    let body
    try {
      body = await req.json()
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { modelId, prompt, params } = body

    if (!modelId || !prompt || !params) {
      return jsonResponse({ 
        error: 'Missing required fields',
        details: { modelId: !!modelId, prompt: !!prompt, params: !!params }
      }, 400)
    }

    // Get other environment variables
    const bizyAirApiKey = Deno.env.get('BIZYAIR_API_KEY')

    if (!bizyAirApiKey) {
      return jsonResponse({ error: 'BizyAir API not configured' }, 500)
    }

    // Create admin client for database operations
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
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
      return jsonResponse({ error: 'Failed to create task' }, 500)
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
        'Authorization': `Bearer ${bizyAirApiKey}`
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
      
      return jsonResponse({ error: 'AI generation failed', taskId: task.id }, 502)
    }

    const result = await response.json()
    console.log(`[Generate] BizyAir response:`, JSON.stringify(result).substring(0, 300))

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
      
      return jsonResponse({ error: errorMsg, taskId: task.id }, 502)
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
      
      return jsonResponse({ error: 'No image generated', taskId: task.id }, 502)
    }

    // Update task and save image
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
          width: params.input_values?.width || 1024,
          height: params.input_values?.height || 1024,
          model_name: modelId,
          is_public: false,
          params
        })
    ])

    console.log(`[Generate] Success: ${task.id}`)

    return jsonResponse({
      success: true,
      taskId: task.id,
      imageUrl,
      message: 'Image generated successfully'
    })

  } catch (error: any) {
    console.error('=== FATAL ERROR ===')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    return jsonResponse({ 
      error: 'Internal server error',
      message: error.message 
    }, 500)
  }
})
