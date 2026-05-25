/**
 * Gmail send integration.
 *
 * Uses OAuth2 with a long-lived refresh token (stored in GMAIL_REFRESH_TOKEN env).
 * No interactive OAuth flow at send time — the refresh token was obtained once
 * during Gmail setup and stored. The googleapis library handles token refresh automatically.
 *
 * Before sending, always runs the compliance gate. If gate blocks, throws an error
 * with the blocking reasons so the caller can surface them to Taylor.
 *
 * Returns Gmail message_id + thread_id for tracking in outreach_events.
 */

import { google } from 'googleapis'
import { evaluate } from '@taylor-reach/compliance'
import { supabase } from '@taylor-reach/db'

// ─── OAuth2 setup ─────────────────────────────────────────────────────────────

function buildOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob', // desktop redirect
  )
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return client
}

// ─── Email encoding ────────────────────────────────────────────────────────────

function encodeEmail(opts: {
  to: string
  from: string
  subject: string
  body: string
  replyToThreadId?: string
  inReplyTo?: string
}): string {
  const lines = [
    `To: ${opts.to}`,
    `From: ${opts.from}`,
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ]
  if (opts.inReplyTo) lines.push(`In-Reply-To: ${opts.inReplyTo}`)
  lines.push('', opts.body)
  const raw = lines.join('\r\n')
  return Buffer.from(raw).toString('base64url')
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SendParams {
  tenantId: string
  brandId: string
  pitchDraftId: string
  contactEmail: string
  subject: string
  bodyText: string
  replyToThreadId?: string // for follow-ups
  inReplyToMessageId?: string
}

export interface SendResult {
  messageId: string
  threadId: string
  auditToken: string
}

// ─── Main send function ───────────────────────────────────────────────────────

export async function sendEmail(params: SendParams): Promise<SendResult> {
  const {
    tenantId, brandId, pitchDraftId, contactEmail, subject, bodyText,
    replyToThreadId, inReplyToMessageId,
  } = params

  // 1. Load tenant for from address
  const { data: tenant } = await supabase
    .from('tenants')
    .select('from_address, physical_address')
    .eq('id', tenantId)
    .single()

  if (!tenant || !(tenant as any).from_address) {
    throw new Error('No from_address configured for tenant. Set it in Settings.')
  }

  const fromAddress: string = (tenant as any).from_address

  // 2. Compliance gate
  const gate = await evaluate({
    tenant_id: tenantId,
    brand_id: brandId,
    contact_email: contactEmail,
    pitch_draft_id: pitchDraftId,
    channel: 'email',
    send_time: new Date(),
  })

  if (gate.decision === 'block') {
    throw new Error(`Compliance gate blocked send: ${gate.reasons.join('; ')}`)
  }

  // 3. Build and send via Gmail API
  const auth = buildOAuth2Client()
  const gmail = google.gmail({ version: 'v1', auth })

  const encoded = encodeEmail({
    to: contactEmail,
    from: fromAddress,
    subject,
    body: bodyText,
    replyToThreadId,
    inReplyTo: inReplyToMessageId,
  })

  const requestBody: { raw: string; threadId?: string } = { raw: encoded }
  if (replyToThreadId) requestBody.threadId = replyToThreadId

  const response = await gmail.users.messages.send({
    userId: 'me',
    requestBody,
  })
  const messageId = response.data.id ?? ''
  const threadId = response.data.threadId ?? ''

  // 4. Record outreach_event
  const { data: pitch } = await supabase
    .from('pitch_drafts')
    .select('touch_number:id')
    .eq('brand_id', brandId)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const touchNumber = pitch ? 2 : 1

  await supabase.from('outreach_events').insert({
    tenant_id: tenantId,
    brand_id: brandId,
    pitch_draft_id: pitchDraftId,
    thread_id: threadId,
    message_id: messageId,
    audit_token: gate.audit_token,
    channel: 'email',
    direction: 'outbound',
    touch_number: touchNumber,
    subject,
    body_text: bodyText,
    status: 'sent',
    sent_at: new Date().toISOString(),
  })

  // 5. Mark pitch as sent + update brand status
  await Promise.all([
    supabase
      .from('pitch_drafts')
      .update({ status: 'sent', sent_at: new Date().toISOString() })
      .eq('id', pitchDraftId),
    supabase
      .from('brands')
      .update({ status: 'pitched', last_contacted_at: new Date().toISOString() })
      .eq('id', brandId),
  ])

  return { messageId, threadId, auditToken: gate.audit_token }
}

// ─── OAuth setup helper (run once manually to get refresh token) ──────────────

/**
 * Run this function once from a script to get a refresh token.
 * It prints an auth URL, you visit it, paste the code back, and
 * the refresh token is printed. Store it in GMAIL_REFRESH_TOKEN.
 *
 * Usage: ts-node -e "import('./packages/integrations/src/gmail').then(m => m.getRefreshToken())"
 */
export async function getRefreshToken(): Promise<void> {
  const client = buildOAuth2Client()
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'],
    prompt: 'consent',
  })
  console.log('\nVisit this URL to authorize Gmail access:\n', authUrl)
  console.log('\nAfter authorizing, paste the code here and press Enter:')

  const code = await new Promise<string>(resolve => {
    process.stdin.once('data', d => resolve(d.toString().trim()))
  })

  const { tokens } = await client.getToken(code)
  console.log('\nRefresh token (store in GMAIL_REFRESH_TOKEN env var):')
  console.log(tokens.refresh_token)
}
