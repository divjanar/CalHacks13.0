const STORAGE = 'table8-dietary-reviews-v1'
const TTL = 24 * 60 * 60 * 1000
const listeners = new Set()
let snapshot = {}
const serverSnapshot = {}

export function reviewCacheKey(dish, preferences) {
  return JSON.stringify([
    { id: dish.id, name: dish.name, description: dish.description || '', evidence: dish.evidence || '', listedIngredients: dish.listedIngredients || [], possibleAllergens: dish.possibleAllergens || [], extractionComplete: !dish.extractionStatus || dish.extractionStatus === 'readable' },
    { diet: preferences.diet || '', allergies: [...new Set(preferences.allergies || [])].sort(), allergiesAnswered: preferences.allergiesAnswered === true, notes: preferences.notes || '', religiousDetails: preferences.religiousDetails || '' },
  ])
}
function valid(value) {
  return value && typeof value.dishId === 'string' && ['potential', 'conflict', 'unknown'].includes(value.profileStatus) && typeof value.reason === 'string' && Array.isArray(value.concerns)
}
export function restoreReviews() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(STORAGE) || '{}')
    const fresh = Object.fromEntries(Object.entries(stored).filter(([, entry]) => Date.now() - entry.at < TTL && valid(entry.value)))
    snapshot = { ...fresh, ...snapshot }
    for (const listener of listeners) listener()
  } catch { /* Storage is optional. */ }
}
export function storeReview(dish, preferences, value) {
  if (!valid(value) || value.dishId !== dish.id) return
  const fresh = Object.entries(snapshot).filter(([, entry]) => Date.now() - entry.at < TTL)
  snapshot = { ...Object.fromEntries(fresh.slice(-1999)), [reviewCacheKey(dish, preferences)]: { at: Date.now(), value } }
  try { sessionStorage.setItem(STORAGE, JSON.stringify(snapshot)) } catch { /* Continue in memory. */ }
  for (const listener of listeners) listener()
}
export function assessmentsFor(cache, dishes, preferences) {
  return Object.fromEntries(dishes.flatMap(dish => {
    const saved = cache[reviewCacheKey(dish, preferences)]
    return saved && Date.now() - saved.at < TTL ? [[dish.id, saved.value]] : []
  }))
}
export const getReviewSnapshot = () => snapshot
export const getServerReviewSnapshot = () => serverSnapshot
export function subscribeReviews(listener) { listeners.add(listener); return () => listeners.delete(listener) }
