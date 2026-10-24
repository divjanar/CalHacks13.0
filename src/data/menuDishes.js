const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim()
const unique = items => [...new Map(items.map(item => [JSON.stringify(item), item])).values()]

// Section headings can differ across overlapping menu excerpts. A printed
// name and price identify the same option; different prices stay separate.
export function deduplicateDishes(dishes) {
  const byOption = new Map()
  for (const dish of dishes) {
    const key = dish.sourceItemId || JSON.stringify([normalize(dish.name), normalize(dish.price)])
    const previous = byOption.get(key)
    if (!previous) {
      byOption.set(key, { ...dish, listedIngredients: [...(dish.listedIngredients || [])], possibleAllergens: [...(dish.possibleAllergens || [])] })
      continue
    }
    previous.listedIngredients = [...new Map([...previous.listedIngredients, ...(dish.listedIngredients || [])].map(item => [normalize(item), item])).values()]
    previous.possibleAllergens = unique([...previous.possibleAllergens, ...(dish.possibleAllergens || [])])
    if (dish.evidence && !previous.evidence?.includes(dish.evidence)) previous.evidence = [previous.evidence, dish.evidence].filter(Boolean).join('\n')
    if ((dish.description || '').length > (previous.description || '').length) previous.description = dish.description
    if (previous.matching || dish.matching) {
      const a = previous.matching || {}, b = dish.matching || {}
      const hasConflict = Boolean(a.hasConflict || b.hasConflict)
      const assessed = Boolean(a.assessed && b.assessed)
      previous.matching = {
        ...a, assessed, hasConflict,
        recommended: assessed && !hasConflict && Boolean(a.recommended && b.recommended),
        suitabilityScore: Math.min(a.suitabilityScore || 0, b.suitabilityScore || 0),
        status: hasConflict ? 'POSSIBLE CONFLICT' : assessed ? 'NEEDS CONFIRMATION' : 'NOT ASSESSED',
        allergyConflicts: unique([...(a.allergyConflicts || []), ...(b.allergyConflicts || [])]),
        dietConflicts: unique([...(a.dietConflicts || []), ...(b.dietConflicts || [])]),
      }
    }
  }
  return [...byOption.values()]
}
