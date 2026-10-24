import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { setTimeout as delay } from 'node:timers/promises'

const target = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
let nextId = 0
const pending = new Map()
const errors = []
ws.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text)
  if (message.id) {
    const promise = pending.get(message.id)
    pending.delete(message.id)
    if (message.error) promise.reject(new Error(message.error.message))
    else promise.resolve(message.result)
  }
})
function call(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); ws.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
async function route(name) {
  await call('Page.navigate', { url: `http://127.0.0.1:5173/#/${name === 'home' ? '' : name}` })
  await delay(130)
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await delay(100) }
async function type(selector, text) {
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
  await call('Input.insertText', { text })
}
try {
  await call('Page.enable'); await call('Runtime.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })
  await route('discover')
  for (let attempt = 0; attempt < 40; attempt++) {
    if (await evaluate('Boolean(document.querySelector("input[type=search]"))')) break
    await delay(100)
  }
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 7)
  async function searchArea(query) {
    await evaluate(`document.querySelector('input[type=search]').select()`)
    await type('input[type=search]', query)
    await evaluate(`document.querySelector('input[type=search]').blur()`)
    for (let attempt = 0; attempt < 60; attempt++) {
      await delay(250)
      if (!await evaluate('document.querySelector(".area-search [role=status]").textContent.includes("Saving")')) break
    }
    const error = await evaluate('document.querySelector(".area-search-error")?.textContent || ""')
    assert.equal(error, '', error)
  }
  assert.equal(await evaluate('document.querySelectorAll(".area-search-form button").length'), 0)
  await click('.discovery-filter summary')
  await evaluate(`[...document.querySelectorAll('.filter-segments button')].find(button => button.textContent === 'Choose a day').click()`)
  await click('button[aria-label="2026-10-21"]')
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 1)
  await evaluate(`[...document.querySelectorAll('.filter-segments button')].find(button => button.textContent === 'Choose a week').click()`)
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 7)
  await click('.discovery-filter summary')
  await evaluate(`document.querySelectorAll('.discovery-filter summary')[1].click()`)
  assert.equal(await evaluate('document.querySelectorAll(".budget-panel .filter-segments").length'), 0)
  assert.equal(await evaluate('document.querySelector("#budget-max").step'), '5')
  await evaluate(`{ const input = document.querySelector('input[aria-label="Maximum budget amount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ''); input.dispatchEvent(new Event('input', {bubbles:true})); }`)
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Maximum budget amount"]').value`), '')
  await evaluate(`{ const input = document.querySelector('input[aria-label="Maximum budget amount"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '47'); input.dispatchEvent(new Event('input', {bubbles:true})); }`)
  assert.equal(await evaluate(`document.querySelector('input[aria-label="Maximum budget amount"]').value`), '47')
  await evaluate(`{ const slider = document.querySelector('#budget-max'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, '25'); slider.dispatchEvent(new Event('input', {bubbles:true})); slider.dispatchEvent(new Event('change', {bubbles:true})); }`)
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 4)
  await evaluate(`{ const slider = document.querySelector('#budget-max'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, '50'); slider.dispatchEvent(new Event('input', {bubbles:true})); slider.dispatchEvent(new Event('change', {bubbles:true})); }`)
  await evaluate(`document.querySelectorAll('.discovery-filter summary')[1].click()`)
  await searchArea('Santa Cruz, California')
  assert.match(await evaluate('document.querySelector(".area-map-heading h2").textContent'), /Santa Cruz/)
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 3)
  assert.ok(await evaluate('Boolean(document.querySelector(".google-area-map"))'))
  await evaluate(`document.querySelector('.google-area-map').scrollIntoView({ block: 'center' })`)
  await delay(2500)
  await mkdir('.browser-check/area', { recursive: true })
  let shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
  await writeFile('.browser-check/area/santa-cruz-desktop.png', Buffer.from(shot.data, 'base64'))
  assert.ok(await evaluate('document.querySelector(".area-map").getBoundingClientRect().width <= 440'))
  assert.ok(await evaluate('document.querySelector(".area-map").getBoundingClientRect().width > 360'))
  assert.ok(await evaluate('document.querySelector(".discover-results").getBoundingClientRect().left > document.querySelector(".area-map").getBoundingClientRect().right'))
  assert.ok(await evaluate('document.querySelector(".dinner-cards").scrollHeight > document.querySelector(".dinner-cards").clientHeight'))
  assert.ok(await evaluate('document.querySelectorAll(".dinner-cards article")[1].getBoundingClientRect().top > document.querySelectorAll(".dinner-cards article")[0].getBoundingClientRect().bottom'))
  assert.ok(await evaluate('document.querySelector(".area-search").contains(document.querySelector(".area-map"))'))
  assert.ok(await evaluate('document.querySelector(".area-map").getBoundingClientRect().top > document.querySelector(".area-match-picker").getBoundingClientRect().bottom'))
  assert.equal(await evaluate('document.querySelectorAll(".local-dining").length'), 0)
  assert.equal(await evaluate('document.querySelector(".google-area-map").dataset.venueMarkers'), '3')
  assert.equal(await evaluate('document.querySelectorAll(".map-venue-legend li").length'), 3)
  assert.match(await evaluate('document.querySelector(".dinner-cards").textContent'), /Pretty Good Advice/)
  await click('[data-dinner-id="sunday"] .show-on-map')
  assert.equal(await evaluate('document.querySelector(".google-area-map").dataset.highlightedVenue'), 'sunday')
  assert.equal(await evaluate('document.querySelector(".dinner-highlighted").dataset.dinnerId'), 'sunday')
  await click('.map-venue-legend button')
  assert.equal(await evaluate('document.querySelector(".dinner-highlighted").dataset.dinnerId'), 'midweek')
  assert.equal(await evaluate('document.querySelector(".google-area-map").dataset.highlightedVenue'), 'midweek')
  await delay(3200)
  assert.equal(await evaluate('document.querySelectorAll(".dinner-highlighted").length'), 0)
  assert.equal(await evaluate('document.querySelector(".google-area-map").dataset.highlightedVenue'), '')
  await evaluate(`document.querySelector('[title="Pretty Good Advice"]').click()`)
  await delay(200)
  assert.equal(await evaluate('document.querySelector(".dinner-highlighted").dataset.dinnerId'), 'sunday')
  assert.ok(await evaluate('document.querySelector(".dinner-cards").scrollTop > 0'))

  await evaluate(`document.querySelector('input[type=search]').select()`)
  await type('input[type=search]', 'Capitola, California')
  await call('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  await call('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
  for (let attempt = 0; attempt < 60; attempt++) { await delay(250); if (await evaluate('document.querySelector(".area-map-heading h2")?.textContent.includes("Capitola")')) break }

  assert.match(await evaluate('document.querySelector(".area-map-heading h2").textContent'), /Capitola/)
  assert.ok(await evaluate('document.querySelector(".google-area-map").getAttribute("aria-label").includes("Capitola")'))
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 0)
  for (const width of [390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: false })
    await evaluate(`document.querySelector('.google-area-map').scrollIntoView({ block: 'center' })`)
    await delay(2000)
    assert.ok(await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'))
    shot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(`.browser-check/area/capitola-${width}.png`, Buffer.from(shot.data, 'base64'))
  }
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Reset filters').click()`)
  await delay(100)
  assert.equal(await evaluate('document.querySelector("input[type=search]").value'), '')
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 7)
  assert.equal(await evaluate('document.querySelectorAll(".google-area-map").length'), 1)
  assert.deepEqual(errors, [])
  console.log('Passed US searches, sample venue pins, restaurant cards, removal of live dining, editable budgets, calendar filters, and responsive layouts.')
} finally {
  await call('Target.closeTarget', { targetId: target.id }).catch(() => {})
  ws.close()
}
