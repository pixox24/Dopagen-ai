// Supabase Edge Function: Generate AI Image
// This function handles AI image generation via BizyAir API
// It protects the API key by running server-side

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// CORS headers for browser requests
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Handle CORS preflight requests
const handleCors = (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  return null
}

// Main handler
Deno.serve(async (req) => {
  // Handle CORS
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  // Only accept POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // Get request body
    const { modelId, prompt, params, userId } = await req.json()

    // Validate required fields
    if (!modelId || !prompt || !params || !userId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: modelId, prompt, params, userId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_KEY') || ''
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Get BizyAir API Key from environment
    const bizyAirApiKey = Deno.env.get('BIZYAIR_API_KEY') || ''
    
    if (!bizyAirApiKey) {
      return new Response(
        JSON.stringify({ error: 'BizyAir API not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Create task record in database
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

    if (taskError || !task) {
      console.error('Failed to create task:', taskError)
      return new Response(
        JSON.stringify({ error: 'Failed to create task' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Call BizyAir API
    const bizyAirUrl = 'https://api.bizyair.cn/w/v1/webapp/task/openapi/create'
    
    const payload = {
      web_app_id: params.web_app_id,
      input_values: params.input_values
    }

    console.log(`[Generate] Calling BizyAir API for task ${task.id}`)

    const response = await fetch(bizyAirUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bizyAirApiKey}`
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`BizyAir API Error (${response.status}):`, errorText)
      
      // Update task status to FAILED
      await supabase
        .from('generation_tasks')
        .update({
          status: 'FAILED',
          error: `BizyAir API Error: ${errorText.substring(0, 200)}`
        })
        .eq('id', task.id)
      
      return new Response(
        JSON.stringify({ error: 'AI generation failed', taskId: task.id }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await response.json()
    console.log(`[Generate] BizyAir response:`, JSON.stringify(result).substring(0, 200))

    // Check for explicit failure status
    if (result.status === 'Failed' || result.data?.status === 'failed') {
      let errorMsg = 'Unknown upstream error'
      if (result.outputs && result.outputs.length > 0) {
        errorMsg = result.outputs[0].error_msg || result.outputs[0].error_type || errorMsg
      }
      
      // Update task status to FAILED
      await supabase
        .from('generation_tasks')
        .update({
          status: 'FAILED',
          error: errorMsg.substring(0, 300)
        })
        .eq('id', task.id)
      
      return new Response(
        JSON.stringify({ error: errorMsg, taskId: task.id }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Extract image URL from response
    let imageUrl: string | null = null
    
    if (result.outputs && result.outputs.length > 0) {
      const output = result.outputs[0]
      if (output.data?.images?.[0]) {
        imageUrl = typeof output.data.images[0] === 'string'
          ? output.data.images[0]
          : output.data.images[0].url
      } else if (output.file_url) {
        imageUrl = output.file_url
      } else if (output.object_url) {
        imageUrl = output.object_url
      }
    }
    
    if (!imageUrl && result.data?.file_url) {
      imageUrl = result.data.file_url
    }

    if (!imageUrl) {
      console.error('No image URL in response:', JSON.stringify(result))
      
      await supabase
        .from('generation_tasks')
        .update({
          status: 'FAILED',
          error: 'No image URL found in response'
        })
        .eq('id', task.id)
      
      return new Response(
        JSON.stringify({ error: 'No image generated', taskId: task.id }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update task as completed
    const { error: updateError } = await supabase
      .from('generation_tasks')
      .update({
        status: 'COMPLETED',
        result_url: imageUrl,
        result_json: result,
        completed_at: new Date().toISOString(),
        progress: 100
      })
      .eq('id', task.id)

    if (updateError) {
      console.error('Failed to update task:', updateError)
    }

    // Save to images table
    await supabase
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

    console.log(`[Generate] Task ${task.id} completed successfully`)

    return new Response(
      JSON.stringify({
        success: true,
        taskId: task.id,
        imageUrl,
        message: 'Image generated successfully'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: any) {
    console.error('Generate function error:', error)
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
