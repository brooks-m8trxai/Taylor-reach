/**
 * Cal.com integration.
 *
 * Generates booking links for Taylor's intro call.
 * Can pre-fill the brand name and notes in the URL so Taylor doesn't have
 * to re-type context when a warm lead books.
 *
 * If CAL_COM_API_KEY is set, we can also use the Cal.com API to create
 * single-use booking links (prevents double-booking from old pitches).
 * Without a key, returns a standard Cal.com link with URL params.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BookingLinkOptions {
  brandName?: string
  notes?: string
  duration?: 15 | 30  // minutes
}

// ─── URL-based link (no API key required) ────────────────────────────────────

export function buildBookingUrl(opts: BookingLinkOptions = {}): string {
  const calLink = process.env.CAL_LINK ?? 'https://cal.com/taylorhumphrey/intro'
  const params = new URLSearchParams()

  if (opts.brandName) {
    params.set('name', `Brand: ${opts.brandName}`)
    params.set('notes', opts.notes ?? `Intro call re: ${opts.brandName} partnership`)
  }
  if (opts.duration) {
    params.set('duration', String(opts.duration))
  }

  const qs = params.toString()
  return qs ? `${calLink}?${qs}` : calLink
}

// ─── Cal.com API: single-use link ────────────────────────────────────────────

export interface SingleUseLink {
  url: string
  expiresAt: string
}

export async function createSingleUseLink(
  opts: BookingLinkOptions = {},
): Promise<SingleUseLink | null> {
  const apiKey = process.env.CAL_COM_API_KEY
  if (!apiKey) {
    // Fall back to standard URL
    return { url: buildBookingUrl(opts), expiresAt: '' }
  }

  try {
    const resp = await fetch('https://api.cal.com/v1/booking-references', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        eventTypeId: process.env.CAL_EVENT_TYPE_ID ?? null,
        expiresAt: new Date(Date.now() + 30 * 24 * 3_600_000).toISOString(), // 30 day expiry
        metadata: { brandName: opts.brandName, notes: opts.notes },
      }),
    })

    if (!resp.ok) {
      console.error('[cal] Single-use link creation failed:', await resp.text())
      return { url: buildBookingUrl(opts), expiresAt: '' }
    }

    const data = await resp.json() as { url?: string; link?: string; expiresAt?: string }
    return {
      url: data.url ?? data.link ?? buildBookingUrl(opts),
      expiresAt: data.expiresAt ?? '',
    }
  } catch (err) {
    console.error('[cal] API call failed:', err)
    return { url: buildBookingUrl(opts), expiresAt: '' }
  }
}

// ─── Inject into pitch body ────────────────────────────────────────────────────

/**
 * Takes an email body and replaces the Cal.com placeholder or appends the link.
 * Called by the draft writer to inject the correct booking link.
 */
export function injectBookingLink(body: string, brandName: string): string {
  const link = buildBookingUrl({ brandName })

  // If the draft already has a cal.com link, replace it
  if (body.includes('cal.com')) {
    return body.replace(/https?:\/\/cal\.com\/[^\s)>"\n]+/, link)
  }

  return body
}
