import type { WatchlistBrand } from './types'

/** Baby registry platforms, gifting services, and milestone-moment brands. */
export const REGISTRY_GIFTING: WatchlistBrand[] = [
  { name: 'Babylist',        domain: 'babylist.com',          category: 'baby registry',      categoryFit: 90 },
  { name: 'Maisonette',      domain: 'maisonette.com',        category: 'baby/kids retailer', categoryFit: 83, founderAttributes: { women_founded: true } },
  { name: 'Tinybeans',       domain: 'tinybeans.com',         category: 'family gifting app', categoryFit: 85, founderAttributes: { women_founded: true } },
  { name: 'Pottery Barn Kids',domain: 'potterybarnkids.com',  category: 'baby gifting',       categoryFit: 82 },
  { name: 'Crane Baby',      domain: 'cranebaby.com',         category: 'registry/gifting',   categoryFit: 85 },
  { name: 'Tubby Todd',      domain: 'tubbytodd.com',         category: 'baby gifting',       categoryFit: 93, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'Spearmint Love',  domain: 'spearmintlove.com',     category: 'baby gifting',       categoryFit: 88, founderAttributes: { mom_founded: true, women_founded: true } },
  { name: 'The Tot',         domain: 'thetot.com',            category: 'baby/kids retailer', categoryFit: 85, founderAttributes: { women_founded: true } },
]
