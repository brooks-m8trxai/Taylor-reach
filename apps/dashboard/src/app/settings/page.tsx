import { getTenant } from '@/lib/tenant'
import { SettingsClient } from './settings-client'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const tenant = await getTenant()
  return <SettingsClient tenant={tenant as any} />
}
