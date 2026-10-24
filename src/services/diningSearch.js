const fields = 'places.id,places.displayName,places.formattedAddress,places.addressComponents,places.googleMapsUri,places.rating,places.userRatingCount,places.priceRange,places.currentOpeningHours,places.businessStatus,nextPageToken'

export async function searchDining(location, { signal, pageToken } = {}) {
  const key = import.meta.env?.VITE_GOOGLE_MAPS_API_KEY
  if (!key) throw new Error('Google dining search needs a configured API key.')
  const response = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST', signal,
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': fields },
    body: JSON.stringify({ textQuery: `restaurants, cafes and dining in ${location.label}`, regionCode: 'US', pageSize: 20, ...(pageToken ? { pageToken } : {}), locationBias: { circle: { center: { latitude: location.latitude, longitude: location.longitude }, radius: 5000 } } }),
  })
  const data = await response.json()
  if (!response.ok) {
    const reason = data.error?.details?.find(detail => detail.reason)?.reason
    throw new Error(reason === 'SERVICE_DISABLED' ? 'Enable Places API (New) for this Google Cloud project to load restaurants.' : response.status === 403 ? 'Google dining search was denied. Check that Places API (New), billing, and this site’s key permissions are enabled.' : response.status === 429 ? 'Google dining search is busy or its quota has been reached. Please try again later.' : 'Google dining search could not load. Please try again.')
  }
  const places = (data.places || []).filter(place => place.businessStatus !== 'CLOSED_PERMANENTLY' && place.addressComponents?.some(part => part.types?.includes('country') && part.shortText === 'US'))
  return { places, nextPageToken: data.nextPageToken || '' }
}

export function diningPrice(place) {
  const range = place.priceRange
  const amount = money => money && money.currencyCode === 'USD' ? Number(money.units || 0) + Number(money.nanos || 0) / 1e9 : null
  return { min: amount(range?.startPrice), max: amount(range?.endPrice) }
}
export function matchesDiningBudget(place, budget) {
  const price = diningPrice(place)
  if (budget.min !== '' && budget.max !== '' && budget.min > budget.max) return false
  return (price.min === null || budget.min === '' || price.min >= budget.min) && (price.max === null || budget.max === '' || price.max <= budget.max)
}
