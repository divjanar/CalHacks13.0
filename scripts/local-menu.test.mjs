import test from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { analyzeDishLocally, extractListedIngredients } from '../src/data/localMenuAnalysis.js'

const require = createRequire(import.meta.url)
const preferences = { diet: 'Hindu non-veg', allergies: ['Milk'], allergiesAnswered: true }
const captain = { id: 'captain', name: 'Captain’s Plate', price: '$16.95', description: 'Deep-fried calamari, prawns, and battered fish. No substitutions on this item.', evidence: 'Deep-fried calamari, prawns, and battered fish.' }

test('ingredients come from exact menu words, not inferred recipes or stale AI output', () => {
  const result = analyzeDishLocally({ ...captain, listedIngredients: ['butter'], possibleAllergens: [{ allergen: 'Milk', evidence: 'butter' }], matching: { assessed: true } }, preferences)
  assert.deepEqual(result.listedIngredients, ['calamari', 'prawns', 'battered fish'])
  assert.ok(result.ingredientEvidence.every(item => captain.description.includes(item.evidence)))
  assert.equal(result.matching.hasConflict, false)
  assert.equal(result.matching.localCandidate, true)
  assert.equal(result.matching.assessed, false)
  assert.equal(result.matching.recommended, false)
  for (const field of ['ingredientCompleteness', 'sourcing', 'crossContact']) assert.equal(result[field], 'unknown')
})
test('local dairy and Hindu non-veg warnings reflect only the saved account needs', () => {
  const dish = { name: 'Ham & Cheese Croissant', description: 'Ham and cheese.' }
  const result = analyzeDishLocally(dish, preferences)
  assert.equal(result.matching.hasConflict, true)
  assert.equal(result.matching.allergyConflicts[0].allergen, 'Milk')
  assert.equal(result.matching.dietConflicts[0].group, 'Hindu non-veg')
  assert.match(result.matching.dietConflicts[0].evidence.join(' '), /ham/)
  const unrestricted = analyzeDishLocally(dish, { diet: 'No preference', allergies: [], allergiesAnswered: true })
  assert.equal(unrestricted.matching.hasConflict, false)
})
test('changing allergies immediately changes local warnings without provider calls', () => {
  const result = analyzeDishLocally(captain, { ...preferences, allergies: ['Shellfish'] })
  assert.equal(result.matching.localCandidate, false)
  assert.equal(result.matching.allergyConflicts[0].allergen, 'Shellfish')
})
test('plant alternatives and explicitly omitted ingredients do not produce animal warnings', () => {
  for (const description of ['tofu with vegan cheese', 'rice with coconut milk', 'tofu and plant-based bacon', 'rice without cheese', 'egg-free rice']) {
    const result = analyzeDishLocally({ name: 'Bowl', description }, { diet: 'Vegan', allergies: ['Milk', 'Eggs'], allergiesAnswered: true })
    assert.equal(result.matching.hasConflict, false, description)
  }
  const nuts = analyzeDishLocally({ name: 'Drink', description: 'almond milk' }, { allergies: ['Tree nuts'], allergiesAnswered: true })
  assert.equal(nuts.matching.hasConflict, true)
})
test('missing recipes, sourcing requirements, and custom notes stay unconfirmed', () => {
  assert.deepEqual(extractListedIngredients({ name: 'Plain Croissant', description: '' }), [])
  assert.equal(analyzeDishLocally({ name: 'Plain Croissant' }, preferences).matching.localCandidate, false)
  assert.equal(analyzeDishLocally(captain, { ...preferences, notes: 'Avoid garlic' }).matching.localCandidate, false)
  for (const diet of ['Halal', 'Kosher', 'Other']) assert.equal(analyzeDishLocally({ name: 'Rice bowl', description: 'rice' }, { ...preferences, diet }).matching.localCandidate, false)
})
test('saved religious presets still warn for Jain roots, vegan dairy, and kosher meat/dairy', () => {
  for (const [diet, description] of [['Jain', 'potato and onion'], ['Vegan', 'cream cheese'], ['Kosher', 'chicken with cheese']]) {
    assert.equal(analyzeDishLocally({ name: 'Plate', description }, { diet, allergies: [], allergiesAnswered: true }).matching.hasConflict, true)
  }
})

test('full local menu and backend jobs process all items without loading the Gemini SDK', async () => {
  const Module = require('node:module')
  const original = Module._load
  let sdkLoads = 0
  const venue = require('../src/data/sampleVenues.json')[0]
  const source = { sourceUrl: venue.menuUrl, fetchedAt: new Date().toISOString(), inventoryComplete: true,
    items: Array.from({ length: 201 }, (_, index) => ({ ...captain, id: `item-${index}`, sourceItemId: `item-${index}` })) }
  Module._load = function (request, parent, ...args) {
    if (request === '@google/genai') { sdkLoads++; throw new Error('Menu must not load Gemini') }
    if (request === './menuFetcher' && parent?.filename.endsWith('urlMenuReader.js')) return { fetchMenuText: async () => source }
    return original.call(this, request, parent, ...args)
  }
  try {
    delete require.cache[require.resolve('../server/urlMenuReader')]
    delete require.cache[require.resolve('../server/menu')]
    const { readMenuUrl } = require('../server/urlMenuReader')
    const { registerMenu } = require('../server/menu')
    const full = await readMenuUrl(venue, { preview: false })
    assert.equal(full.dishes.length, 201)
    assert.equal(full.coverage.extracted, 201)
    assert.ok(full.dishes.every(item => item.analysisMethod === 'local' && item.listedIngredients.length === 3))
    assert.equal((await readMenuUrl(venue, { preview: true })).dishes.length, 8)
    const routes = {}
    let calls = 0
    registerMenu({ post: (url, fn) => routes['POST ' + url] = fn, get: (url, fn) => routes['GET ' + url] = fn }, {
      cacheDir: null, readMenuUrl: async (...args) => { calls++; return readMenuUrl(...args) },
    })
    async function start() {
      let job
      await routes['POST /api/menu/jobs']({ body: { venueId: venue.id, mode: 'full' } }, { status() { return this }, json(value) { job = structuredClone(value) } })
      return job
    }
    const first = await start(), duplicate = await start()
    assert.equal(first.jobId, duplicate.jobId)
    let job
    for (let i = 0; i < 100; i++) {
      routes['GET /api/menu/jobs/:jobId']({ params: { jobId: first.jobId } }, { json(value) { job = structuredClone(value) } })
      if (job.status !== 'running') break
      await new Promise(resolve => setTimeout(resolve, 5))
    }
    assert.equal(job.status, 'ready')
    assert.equal(job.result.dishes.length, 201)
    assert.equal(calls, 1)
    let status
    routes['POST /api/menu/reviews']({}, { status(code) { status = code; return this }, json() {} })
    assert.equal(status, 410)
    assert.equal(sdkLoads, 0)
  } finally { Module._load = original }
})

test('price-line bakery menus normalize descriptions and pass backend validation', async t => {
  const Module = require('node:module'), original = Module._load
  const savedMode = process.env.MENU_READER
  process.env.MENU_READER = 'local'
  t.after(() => { Module._load = original; savedMode === undefined ? delete process.env.MENU_READER : process.env.MENU_READER = savedMode })
  const venue = require('../src/data/sampleVenues.json').find(item => item.id === 'ChIJ90JImRKBhYARXrwUAyZIhqw')
  const source = { sourceUrl: venue.menuUrl, text: 'Plain Croissant\n$5\nHam & Cheese Croissant\n$7.25\nHam and cheese.\nThe Vegetarian\n$15\nRoasted cauliflower, tomatoes and arugula.', items: [] }
  Module._load = function (request, parent, ...args) {
    if (request === './menuFetcher' && parent?.filename.endsWith('urlMenuReader.js')) return { fetchMenuText: async () => source }
    return original.call(this, request, parent, ...args)
  }
  delete require.cache[require.resolve('../server/urlMenuReader')]
  const { readMenuUrl } = require('../server/urlMenuReader')
  const menu = await readMenuUrl(venue, { preview: false })
  assert.equal(menu.dishes.length, 3)
  assert.equal(menu.dishes[0].description, '')
  assert.equal(menu.dishes[1].description, 'Ham and cheese.')
  assert.ok(menu.dishes.every(item => typeof item.description === 'string'))
  assert.ok(menu.dishes[2].listedIngredients.includes('cauliflower'))
  const { registerMenu } = require('../server/menu')
  const routes = {}
  registerMenu({ post: (url, fn) => routes['POST ' + url] = fn, get: (url, fn) => routes['GET ' + url] = fn }, { cacheDir: null, readMenuUrl: async () => menu })
  let job
  await routes['POST /api/menu/jobs']({ body: { venueId: venue.id, mode: 'full' } }, { status() { return this }, json(value) { job = structuredClone(value) } })
  for (let i = 0; i < 100; i++) {
    routes['GET /api/menu/jobs/:jobId']({ params: { jobId: job.jobId } }, { json(value) { job = structuredClone(value) } })
    if (job.status !== 'running') break
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  assert.equal(job.status, 'ready')
  assert.equal(job.result.dishes.length, 3)
})

test('PDF inline prices retain evidence, recipes and alternative prices without add-on rows', () => {
  const { inventoryPricedItems } = require('../server/urlMenuReader')
  const source = { text: 'strozzapreti, spinach, ricotta | 30\npork & beef polpette, tomato, garlic | 18/25\n+ arugula 3 | egg 4\nN/A Penicillin | 15.\nginger, honey, lemon', items: [] }
  inventoryPricedItems(source, { id: 'test' })
  assert.equal(source.items.length, 3)
  assert.equal(source.items[1].price, '$18/25')
  assert.equal(source.items[2].description, 'ginger, honey, lemon')
  const checked = analyzeDishLocally(source.items[0], { ...preferences, allergies: ['Dairy'] })
  assert.equal(checked.matching.hasConflict, true)
  assert.match(source.items[0].evidence, /ricotta/)
})

test('official carousel captions work without inventing recipes, prices or gift items', () => {
  const { parseMenuHtml } = require('../server/menuFetcher')
  const html = '<main><div><h2>Hot Fudge Sundaes</h2><div><span class="ls-carousel-menu__title">Mint Bliss Hot Fudge Sundae</span></div></div><div><h2>Chocolate Gifts</h2><span class="ls-carousel-menu__title">Gift Bag</span></div><p>Published location menu with seasonal selections and opening information.</p></main>'
  const source = parseMenuHtml(html, { id: 'test', displayName: { text: 'Test' } }, 'https://www.ghirardelli.com/stores/sf-experience')
  assert.equal(source.items.length, 1)
  assert.equal(source.items[0].price, '')
  assert.equal(source.items[0].description, '')
  assert.equal(source.inventoryComplete, false)
})

test('blocked ordering site uses a disclosed source listing and never recommends missing recipes', async t => {
  const original = global.fetch
  t.after(() => { global.fetch = original })
  global.fetch = async () => ({ status: 403, ok: false })
  const venue = require('../src/data/sampleVenues.json')[2]
  const { fetchMenuText } = require('../server/menuFetcher')
  const source = await fetchMenuText(venue.id)
  assert.equal(source.items.length, 46)
  assert.match(source.sourceNotice, /saved published menu listing/)
  assert.ok(source.items.every(item => item.evidence && item.ingredientsUnavailable))
  assert.ok(source.items.every(item => !analyzeDishLocally(item, preferences).matching.localCandidate))
})

test('PDF and disclosed saved menus survive a backend job-cache reload', async () => {
  const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path')
  const { registerMenu } = require('../server/menu')
  const venue = require('../src/data/sampleVenues.json')[0]
  for (const sourceType of ['pdf', 'saved_official_listing']) {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'table8-cache-test-'))
    try {
      let calls = 0
      const readMenuUrl = async () => { calls++; return { venueId: venue.id, mode: 'full', sourceType, dishes: [analyzeDishLocally(captain)] } }
      async function run() {
        const routes = {}
        registerMenu({ post: (url, fn) => routes['POST ' + url] = fn, get: (url, fn) => routes['GET ' + url] = fn }, { cacheDir, readMenuUrl })
        let job
        const response = { status() { return this }, json(value) { job = structuredClone(value) } }
        routes['POST /api/menu/jobs']({ body: { venueId: venue.id, mode: 'full' } }, response)
        for (let i = 0; i < 100 && job.status === 'running'; i++) {
          await new Promise(resolve => setTimeout(resolve, 5))
          routes['GET /api/menu/jobs/:jobId']({ params: { jobId: job.jobId } }, response)
        }
        assert.equal(job.status, 'ready')
      }
      await run()
      await run()
      assert.equal(calls, 1)
    } finally {
      for (const name of await fs.readdir(cacheDir)) await fs.unlink(path.join(cacheDir, name))
      await fs.rmdir(cacheDir)
    }
  }
})

test('reader configuration is explicit, rejects missing keys, and isolates API-key caches', t => {
  const names = ['MENU_READER', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_MENU_MODEL']
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]))
  t.after(() => { for (const name of names) saved[name] === undefined ? delete process.env[name] : process.env[name] = saved[name] })
  const { menuSettings } = require('../server/menuSettings')
  delete process.env.MENU_READER
  delete process.env.GEMINI_API_KEY
  assert.equal(menuSettings().reader, 'local')
  process.env.MENU_READER = 'gemini'
  assert.throws(menuSettings, /Configure GEMINI_API_KEY/)
  process.env.GEMINI_API_KEY = 'mock-key-one'
  process.env.GEMINI_MODEL = 'mock-model'
  const first = menuSettings().identity
  process.env.GEMINI_API_KEY = 'mock-key-two'
  assert.notEqual(menuSettings().identity, first)
  process.env.MENU_READER = 'invalid'
  assert.throws(menuSettings, /local or gemini/)
})

test('Gemini reader uses the same inventory and local warnings, and can switch back without a key', async t => {
  const names = ['MENU_READER', 'GEMINI_API_KEY', 'GEMINI_MODEL', 'GEMINI_MENU_MODEL']
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]))
  const Module = require('node:module'), original = Module._load
  t.after(() => {
    Module._load = original
    for (const name of names) saved[name] === undefined ? delete process.env[name] : process.env[name] = saved[name]
  })
  process.env.MENU_READER = 'gemini'
  process.env.GEMINI_API_KEY = 'mock-key'
  process.env.GEMINI_MODEL = 'mock-model'
  const venue = require('../src/data/sampleVenues.json')[0]
  const source = { sourceUrl: venue.menuUrl, inventoryComplete: true, items: [{ ...captain, sourceItemId: captain.id }] }
  let calls = 0
  Module._load = function (request, parent, ...args) {
    if (request === './menuFetcher' && parent?.filename.endsWith('urlMenuReader.js')) return { fetchMenuText: async () => source }
    if (request === './menuReader' && parent?.filename.endsWith('urlMenuReader.js')) return { readMenu: async input => {
      calls++
      assert.equal(input.sourceUrl, venue.menuUrl)
      assert.equal(input.items[0].id, captain.id)
      return { dishes: input.items.map(item => ({ ...item, listedIngredients: ['calamari', 'prawns', 'battered fish'], possibleAllergens: [], extractionStatus: 'readable' })) }
    } }
    return original.call(this, request, parent, ...args)
  }
  delete require.cache[require.resolve('../server/urlMenuReader')]
  const { readMenuUrl } = require('../server/urlMenuReader')
  const gemini = await readMenuUrl(venue, { preview: false })
  assert.equal(gemini.analysisMethod, 'gemini')
  assert.equal(calls, 1)
  const checked = analyzeDishLocally(gemini.dishes[0], { ...preferences, allergies: ['Shellfish'] })
  assert.equal(checked.matching.checkedLocally, true)
  assert.equal(checked.matching.hasConflict, true)
  assert.equal(checked.matching.assessed, false)
  process.env.MENU_READER = 'local'
  delete process.env.GEMINI_API_KEY
  const local = await readMenuUrl(venue, { preview: false })
  assert.equal(local.analysisMethod, 'local')
  assert.equal(local.dishes[0].id, gemini.dishes[0].id)
  assert.equal(calls, 1)
})
