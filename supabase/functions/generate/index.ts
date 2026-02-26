// Supabase Edge Function: Generate AI Image
// This function handles AI image generation via BizyAir API

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers - allow all origins for now (you can restrict later)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

// Helper to create JSON response with CORS
const jsonResponse = (data: any, status: number = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  })
}

Deno.serve(async (req) => {
  // Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204, 
      headers: corsHeaders 
    })
  }

  // Only accept POST
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  try {
    // Parse request body
    let body
    try {
      body = await req.json()
    } catch (e) {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const { modelId, prompt, params, userId } = body

    // Validate
    if (!modelId || !prompt || !params || !userId) {
      return jsonResponse({ 
        error: 'Missing required fields',
        details: { modelId: !!modelId, prompt: !!prompt, params: !!params, userId: !!userId }
      }, 400)
    }

    // Get environment variables
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_KEY')
    const bizyAirApiKey = Deno.env.get('BIZYAIR_API_KEY')

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase config')
      return jsonResponse({ error: 'Server configuration error: Supabase not configured' }, 500)
    }

    if (!bizyAirApiKey) {
      console.error('Missing BIZYAIR_API_KEY')
      return jsonResponse({ error: 'Server configuration error: BizyAir API not configured' }, 500)
    }

    // Initialize Supabase
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Create task
    console.log(`[Generate] Creating task for user ${userId}`)
    const { data: task, error: taskError } = await supabase
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

    if (taskError) {
      console.error('Create task error:', taskError)
      return jsonResponse({ error: 'Failed to create task', details: taskError.message }, 500)
    }

    if (!task) {
      return jsonResponse({ error: 'Task creation returned no data' }, 500)
    }

    console.log(`[Generate] Task created: ${task.id}`)

    // Call BizyAir
    const payload = {
      web_app_id: params.web_app_id,
      input_values: params.input_values
    }

    console.log(`[Generate] Calling BizyAir API...`)
    
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
      
      await supabase
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
      
      await supabase
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
      await supabase
        .from('generation_tasks')
        .update({ status: 'FAILED', error: 'No image URL in response' })
        .eq('id', task.id)
      
      return jsonResponse({ error: 'No image generated', taskId: task.id }, 502)
    }

    // Update task and save image
    await Promise.all([
      supabase
        .from('generation_tasks')
        .update({
          status: 'COMPLETED',
          result_url: imageUrl,
          result_json: result,
          completed_at: new Date().toISOString(),
          progress: 100
        })
        .eq('id', task.id),
      
      supabase
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
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    console.error('===================')
    return jsonResponse({ 
      error: 'Internal server error',
      message: error.message,
      stack: error.stack 
    }, 500)
  }
})
