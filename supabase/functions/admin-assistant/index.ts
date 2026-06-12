import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const MAX_TOOL_ITERATIONS = 6

const SYSTEM_PROMPT = `Eres un analista de soporte de RageStudios, un estudio de entrenamiento.
Tu trabajo es ayudar al equipo de administración a responder dudas de las clientas (que llegan
por WhatsApp) sobre sus créditos, reservas y cuentas. Investigas la base de datos usando las
herramientas disponibles (solo lectura) y redactas un INFORME claro y conciso en español que el
administrador pueda reenviar o usar para responder.

Reglas:
- Responde SIEMPRE en español, con un tono profesional y directo.
- Usa las herramientas para fundamentar todo lo que afirmes; no inventes datos.
- Para dudas de créditos vencidos: revisa los lotes (credit_batches) y explica claramente las
  fechas de vencimiento y cuántos créditos quedaban.
- Para "¿dónde están mis créditos?" o sospecha de cuentas duplicadas: usa buscar_cuentas con el
  nombre y/o teléfono para encontrar TODAS las cuentas de esa persona (puede tener varias con
  emails distintos) y di en cuál están los créditos.
- Si te dan un user_id, empieza por ahí; si te dan un nombre/teléfono, empieza por buscar_cuentas.
- Sé conciso: ve al grano, usa viñetas y fechas concretas. Cierra con una recomendación de qué
  responderle a la clienta.
- Las fechas vienen en UTC; RageStudios opera en hora de México (UTC-6).`

interface ToolCallLog {
  name: string
  input: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Definición de herramientas (solo lectura) expuestas al modelo
// ---------------------------------------------------------------------------
const TOOLS = [
  {
    name: 'buscar_cuentas',
    description:
      'Busca cuentas (perfiles) por nombre y/o teléfono. Devuelve id, nombre, teléfono, rol y email de cada coincidencia. Úsala para detectar cuentas duplicadas de una misma persona.',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Parte del nombre completo a buscar' },
        telefono: { type: 'string', description: 'Parte del teléfono a buscar' },
      },
    },
  },
  {
    name: 'resumen_usuario',
    description:
      'Resumen de una cuenta por su user_id: perfil, email y total de créditos disponibles ahora (lotes no vencidos con saldo).',
    input_schema: {
      type: 'object',
      properties: { user_id: { type: 'string', description: 'UUID del usuario' } },
      required: ['user_id'],
    },
  },
  {
    name: 'lotes_de_creditos',
    description:
      'Lotes de créditos (credit_batches) de un usuario: total, restante, vencimiento, si es ilimitado, primera fecha de uso. Úsala para explicar créditos vencidos.',
    input_schema: {
      type: 'object',
      properties: { user_id: { type: 'string', description: 'UUID del usuario' } },
      required: ['user_id'],
    },
  },
  {
    name: 'historial_creditos',
    description:
      'Historial de movimientos de créditos (credit_history) de un usuario: tipo, monto, descripción y fecha. Más reciente primero.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'UUID del usuario' },
        limite: { type: 'integer', description: 'Máximo de movimientos a traer (por defecto 30)' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'compras',
    description:
      'Compras (purchases) de un usuario: monto, estado, tipo de transacción y fechas.',
    input_schema: {
      type: 'object',
      properties: { user_id: { type: 'string', description: 'UUID del usuario' } },
      required: ['user_id'],
    },
  },
  {
    name: 'reservas',
    description:
      'Reservas (bookings) de un usuario: fecha, hora, estado, créditos usados. Más reciente primero.',
    input_schema: {
      type: 'object',
      properties: {
        user_id: { type: 'string', description: 'UUID del usuario' },
        limite: { type: 'integer', description: 'Máximo de reservas a traer (por defecto 20)' },
      },
      required: ['user_id'],
    },
  },
  {
    name: 'membresias',
    description: 'Membresías VIP (memberships) asociadas a un usuario.',
    input_schema: {
      type: 'object',
      properties: { user_id: { type: 'string', description: 'UUID del usuario' } },
      required: ['user_id'],
    },
  },
  {
    name: 'gift_cards',
    description: 'Gift cards asignadas a un usuario (gift_cards.assigned_user_id).',
    input_schema: {
      type: 'object',
      properties: { user_id: { type: 'string', description: 'UUID del usuario' } },
      required: ['user_id'],
    },
  },
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function getEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error) return null
    return data.user?.email ?? null
  } catch (_e) {
    return null
  }
}

function isExpired(expiration: string | null): boolean {
  if (!expiration) return false
  return new Date(expiration).getTime() < Date.now()
}

// Ejecuta una herramienta. Todas son SELECT de solo lectura.
async function runTool(
  admin: SupabaseClient,
  name: string,
  input: Record<string, any>,
): Promise<unknown> {
  switch (name) {
    case 'buscar_cuentas': {
      const filters: string[] = []
      if (input.nombre) filters.push(`full_name.ilike.%${input.nombre}%`)
      if (input.telefono) filters.push(`phone.ilike.%${input.telefono}%`)
      if (filters.length === 0) return { error: 'Debes indicar nombre o teléfono.' }

      const { data, error } = await admin
        .from('profiles')
        .select('id, full_name, phone, role, created_at')
        .or(filters.join(','))
        .limit(15)
      if (error) return { error: error.message }

      const cuentas = await Promise.all(
        (data ?? []).map(async (p: any) => ({
          ...p,
          email: await getEmail(admin, p.id),
        })),
      )
      return { cuentas }
    }

    case 'resumen_usuario': {
      const { data: perfil, error } = await admin
        .from('profiles')
        .select('id, full_name, phone, role, created_at')
        .eq('id', input.user_id)
        .maybeSingle()
      if (error) return { error: error.message }
      if (!perfil) return { error: 'No existe un perfil con ese user_id.' }

      const { data: lotes } = await admin
        .from('credit_batches')
        .select('credits_remaining, is_unlimited, expiration_date')
        .eq('user_id', input.user_id)
        .gt('credits_remaining', 0)

      let creditosDisponibles = 0
      let tieneIlimitadoVigente = false
      for (const l of lotes ?? []) {
        if (isExpired(l.expiration_date)) continue
        if (l.is_unlimited) tieneIlimitadoVigente = true
        else creditosDisponibles += l.credits_remaining ?? 0
      }

      return {
        perfil: { ...perfil, email: await getEmail(admin, input.user_id) },
        creditos_disponibles: creditosDisponibles,
        tiene_ilimitado_vigente: tieneIlimitadoVigente,
      }
    }

    case 'lotes_de_creditos': {
      const { data, error } = await admin
        .from('credit_batches')
        .select(
          'id, credits_total, credits_remaining, validity_days, is_unlimited, expiration_activated, expiration_date, first_use_date, created_at',
        )
        .eq('user_id', input.user_id)
        .order('created_at', { ascending: false })
      if (error) return { error: error.message }
      const lotes = (data ?? []).map((l: any) => ({ ...l, vencido: isExpired(l.expiration_date) }))
      return { lotes }
    }

    case 'historial_creditos': {
      const { data, error } = await admin
        .from('credit_history')
        .select('type, amount, description, created_at, credit_batch_id, booking_id')
        .eq('user_id', input.user_id)
        .order('created_at', { ascending: false })
        .limit(Math.min(input.limite ?? 30, 100))
      if (error) return { error: error.message }
      return { historial: data ?? [] }
    }

    case 'compras': {
      const { data, error } = await admin
        .from('purchases')
        .select('id, amount, status, transaction_type, package_id, created_at, completed_at')
        .eq('user_id', input.user_id)
        .order('created_at', { ascending: false })
      if (error) return { error: error.message }
      return { compras: data ?? [] }
    }

    case 'reservas': {
      const { data, error } = await admin
        .from('bookings')
        .select('id, session_date, session_time, status, credits_used, coach_name, created_at, cancelled_at')
        .eq('user_id', input.user_id)
        .order('session_date', { ascending: false })
        .limit(Math.min(input.limite ?? 20, 100))
      if (error) return { error: error.message }
      return { reservas: data ?? [] }
    }

    case 'membresias': {
      const { data, error } = await admin
        .from('memberships')
        .select('id, client_name, is_active, notes, created_at')
        .eq('user_id', input.user_id)
      if (error) return { error: error.message }
      return { membresias: data ?? [] }
    }

    case 'gift_cards': {
      const { data, error } = await admin
        .from('gift_cards')
        .select('id, code, status, package_id, assigned_at, used_at, created_at')
        .eq('assigned_user_id', input.user_id)
        .order('created_at', { ascending: false })
      if (error) return { error: error.message }
      return { gift_cards: data ?? [] }
    }

    default:
      return { error: `Herramienta desconocida: ${name}` }
  }
}

// ---------------------------------------------------------------------------
// Llamada a la API de Claude
// ---------------------------------------------------------------------------
async function callClaude(apiKey: string, messages: any[]): Promise<any> {
  const res = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    }),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Anthropic API ${res.status}: ${errText}`)
  }
  return await res.json()
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!apiKey || !supabaseUrl || !anonKey || !serviceKey) {
      throw new Error('Faltan variables de entorno requeridas.')
    }

    // --- Guard: verificar que quien llama es un admin ---
    // El token del usuario viene en el header Authorization. Lo extraemos y se lo
    // pasamos EXPLÍCITO a getUser(token): un client creado en el servidor no tiene
    // sesión persistida, así que getUser() sin argumento devolvería null.
    const authHeader = req.headers.get('Authorization') ?? ''
    const token = authHeader.replace(/^Bearer\s+/i, '').trim()
    const callerClient = createClient(supabaseUrl, anonKey)
    const { data: userData, error: userErr } = await callerClient.auth.getUser(token)
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'No autenticado' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const admin = createClient(supabaseUrl, serviceKey)
    const { data: perfil } = await admin
      .from('profiles')
      .select('role')
      .eq('id', userData.user.id)
      .maybeSingle()
    if (!perfil || perfil.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Acceso solo para administradores' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      })
    }

    // --- Construir el mensaje inicial ---
    const body = await req.json()
    const { prompt, user_id, user_name } = body as {
      prompt?: string
      user_id?: string
      user_name?: string
    }
    if (!prompt || !prompt.trim()) {
      return new Response(JSON.stringify({ error: 'El prompt es requerido' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    let contexto = ''
    if (user_id) {
      contexto = `\n\n[Contexto] Usuario seleccionado: ${user_name ?? '(sin nombre)'} — user_id: ${user_id}`
    }

    const messages: any[] = [{ role: 'user', content: `${prompt}${contexto}` }]
    const toolCalls: ToolCallLog[] = []

    // --- Loop de tool use ---
    let report = ''
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await callClaude(apiKey, messages)

      // Preservar el turno completo del asistente (incluye bloques thinking + tool_use)
      messages.push({ role: 'assistant', content: response.content })

      if (response.stop_reason === 'tool_use') {
        const toolResults: any[] = []
        for (const block of response.content) {
          if (block.type === 'tool_use') {
            toolCalls.push({ name: block.name, input: block.input })
            const result = await runTool(admin, block.name, block.input ?? {})
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: JSON.stringify(result),
            })
          }
        }
        messages.push({ role: 'user', content: toolResults })
        continue
      }

      // end_turn (u otro): extraer el texto final
      report = response.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n')
        .trim()
      break
    }

    if (!report) {
      report =
        'No se pudo generar un informe completo (se alcanzó el límite de consultas). Intenta acotar la pregunta.'
    }

    return new Response(JSON.stringify({ report, toolCalls }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.error('Error in admin-assistant:', error)
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
