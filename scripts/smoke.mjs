import assert from 'node:assert/strict'
import React from 'react'
import { renderToString } from 'react-dom/server'
import { createServer } from 'vite'
import { religiousDietOptions } from '../src/data/menu.js'
import { isUniversityEmail } from '../src/data/universityEmail.js'
import { dietaryGuidance } from '../src/data/dietaryGuidance.js'

for (const email of ['student@university.edu', 'student@dept.university.edu', 'STUDENT@SCHOOL.EDU']) assert.equal(isUniversityEmail(email), true)
for (const email of ['student@gmail.com', 'student@school.edu.example.com', 'student@school.education', 'student@edu', 'student@.edu', 'student@@school.edu']) assert.equal(isUniversityEmail(email), false)

for (const diet of religiousDietOptions) {
  if (diet !== 'Other') assert.ok(dietaryGuidance[diet]?.meaning)
}

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' })
const originalWindow = globalThis.window
const originalLocalStorage = globalThis.localStorage
const originalStorage = globalThis.sessionStorage
let saved = null
globalThis.window = { location: { hash: '#/' } }
globalThis.sessionStorage = { getItem: () => saved }
const routes = ['home', 'discover', 'dinner', 'signin', 'preferences', 'verify', 'consent', 'confirmation', 'request-received', 'table', 'safety', 'report', 'food', 'reading', 'checking', 'unavailable', 'confirmed', 'ui-kit', 'settings', 'user-preferences', 'signup', 'missing-page']
try {
  const { default: App } = await server.ssrLoadModule('/src/App.jsx')
  for (const requested of [false, true]) {
    saved = requested ? JSON.stringify({ requested: true, signedIn: true, profile: { firstName: 'Alexandra', lastName: 'Rivera', preferredFirstName: 'Alex' }, verified: true, consent: true, restaurantConfirmed: true, dinnerId: 'pasta', preferences: { diet: 'Vegan', allergies: ['Milk'], notes: '', budget: '45' } }) : null
    for (const route of routes) {
      window.location.hash = route === 'home' ? '#/' : `#/${route}`
      const html = renderToString(React.createElement(App))
      assert.match(html, /id="main-content"/)
      if (requested) { assert.match(html, /Account options for Alex/); assert.doesNotMatch(html, /href="#\/signin">Sign in/) }
      if (route === 'signin') assert.doesNotMatch(html, /name="preferredFirstName"|name="firstName"|name="lastName"/)
      assert.doesNotMatch(html, /IMPLEMENTATION IN PROGRESS|Design access is needed/)
      if (route === 'table') {
        if (requested) assert.match(html, /Your dinner plan/)
        else { assert.match(html, /Find your next dinner/); assert.doesNotMatch(html, /Your dinner plan|Your seat|Preview check-in|Cancel seat/) }
      }
      if (route === 'discover' && requested) { assert.match(html, /Ghirardelli Chocolate Experience/); assert.match(html, /Arsicault Bakery/); assert.match(html, /Piccino/); assert.match(html, /Salt &amp; Straw/) }
      if (route === 'discover' && !requested) { assert.match(html, /University email/); assert.doesNotMatch(html, /dinner-cards|map-venue-legend/) }
      if (route === 'safety' && !requested) {
        assert.doesNotMatch(html, /href="#\/table"|href="#\/report"|Browse dinners/)
        assert.match(html, /href="#\/signup"[^>]*>Create an account/)
      }
      if (route === 'safety' && requested) assert.match(html, /href="#\/report"/)
      if (route === 'signup') { assert.match(html, /Create your account/); assert.match(html, /name="firstName"/); assert.match(html, /name="lastName"/) }
      if (route === 'confirmation') assert.match(html, /jumping-host/)
      if (route === 'dinner' && requested) assert.match(html, /Island flavors &amp; new possibilities/)
      if (route === 'food') {
        assert.match(html, /href="#\/dinner"[^>]*>Back to reservation options/)
        assert.doesNotMatch(html, /Back to my table/)
        assert.match(html, /Reading the official restaurant menu/); assert.doesNotMatch(html, /Booking status|DOES NOT MATCH|AI REVIEW PENDING/)
      }
      if (route === 'dinner') { assert.match(html, /Join table/); assert.doesNotMatch(html, /Find my seat/) }
      if (route === 'user-preferences' && requested) { assert.match(html, /Save preferences/); assert.match(html, /Hindu/); assert.doesNotMatch(html, /Continue reservation/) }
      if (route === 'preferences') {
        assert.doesNotMatch(html, /Available evening|Meal budget|Accessibility requests/)
        assert.match(html, /Hindu/)
      }
    }
  }
  // Cached source items render immediately while Gemini review is pending.
  const cachedDishes = Array.from({ length: 201 }, (_, index) => ({ extractionStatus: 'pending', id: `fixture-${index}`, name: `Fixture rice ${index}`, price: '$5', description: 'Rice', listedIngredients: ['rice'], evidence: 'Rice $5', possibleAllergens: [] }))
  const fixture = { venueId: 'ChIJayGBoiRAjoARzA3Sc9KqN3g', mode: 'full', sourceUrl: 'https://santacruzdiner.com/-food-menu', dishes: cachedDishes }
  const fixtureKey = JSON.stringify([fixture.venueId, fixture.sourceUrl, 'full'])
  globalThis.localStorage = { getItem: key => key === 'table8-extracted-menu-v7' ? JSON.stringify([{ key: fixtureKey, at: Date.now(), menu: fixture }]) : null }
  saved = JSON.stringify({ dinnerId: 'midweek', preferences: { diet: 'Hindu non-veg', allergies: ['Milk'], allergiesAnswered: true } })
  window.location.hash = '#/food'
  const cachedFood = renderToString(React.createElement(App))
  assert.equal((cachedFood.match(/class="card menu-option"/g) || []).length, 201)
  assert.match(cachedFood, /Top options/)
  assert.match(cachedFood, /Full menu/)
  assert.doesNotMatch(cachedFood, /Reading the official restaurant menu|No conflict, double check with the waiter|Gemini review pending/)
  globalThis.localStorage = originalLocalStorage
  saved = JSON.stringify({ signedIn: true, requested: false, restaurantConfirmed: false, dinnerId: 'pasta' })
  window.location.hash = '#/table'
  const cancelledTable = renderToString(React.createElement(App))
  assert.match(cancelledTable, /Find your next dinner/)
  assert.match(cancelledTable, /href="#\/discover"[^>]*>Discover dinners/)
  assert.doesNotMatch(cancelledTable, /Makai Island|Your dinner plan|Preview check-in|Cancel seat/)
  for (const diet of [...religiousDietOptions, 'Other religious dietary needs']) {
    saved = JSON.stringify({ preferences: { diet, religiousDetails: 'No sesame oil, please.' } })
    window.location.hash = '#/preferences'
    const html = renderToString(React.createElement(App))
    assert.doesNotMatch(html, /Other religious dietary needs/)
    assert.match(html, /No sesame oil, please/)
    if (diet === 'Other' || diet === 'Other religious dietary needs') {
      assert.match(html, /Your dietary needs/)
      assert.doesNotMatch(html, /class="notice dietary-guidance"/)
    } else {
      const heading = dietaryGuidance[diet].preset ? 'restrictions' : 'dietary practices'
      assert.ok(html.replace(/<!--.*?-->/g, '').includes(`${diet} ${heading}`))
    }
  }
  saved = JSON.stringify({ preferences: { diet: 'Hindu', religiousDetails: 'No beef.' } })
  window.location.hash = '#/preferences'
  const migrated = renderToString(React.createElement(App))
  assert.match(migrated, /value="" disabled="" selected=""/)
  for (const bookingIntent of [false, true]) {
    saved = JSON.stringify({ signedIn: true, bookingIntent })
    window.location.hash = '#/consent'
    const html = renderToString(React.createElement(App))
    assert.ok(html.includes(bookingIntent ? 'Request my seat' : 'Continue to dinners'))
  }
  console.log(`Passed dietary-rule checks, religious guidance/Other migration checks, and ${routes.length * 2} route renders (fresh and populated demo sessions).`)
} finally {
  await server.close()
  globalThis.window = originalWindow
  globalThis.sessionStorage = originalStorage
  globalThis.localStorage = originalLocalStorage
}
