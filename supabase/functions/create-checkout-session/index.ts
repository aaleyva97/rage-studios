import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import Stripe from 'https://esm.sh/stripe@14.5.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    console.log('Request body:', body)

    const { packageData, userId, purchaseId, successUrl, cancelUrl } = body

    console.log('URLs received:', { successUrl, cancelUrl })

    const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
    if (!stripeKey) {
      throw new Error('Stripe key not configured')
    }

    // Supabase (service role) para validaciones de servidor
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // 🚫 Bloqueo de compra para usuarios en lista de bloqueo.
    // Se valida en el servidor para que no pueda saltarse desde el cliente.
    // Respuesta neutral: no se revela que la cuenta está bloqueada.
    if (userId) {
      const { data: blacklisted } = await supabase
        .from('user_blacklist')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle()

      if (blacklisted) {
        console.log(`🚫 Compra bloqueada para usuario en lista de bloqueo: ${userId}`)
        return new Response(
          JSON.stringify({
            error: 'Por el momento no es posible completar esta operación.',
            code: 'ACCOUNT_RESTRICTED',
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 403,
          }
        )
      }
    }

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2023-10-16',
    })

    const sessionConfig = {
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'mxn',
            product_data: {
              name: packageData.title,
              description: `${packageData.classes_count || 'Ilimitadas'} clases - ${packageData.validity_days} días`,
            },
            unit_amount: Math.round(packageData.price * 100),
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        purchase_id: purchaseId,
        user_id: userId,
        package_id: packageData.id,
      },
    }

    console.log('Creating Stripe session with config:', sessionConfig)

    const session = await stripe.checkout.sessions.create(sessionConfig)

    console.log('Stripe session created:', session.id)

    // Guardar session_id en Supabase
    await supabase
      .from('purchases')
      .update({
        stripe_session_id: session.id
      })
      .eq('id', purchaseId)

    return new Response(
      JSON.stringify({
        sessionId: session.id,
        url: session.url
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    console.error('Error in edge function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
