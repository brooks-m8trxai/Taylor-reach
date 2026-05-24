/**
 * Social Media Brain — IG angle generator.
 *
 * Given a content radar signal (celebrity baby news, name trend article, parenting
 * culture moment), generates:
 *   1. A 2-3 sentence plain-English recap of what the story is about
 *   2. 3-4 Instagram angles Taylor can use for a post, each with:
 *        - format: Reel | Carousel | Single | Story
 *        - hook: viral opening line (under 10 words, no em-dash, no AI-tell)
 *        - concept: what the post actually does (1-2 sentences)
 *        - caption_starter: the first 1-2 sentences of the caption copy
 *
 * Uses Claude Sonnet (not Haiku) — angles need to feel genuinely creative,
 * not templated.
 */

import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Types ────────────────────────────────────────────────────────────────────

export type ContentFormat = 'Reel' | 'Carousel' | 'Single' | 'Story'

export interface ContentAngle {
  format: ContentFormat
  hook: string          // Viral opening line. Under 10 words. No em-dash.
  concept: string       // What the post shows/does (1-2 sentences)
  caption_starter: string  // First 1-2 sentences of caption copy (writes like Taylor)
}

export interface ContentAnglesResult {
  recap: string         // Plain-English story summary (2-3 sentences)
  angles: ContentAngle[]
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a social media strategist for Taylor Humphrey, a baby name expert and Instagram content creator with 50K+ followers.

Taylor's brand: she is THE authority on baby names. She covers name meanings, origins, name trends, celebrity baby names, historical name revivals, and the psychology of naming. Her tone is warm, witty, and confident — like a smart friend who just happens to know everything about names.

Her Instagram formats:
- Reel: short-form video, needs a strong spoken hook in the first 3 seconds
- Carousel: swipeable slides (great for lists, breakdowns, before/after, "names that mean X")
- Single: one image or graphic, punchy caption
- Story: quick poll, Q&A, or "would you name your baby this?" interactive

Your job:
1. Write a 2-3 sentence recap of the story (factual, plain English, no fluff)
2. Generate exactly 3-4 Instagram content angles Taylor could make from this story
3. Each angle must feel genuinely distinct — don't give her 4 versions of the same idea

Voice rules (Taylor sounds like this):
- Direct, not flowery: "This name is having a moment" not "There is a fascinating resurgence occurring"
- Opinions welcome: "Love this name, hate this trend" is on-brand
- Short sentences. No em-dashes. No ellipsis abuse.
- Hooks must be conversational, not click-bait-y
- Caption starters sound like a real person talking, not a press release

Respond with valid JSON only. No markdown. Format:
{
  "recap": "2-3 sentence factual story summary",
  "angles": [
    {
      "format": "Reel|Carousel|Single|Story",
      "hook": "opening line under 10 words",
      "concept": "what this post does in 1-2 sentences",
      "caption_starter": "first 1-2 sentences of caption copy"
    }
  ]
}`

// ─── Main function ────────────────────────────────────────────────────────────

export async function generateContentAngles(signal: {
  headline: string
  excerpt: string
  url: string
  source: string
}): Promise<ContentAnglesResult> {
  const userPrompt = `Source: ${signal.source}
Headline: ${signal.headline}
${signal.excerpt ? `\nStory excerpt:\n${signal.excerpt}` : ''}
${signal.url ? `\nOriginal URL: ${signal.url}` : ''}

Generate a recap and 3-4 Instagram angles Taylor Humphrey can make from this story.`

  try {
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1200,
      temperature: 0.8,   // higher than pitch — we want creative variety
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const rawText = msg.content[0].type === 'text' ? msg.content[0].text : ''
    const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
    const parsed = JSON.parse(cleaned) as ContentAnglesResult

    // Light sanitization — strip em-dashes from angles
    parsed.recap = parsed.recap?.replace(/\s+—\s+/g, '. ').replace(/—/g, ', ').trim() ?? ''
    parsed.angles = (parsed.angles ?? []).map(a => ({
      ...a,
      hook: a.hook?.replace(/—/g, ', ').trim() ?? '',
      concept: a.concept?.replace(/—/g, ', ').trim() ?? '',
      caption_starter: a.caption_starter?.replace(/—/g, ', ').trim() ?? '',
    }))

    return parsed
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[content_angles] Failed for "${signal.headline.slice(0, 60)}": ${msg}`)
    // Return a graceful fallback so the UI doesn't break
    return {
      recap: signal.excerpt?.slice(0, 300) ?? signal.headline,
      angles: [],
    }
  }
}
