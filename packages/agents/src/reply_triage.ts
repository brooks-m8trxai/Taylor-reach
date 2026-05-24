/**
 * Reply triage agent.
 *
 * Polls Gmail for new messages in threads where Taylor sent an outreach email.
 * For each new reply:
 *   1. Matches thread_id to an outreach_event to identify the brand
 *   2. Calls Claude Haiku to classify intent (warm_interested, not_now, etc.)
 *   3. If warm intent: calls Claude Sonnet to draft Taylor's response
 *   4. Inserts reply row into DB
 *   5. Updates outreach_event.status = 'replied'
 *   6. If unsubscribe/opt-out detected: inserts opt_out row
 *
 * Run every hour via n8n or the /api/reply-poll API route.
 */

import { google } from 'googleapis'
import Anthropic from '@anthropic-ai/sdk'
import { supabase } from '@taylor-reach/db'
import type { ReplyIntent } from '@taylor-reach/db'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Gmail auth ────────────────────────────────────────────────────────────────

function buildAuth() {
  const client = new google.auth.OAuth2(
    process.env.GMAIL_CLIENT_ID,
    process.env.GMAIL_CLIENT_SECRET,
    'urn:ietf:wg:oauth:2.0:oob',
  )
  client.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN })
  return client
}

// ─── Gmail message extraction ─────────────────────────────────────────────────

interface GmailMessage {
  id: string
  threadId: string
  fromEmail: string
  subject: string
  body: string
  receivedAt: string
}

function decodeBase64(data: string): string {
  try {
    return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

function extractBody(payload: any): string {
  if (!payload) return ''
  if (payload.body?.data) return decodeBase64(payload.body.data)
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return decodeBase64(part.body.data)
      }
    }
    // Fallback to HTML part
    for (const part of payload.parts) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        return decodeBase64(part.body.data).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
      }
    }
  }
  return ''
}

function headerVal(headers: { name?: string | null; value?: string | null }[], name: string): string {
  return headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ''
}

// ─── Intent classification ────────────────────────────────────────────────────

interface IntentResult {
  intent: ReplyIntent
  confidence: number
  is_warm: boolean
  reasoning: string
}

async function classifyIntent(
  replyBody: string,
  originalSubject: string,
  brandName: string,
): Promise<IntentResult> {
  const intents: ReplyIntent[] = [
    'warm_interested', 'warm_send_more', 'request_intro_call',
    'not_now', 'not_a_fit', 'wrong_person', 'auto_reply', 'unsubscribe', 'unclear',
  ]

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 300,
      system: `You classify email reply intent for a brand partnership outreach system.
The sender is Taylor Humphrey, a professional baby name consultant who pitches brand partnerships.
Classify the reply into exactly one intent category. Respond with JSON only.`,
      messages: [{
        role: 'user',
        content: `Brand: ${brandName}
Original email subject: ${originalSubject}
Reply content:
${replyBody.slice(0, 2000)}

Classify the intent. Valid intents: ${intents.join(', ')}

Definitions:
- warm_interested: genuinely interested, wants to explore
- warm_send_more: wants more info (rates, one-pager, media kit)
- request_intro_call: explicitly asking for a call/meeting
- not_now: interested but wrong timing (budget, timing, busy)
- not_a_fit: politely declining, not the right fit
- wrong_person: they're not the right contact, forwarding elsewhere
- auto_reply: OOO or automated response
- unsubscribe: explicitly asking to stop receiving emails
- unclear: can't determine intent from content

Return JSON:
{
  "intent": "one of the intents above",
  "confidence": 0-100,
  "is_warm": true if intent is warm_interested|warm_send_more|request_intro_call,
  "reasoning": "one sentence"
}`,
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    return JSON.parse(cleaned) as IntentResult
  } catch {
    return { intent: 'unclear', confidence: 50, is_warm: false, reasoning: 'Classification failed' }
  }
}

// ─── Draft warm response ──────────────────────────────────────────────────────

async function draftResponse(
  replyBody: string,
  intent: ReplyIntent,
  brandName: string,
  originalSubject: string,
  calLink: string,
): Promise<string> {
  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `You are Taylor Humphrey responding to a warm brand partnership reply.
Voice: confident, expert, warm, brief. 60-120 words. No "hope this finds you well". No emojis.
Sign off with just "Taylor" — no warmly/best/cheers.`,
      messages: [{
        role: 'user',
        content: `Brand: ${brandName}
Original subject: ${originalSubject}
Their reply:
${replyBody.slice(0, 1500)}

Intent classification: ${intent}

Write a brief, natural follow-up.
- If they want more info: offer to send a one-pager or rates
- If they want a call: offer the booking link ${calLink}
- If warm/interested: move toward next concrete step
- Keep it 60-120 words
- Don't re-pitch everything, just move forward`,
      }],
    })

    return msg.content[0].type === 'text' ? msg.content[0].text : ''
  } catch {
    return ''
  }
}

// ─── Main triage function ─────────────────────────────────────────────────────

export interface TriageStats {
  messagesChecked: number
  newReplies: number
  warmReplies: number
  optOuts: number
}

export async function triageReplies(tenantId: string): Promise<TriageStats> {
  const gmail = google.gmail({ version: 'v1', auth: buildAuth() })
  const stats: TriageStats = { messagesChecked: 0, newReplies: 0, warmReplies: 0, optOuts: 0 }

  // Load tenant for cal link
  const { data: tenant } = await supabase
    .from('tenants')
    .select('cal_links, from_address')
    .eq('id', tenantId)
    .single()

  const calLink = (tenant as any)?.cal_links?.intro_call ?? 'https://cal.com/taylorhumphrey/intro'

  // Load all sent thread IDs from outreach_events (last 90 days)
  const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString()
  const { data: outreachEvents } = await supabase
    .from('outreach_events')
    .select('id, thread_id, brand_id, subject')
    .eq('tenant_id', tenantId)
    .eq('direction', 'outbound')
    .gte('sent_at', cutoff)
    .not('thread_id', 'is', null)

  if (!outreachEvents?.length) {
    console.log('[reply_triage] No outreach threads to check')
    return stats
  }

  const threadMap = new Map<string, typeof outreachEvents[0]>()
  for (const ev of outreachEvents) {
    if (ev.thread_id) threadMap.set(ev.thread_id, ev)
  }

  // Check each thread for new replies
  for (const [threadId, outreach] of threadMap.entries()) {
    try {
      const threadResp = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
      })

      const messages = threadResp.data.messages ?? []
      stats.messagesChecked += messages.length

      // Find inbound messages (not from Taylor's from_address)
      const fromAddress: string = (tenant as any)?.from_address ?? ''
      const inboundMessages = messages.filter(m => {
        const from = headerVal(m.payload?.headers ?? [], 'From')
        return !from.toLowerCase().includes(fromAddress.toLowerCase())
          && !from.toLowerCase().includes('no-reply')
          && !from.toLowerCase().includes('noreply')
      })

      for (const msg of inboundMessages) {
        const gmailMsgId = msg.id ?? ''

        // Check if we've already processed this message
        const { data: existing } = await supabase
          .from('replies')
          .select('id')
          .eq('tenant_id', tenantId)
          // Use metadata to store gmail_message_id
          .eq('outreach_event_id', outreach.id)
          .maybeSingle()

        // Skip if already processed this thread's reply
        if (existing) continue

        const headers = msg.payload?.headers ?? []
        const fromEmail = headerVal(headers, 'From').match(/<([^>]+)>/)?.[1]
          ?? headerVal(headers, 'From')
        const body = extractBody(msg.payload)
        const receivedAt = new Date(parseInt(msg.internalDate ?? '0', 10)).toISOString()

        if (!body.trim()) continue

        // Get brand name
        const { data: brand } = await supabase
          .from('brands')
          .select('brand_name')
          .eq('id', outreach.brand_id)
          .single()

        const brandName = (brand as any)?.brand_name ?? 'Unknown Brand'

        // Classify intent
        const intentResult = await classifyIntent(body, outreach.subject ?? '', brandName)
        stats.newReplies++

        // Draft response if warm
        let draftResponse_: string | null = null
        if (intentResult.is_warm) {
          draftResponse_ = await draftResponse(
            body, intentResult.intent, brandName, outreach.subject ?? '', calLink,
          )
          stats.warmReplies++
        }

        // Handle opt-out
        if (intentResult.intent === 'unsubscribe') {
          await supabase.from('opt_outs').upsert({
            tenant_id: tenantId,
            brand_id: outreach.brand_id,
            contact_email: fromEmail.toLowerCase(),
            recorded_at: new Date().toISOString(),
          }, { onConflict: 'tenant_id,contact_email' })
          stats.optOuts++
        }

        // Insert reply
        await supabase.from('replies').insert({
          tenant_id: tenantId,
          brand_id: outreach.brand_id,
          outreach_event_id: outreach.id,
          raw_content: body.slice(0, 5000),
          from_email: fromEmail,
          received_at: receivedAt,
          intent: intentResult.intent,
          intent_confidence: intentResult.confidence,
          draft_response: draftResponse_
            ? { text: draftResponse_, generated_at: new Date().toISOString() }
            : null,
          needs_operator_review: intentResult.is_warm,
          resolved: false,
        })

        // Update outreach event status
        await supabase
          .from('outreach_events')
          .update({ status: 'replied' })
          .eq('id', outreach.id)

        // Update brand status for warm replies
        if (intentResult.is_warm) {
          const statusMap: Record<string, string> = {
            warm_interested: 'replied_warm',
            warm_send_more: 'replied_send_more',
            request_intro_call: 'call_booked',
          }
          const newStatus = statusMap[intentResult.intent]
          if (newStatus) {
            await supabase
              .from('brands')
              .update({ status: newStatus })
              .eq('id', outreach.brand_id)
          }
        }

        console.log(`[reply_triage] ${brandName}: ${intentResult.intent} (${intentResult.confidence}%)`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[reply_triage] Thread ${threadId} failed: ${msg}`)
    }
  }

  return stats
}
