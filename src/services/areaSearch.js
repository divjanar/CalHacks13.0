// Photon GeoJSON API: https://github.com/komoot/photon/blob/master/docs/api-v1.md
const endpoint = import.meta.env?.VITE_GEOCODER_URL || 'https://photon.komoot.io/api/'
const cache = new Map()

export function locationFromFeature(feature) {
  const coordinates = feature?.geometry?.coordinates
  if (feature?.geometry?.type !== 'Point' || !Array.isArray(coordinates)) return null
  const [longitude, latitude] = coordinates
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 85 || Math.abs(longitude) > 180) return null
  const properties = feature.properties || {}
  const name = properties.type === 'county' && !/county/i.test(properties.name || '') ? `${properties.name} County` : properties.name
  const parts = [name, properties.city, properties.state, properties.country].filter(Boolean)
  const label = [...new Set(parts)].join(', ')
  if (!label) return null
  return { latitude, longitude, label, properties }
}

export async function searchAreas(query, signal) {
  query = query.trim().replace(/^sf(?=,|$)/i, 'San Francisco')
  const key = query.toLowerCase()
  if (cache.has(key)) return cache.get(key)
  const states = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia|AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC'
  const explicitState = new RegExp(`(?:^|[,\\s])(?:${states})(?:\\s+\\d{5}(?:-\\d{4})?)?(?:,?\\s+(?:USA|United States))?$`, 'i').test(query.trim())
  async function lookup(text) {
    const url = new URL(endpoint)
    url.searchParams.set('q', `${text}, United States`)
    url.searchParams.set('countrycode', 'us')
    url.searchParams.set('limit', '5')
    url.searchParams.set('lang', 'en')
    const response = await fetch(url, { signal, headers: { Accept: 'application/json' } })
    if (!response.ok) throw new Error(response.status === 429 ? 'Area search is busy. Please wait a moment and try again.' : 'Area search is unavailable. Please try again.')
    const data = await response.json()
    if (!Array.isArray(data.features)) throw new Error('Area search returned an unexpected response. Please try again.')
    return data.features.map(locationFromFeature).filter(location => location && String(location.properties.countrycode).toLowerCase() === 'us')
  }
  let locations
  if (explicitState) locations = await lookup(query.trim())
  else {
    locations = (await lookup(`${query.trim()}, California`)).filter(location => location.properties.state === 'California')
    if (!locations.length) locations = await lookup(query.trim())
  }
  // Photon can rank a county ahead of its namesake city. Prefer the city unless
  // the user explicitly requested a county; retain both choices in the picker.
  if (locations[0]?.properties.type === 'county' && !/\bcounty\b/i.test(query)) {
    const cityIndex = locations.findIndex(location => ['city', 'town', 'village'].includes(location.properties.type) && location.properties.name === locations[0].properties.name)
    if (cityIndex > 0) locations.unshift(...locations.splice(cityIndex, 1))
  }
  cache.set(key, locations)
  return locations
}

export function matchesDinnerArea(dinner, location) {
  if (!location) return true
  const { properties } = location
  // Sample outings exist in California. Never turn a map hit
  // in another city/country into invented restaurant availability.
  if (String(properties.countrycode || '').toLowerCase() !== 'us' || properties.state !== 'California') return false
  // A city within Santa Cruz County is not necessarily the city of Santa Cruz.
  const names = properties.city ? [properties.city] : [properties.name]
  return names.some(value => {
    const name = String(value || '').trim().toLowerCase()
    return name === dinner.area.toLowerCase() || name === `${dinner.area.toLowerCase()} county`
  })
}

export function mapUrls(location) {
  const { latitude, longitude } = location
  // A local area view rather than a world map. Longitude width compensates for latitude.
  const latitudeSpan = 0.035
  const longitudeSpan = Math.min(0.4, 0.06 / Math.cos(latitude * Math.PI / 180))
  const bounds = [Math.max(-180, longitude - longitudeSpan), Math.max(-85, latitude - latitudeSpan), Math.min(180, longitude + longitudeSpan), Math.min(85, latitude + latitudeSpan)]
  const query = new URLSearchParams({ bbox: bounds.join(','), layer: 'mapnik', marker: `${latitude},${longitude}` })
  return {
    embed: `https://www.openstreetmap.org/export/embed.html?${query}`,
    full: `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=13/${latitude}/${longitude}`,
  }
}
