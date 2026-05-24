import { serverClient } from '@taylor-reach/db'
import type { Tenant } from '@taylor-reach/db'

let cached: Tenant | null = null

export async function getTenant(): Promise<Tenant | null> {
  if (cached) return cached
  const { data } = await serverClient.from('tenants').select('*').limit(1).maybeSingle()
  cached = data
  return data
}

export async function getTenantId(): Promise<string | null> {
  const t = await getTenant()
  return t?.id ?? null
}
