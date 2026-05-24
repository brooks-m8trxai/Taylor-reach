/**
 * POST /api/reply-poll
 *
 * Runs the Gmail reply triage agent:
 *   - Checks all outreach threads for new inbound messages
 *   - Classifies intent with Haiku
 *   - Drafts warm responses with Sonnet
 *   - Writes replies to DB + updates brand statuses
 *
 * Requires GMAIL_REFRESH_TOKEN to be set. Returns an error with setup instructions
 * if Gmail is not configured yet.
 */

import { NextResponse } from 'next/server'
import { getTenantId } from '@/lib/tenant'
import { triageReplies } from '@taylor-reach/agents'

export const maxDuration = 120

export async function POST() {
  if (!process.env.GMAIL_REFRESH_TOKEN) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Gmail not configured.',
        setup_steps: [
          '1. Run: node -e "require(\'./packages/integrations/src/gmail\').getRefreshToken()"',
          '2. Follow the OAuth URL, paste the code back',
          '3. Add GMAIL_REFRESH_TOKEN=<token> to apps/dashboard/.env.local',
          '4. Also set GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET from Google Cloud Console',
        ],
      },
      { status: 503 },
    )
  }

  const tenantId = await getTenantId()
  if (!tenantId) {
    return NextResponse.json({ error: 'No tenant configured' }, { status: 400 })
  }

  try {
    const stats = await triageReplies(tenantId)
    return NextResponse.json({ ok: true, ...stats })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
