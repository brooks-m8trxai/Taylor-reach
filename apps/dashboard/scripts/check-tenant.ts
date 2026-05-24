import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function main() {
  const { data: tenant, error: tErr } = await sb.from('tenants').select('id,name').maybeSingle()
  console.log('tenant:', JSON.stringify(tenant))
  console.log('tenant error:', tErr?.message ?? 'none')

  const { data: signals, error: sErr } = await sb
    .from('signals')
    .select('id,brand_name,tenant_id')
    .limit(3)
  console.log('signals:', JSON.stringify(signals))
  console.log('signals error:', sErr?.message ?? 'none')
}

main().catch(console.error)
