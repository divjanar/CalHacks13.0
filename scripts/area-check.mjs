import assert from 'node:assert/strict'
import { locationFromFeature, matchesDinnerArea, mapUrls, searchAreas } from '../src/services/areaSearch.js'
const feature = (longitude = -122.03, latitude = 36.97, countrycode = 'US') => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [longitude, latitude] }, properties: { name: 'Santa Cruz', state: 'California', country: 'United States', countrycode } })
const location = locationFromFeature(feature())
assert.equal(matchesDinnerArea({ area: 'Santa Cruz' }, location), true)
assert.equal(matchesDinnerArea({ area: 'Capitola' }, location), false)
assert.equal(matchesDinnerArea({ area: 'Santa Cruz' }, { ...location, properties: { ...location.properties, name: 'Capitola', city: 'Capitola', county: 'Santa Cruz' } }), false)
assert.equal(matchesDinnerArea({ area: 'Santa Cruz' }, locationFromFeature(feature(-63, -17, 'BO'))), false)
assert.equal(locationFromFeature(feature(500)), null)
assert.equal(locationFromFeature(feature(-122, 95)), null)
const map = new URL(mapUrls(location).embed)
const [west, south, east, north] = map.searchParams.get('bbox').split(',').map(Number)
assert.ok(west < location.longitude && location.longitude < east && south < location.latitude && location.latitude < north)
assert.ok(east - west < .2 && north - south < .1)
const sf = { ...location, properties: { ...location.properties, name: 'San Francisco', city: 'San Francisco' } }
assert.equal(matchesDinnerArea({ area: 'San Francisco' }, sf), true)
assert.equal(matchesDinnerArea({ area: 'Santa Cruz' }, sf), false)
const originalFetch = globalThis.fetch
let requests = 0
try {
  globalThis.fetch = async () => { requests++; return { ok: true, json: async () => ({ features: [feature()] }) } }
  assert.equal((await searchAreas('Santa Cruz, CA'))[0].latitude, 36.97)
  await searchAreas('  santa cruz, ca  ')
  assert.equal(requests, 1, 'Repeated queries should use the in-memory cache')
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ features: [{ ...feature(), properties: { ...feature().properties, type: 'county' } }, { ...feature(), properties: { ...feature().properties, type: 'city' } }] }) })
  assert.equal((await searchAreas('Namesake city fixture'))[0].properties.type, 'city')
  assert.equal((await searchAreas('County fixture'))[0].properties.type, 'county')
  globalThis.fetch = async url => {
    assert.equal(new URL(url).searchParams.get('countrycode'), 'us')
    assert.match(new URL(url).searchParams.get('q'), /United States$/)
    return { ok: true, json: async () => ({ features: [feature(-63, -17, 'BO'), feature()] }) }
  }
  assert.equal((await searchAreas('US only fixture')).length, 1)
  assert.equal((await searchAreas('US only fixture'))[0].properties.countrycode, 'US')
  globalThis.fetch = async url => {
    assert.match(new URL(url).searchParams.get('q'), /Oakland, California, United States/)
    return { ok: true, json: async () => ({ features: [feature()] }) }
  }
  await searchAreas('Oakland')
  globalThis.fetch = async url => {
    assert.equal(new URL(url).searchParams.get('q'), 'Portland, OR, United States')
    return { ok: true, json: async () => ({ features: [{ ...feature(), properties: { ...feature().properties, state: 'Oregon' } }] }) }
  }
  assert.equal((await searchAreas('Portland, OR'))[0].properties.state, 'Oregon')
  globalThis.fetch = async url => {
    assert.equal(new URL(url).searchParams.get('q'), 'San Francisco, California, United States')
    return { ok: true, json: async () => ({ features: [feature()] }) }
  }
  await searchAreas('sf')
  let fallbackRequests = 0
  globalThis.fetch = async url => {
    fallbackRequests++
    const california = new URL(url).searchParams.get('q').includes('California')
    return { ok: true, json: async () => ({ features: california ? [] : [feature()] }) }
  }
  await searchAreas('Fallback area fixture')
  assert.equal(fallbackRequests, 2)
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ features: [] }) })
  assert.deepEqual(await searchAreas('No such area fixture'), [])
  globalThis.fetch = async () => ({ ok: false, status: 429 })
  await assert.rejects(searchAreas('Rate limit fixture'), /busy/)
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ invalid: true }) })
  await assert.rejects(searchAreas('Invalid response fixture'), /unexpected response/)
  console.log('Passed geographic matching, zoom bounds, query caching, no-results, rate-limit and invalid-response checks.')
} finally { globalThis.fetch = originalFetch }
