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
  await route('home')
  await evaluate('document.fonts.ready')
  await mkdir('.browser-check/screens', { recursive: true })
  const routes = ['home', 'discover', 'dinner', 'signin', 'preferences', 'verify', 'consent', 'confirmation', 'table', 'safety', 'report', 'food', 'confirmed', 'reading', 'checking', 'unavailable', 'ui-kit']
  for (const width of [1440, 390, 320]) {
    await call('Emulation.setDeviceMetricsOverride', { width, height: width === 1440 ? 1024 : 844, deviceScaleFactor: 1, mobile: false })
    for (const name of routes) {
      await route(name)
      const geometry = await evaluate(`({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, images: [...document.querySelectorAll('img')].every(img => img.complete && img.naturalWidth > 0), h1: document.querySelector('h1')?.textContent })`)
      assert.ok(geometry.scroll <= geometry.width + 1, `${name} overflows at ${width}: ${geometry.scroll}`)
      assert.ok(geometry.images, `${name} has an unloaded image`)
      assert.ok(geometry.h1, `${name} has no heading`)
      if (width !== 320) {
        const screenshot = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width, height: name === 'ui-kit' ? 420 : geometry.height, scale: 1 } })
        await writeFile(`.browser-check/screens/${name}-${width}.png`, Buffer.from(screenshot.data, 'base64'))
      }
    }
  }
  // Verify real DOM events through the sign-in and verification preview.
  await route('signin')
  await type('input[type=email]', 'sample@example.com')
  await type('input[type=password]', 'sample-password')
  await click('button[type=submit]')
  assert.equal(await evaluate('location.hash'), '#/signin')
  assert.equal(await evaluate('document.querySelector("input[type=email]").validity.patternMismatch'), true)
  await evaluate(`document.querySelector('input[type=email]').select()`)
  await type('input[type=email]', 'sample@university.edu')
  await click('button[type=submit]')
  assert.equal(await evaluate('location.hash'), '#/discover')
  assert.equal(await evaluate('document.querySelectorAll(".site-header a[href=\"#/signin\"]").length'), 0)
  assert.ok(await evaluate('Boolean(document.querySelector(".account-user-icon"))'))
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 7)
  await route('dinner')
  await click('a.button:not(.secondary)')
  assert.equal(await evaluate('location.hash'), '#/preferences')
  await click('button[type=submit]')
  assert.equal(await evaluate('location.hash'), '#/verify')
  assert.equal(await evaluate('document.querySelector("input[type=email]").value'), 'sample@university.edu')
  await click('button[type=submit]')
  await type('input[inputmode=numeric]', '000000')
  await click('button.verification-action:not([type=submit])')
  assert.match(await evaluate('document.body.textContent'), /does not match/)
  await evaluate(`document.querySelector('input[inputmode=numeric]').select()`)
  await type('input[inputmode=numeric]', '123456')
  await click('button.verification-action:not([type=submit])')
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Upload government ID').click()`)
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Preview next step →').click()`)
  await delay(150)
  assert.equal(await evaluate('location.hash'), '#/consent')
  await evaluate(`document.querySelectorAll('input[required]').forEach(input => input.click())`)
  await click('button[type=submit]')
  assert.equal(await evaluate('location.hash'), '#/confirmation')
  assert.ok(await evaluate('Boolean(document.querySelector(".jumping-host"))'))
  await click('.approval-button')
  assert.equal(await evaluate('location.hash'), '#/confirmed')
  // A new account verifies identity before preferences, with no second verification loop.
  await route('signin')
  await click('button.secondary')
  await type('input[name=firstName]', 'Alexandra')
  await type('input[name=lastName]', 'Rivera')
  await type('input[name=preferredFirstName]', 'Alex')
  await type('input[type=email]', 'new.student@college.edu')
  await type('input[type=password]', 'sample-password')
  await click('button[type=submit]')
  assert.equal(await evaluate('location.hash'), '#/verify')
  assert.equal(await evaluate('document.querySelector("input[type=email]").value'), 'new.student@college.edu')
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Preview next step →').click()`)
  assert.equal(await evaluate('location.hash'), '#/verify')
  assert.match(await evaluate('document.body.textContent'), /Both the demo email check/)
  await click('button[type=submit]')
  await type('input[inputmode=numeric]', '123456')
  await click('button.verification-action:not([type=submit])')
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Upload government ID').click()`)
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Preview next step →').click()`)
  await delay(150)
  assert.equal(await evaluate('location.hash'), '#/preferences')
  await click('button[type=submit]')
  assert.equal(await evaluate('location.hash'), '#/consent')
  await evaluate(`document.querySelectorAll('input[required]').forEach(input => input.click())`)
  await click('button[type=submit]')
  assert.equal(await evaluate('location.hash'), '#/discover')
  assert.equal(await evaluate('document.querySelectorAll(".site-header a[href=\"#/signin\"]").length'), 0)
  assert.ok(await evaluate('Boolean(document.querySelector(".account-user-icon"))'))
  await route('unavailable')
  await click('.restaurant-question button')
  assert.match(await evaluate('document.body.textContent'), /No message has been sent/)
  await route('table')
  await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent === 'Preview check-in').click()`)
  assert.match(await evaluate('document.body.textContent'), /Demo check-in only/)
  await route('discover')
  await click('.discovery-filter summary')
  await evaluate(`[...document.querySelectorAll('.filter-segments button')].find(button => button.textContent === 'Choose a day').click()`)
  await click('button[aria-label="2026-10-21"]')
  await delay(100)
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 1)
  await evaluate(`[...document.querySelectorAll('.filter-segments button')].find(button => button.textContent === 'Choose a week').click()`)
  await delay(100)
  assert.equal(await evaluate('document.querySelectorAll(".dinner-cards article").length'), 7)
  await route('preferences')
  await click('.field-trigger')
  await evaluate(`[...document.querySelectorAll('label.check')].find(label => label.textContent === 'None').querySelector('input').click()`)
  await evaluate(`const diet = [...document.querySelectorAll('select')].find(select => [...select.options].some(option => option.value === 'Vegan')); diet.value = 'Vegan'; diet.dispatchEvent(new Event('change', { bubbles: true }))`)
  await click('button[type=submit]')
  await route('food')
  assert.equal(await evaluate(`[...document.querySelectorAll('.menu-option .eyebrow')].filter(label => label.textContent === 'POTENTIAL MATCH').length`), 1)
  assert.equal(await evaluate(`[...document.querySelectorAll('.menu-option .eyebrow')].filter(label => label.textContent === 'DOES NOT MATCH').length`), 2)
  await route('report')
  await type('textarea', 'A fictional sample situation for the demo.')
  await type('input[type=email]', 'sample@example.com')
  await click('button[type=submit]')
  assert.match(await evaluate('document.body.textContent'), /Nothing was sent or saved/)
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
  await route('confirmation')
  assert.equal(await evaluate('getComputedStyle(document.querySelector(".jumping-host")).animationName'), 'none')
  assert.ok(await evaluate(`[...document.querySelectorAll('.waiter-frame')].every(frame => getComputedStyle(frame).animationName === 'none')`))
  assert.deepEqual(errors, [])
  console.log('Passed 51 responsive page checks, image loading, full request flow, menu/filter actions, dietary edits, report preview, check-in preview, and reduced motion. Screenshots: .browser-check/screens')
} finally {
  await call('Target.closeTarget', { targetId: target.id }).catch(() => {})
  ws.close()
}
