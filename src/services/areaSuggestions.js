const california = { rectangle: { low: { latitude: 32.5, longitude: -124.5 }, high: { latitude: 42.01, longitude: -114.1 } } }
export async function suggestAreas(input, signal) {
  const key = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('Location suggestions are unavailable. You can still type your area.')
  async function request(locationRestriction) {
    const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text' },
      body: JSON.stringify({ input, languageCode: 'en', includedRegionCodes: ['us'], includedPrimaryTypes: ['(cities)'], ...(locationRestriction ? { locationRestriction } : {}) }),
    })
    if (!response.ok) throw new Error('Location suggestions could not load. You can still type your area.')
    const data = await response.json()
    return (data.suggestions || []).map(item => item.placePrediction).filter(item => item?.placeId && item.text?.text).map(item => ({ id: item.placeId, label: item.text.text }))
  }
  const results = await Promise.allSettled([request(california), request()])
  if (signal.aborted) return []
  if (results.every(result => result.status === 'rejected')) throw results[0].reason
  const local = results[0].status === 'fulfilled' ? results[0].value.filter(item => /, (?:CA|California)(?:,|$)/i.test(item.label)) : []
  const national = results[1].status === 'fulfilled' ? results[1].value : []
  const unique = [...new Map([...local, ...national].map(item => [item.id, item])).values()]
  return unique.sort((a, b) => Number(/, (?:CA|California)(?:,|$)/i.test(b.label)) - Number(/, (?:CA|California)(?:,|$)/i.test(a.label)))
}

const resolved = new Map()
export async function resolveLocalArea(input, signal, suggestion) {
  const text = input.trim()
  if (!text) throw new Error('Enter a city, state and country.')
  if (resolved.has(text.toLowerCase())) return resolved.get(text.toLowerCase())
  const first = suggestion || (await suggestAreas(text, signal))[0]
  if (!first) throw new Error('No matching US city was found. Try a nearby city or add a state.')
  const response = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(first.id)}`, {
    signal, headers: { 'X-Goog-Api-Key': import.meta.env?.VITE_GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': 'addressComponents' },
  })
  if (!response.ok) throw new Error('Could not complete this area. Select a suggested city and try again.')
  const data = await response.json()
  const part = type => data.addressComponents?.find(item => item.types?.includes(type))
  const city = part('locality')?.longText || part('postal_town')?.longText
  const state = part('administrative_area_level_1')?.longText
  const country = part('country')
  if (!city || !state || country?.shortText !== 'US') throw new Error('Choose a US city with a state and country.')
  const label = `${city}, ${state}, ${country.longText}`
  resolved.set(text.toLowerCase(), label)
  resolved.set(label.toLowerCase(), label)
  return label
}
