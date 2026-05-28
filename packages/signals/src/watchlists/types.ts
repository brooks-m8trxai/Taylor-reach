/** A pre-validated brand we actively monitor for partnership signals. */
export interface WatchlistBrand {
  name: string
  domain: string | null
  igHandle?: string | null
  /** Canonical category string written to brands.brand_category */
  category: string
  /** Haiku-equivalent category_fit — we know these brands, no LLM needed */
  categoryFit: number
  founderAttributes?: {
    mom_founded?: boolean
    women_founded?: boolean
    bipoc_founded?: boolean
    lgbtq_focused?: boolean
    adoption_focused?: boolean
  }
}
