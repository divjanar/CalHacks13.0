import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { resolveLocalArea, suggestAreas } from './areaSuggestions'

beforeEach(() => { vi.stubEnv('VITE_GOOGLE_MAPS_API_KEY', 'mock-browser-key') })
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

const predictions = { suggestions: [{ placePrediction: { placeId: 'test-city', text: { text: 'Santa Cruz, CA, USA' } } }] }

test('area suggestions work without an optional abort signal', async () => {
  const fetch = vi.fn(async () => ({ ok: true, json: async () => predictions }))
  vi.stubGlobal('fetch', fetch)
  expect(await suggestAreas('Santa Cruz')).toEqual([{ id: 'test-city', label: 'Santa Cruz, CA, USA' }])
  expect(fetch).toHaveBeenCalledTimes(2)
})

test('saving a profile can resolve its city without an abort signal', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => ({ ok: true, json: async () => url.endsWith(':autocomplete') ? predictions : {
    addressComponents: [
      { types: ['locality'], longText: 'Santa Cruz' },
      { types: ['administrative_area_level_1'], longText: 'California' },
      { types: ['country'], longText: 'United States', shortText: 'US' },
    ],
  } })))
  expect(await resolveLocalArea('Santa Cruz')).toBe('Santa Cruz, California, United States')
})

test('supplied cancelled requests still discard their suggestions', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => predictions })))
  const controller = new AbortController()
  controller.abort()
  expect(await suggestAreas('San Francisco', controller.signal)).toEqual([])
})
