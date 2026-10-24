import assert from 'node:assert/strict'
import { writeFile, mkdir } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { setTimeout as delay } from 'node:timers/promises'

const target = await (await fetch('http://127.0.0.1:9333/json/new?about:blank', { method: 'PUT' })).json()
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise(resolve => ws.addEventListener('open', resolve, { once: true }))
let id = 0
const pending = new Map()
ws.addEventListener('message', event => {
  const data = JSON.parse(event.data)
  if (!data.id) return
  const handler = pending.get(data.id)
  pending.delete(data.id)
  if (data.error) handler.reject(new Error(data.error.message))
  else handler.resolve(data.result)
})
function call(method, params = {}) {
  return new Promise((resolve, reject) => { const key = ++id; pending.set(key, { resolve, reject }); ws.send(JSON.stringify({ id: key, method, params })) })
}
async function evaluate(expression) {
  const result = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text)
  return result.result.value
}
try {
  await call('Page.enable')
  await call('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1024, deviceScaleFactor: 1, mobile: false })
  await mkdir('.browser-check/animations', { recursive: true })
  for (const [route, variant] of [['', 'pointing'], ['reading', 'reading'], ['confirmation', 'celebration'], ['confirmed', 'celebration']]) {
    await call('Page.navigate', { url: `http://127.0.0.1:5173/#/${route}` })
    for (let attempt = 0; attempt < 100; attempt++) {
      await delay(50)
      if (await evaluate(`document.querySelector('.waiter')?.dataset.ready === 'true'`)) break
    }
    assert.equal(await evaluate(`document.querySelector('.waiter').dataset.animation`), variant)
    assert.equal(await evaluate(`document.querySelector('.waiter').dataset.ready`), 'true')
    const playback = await evaluate(`(async () => {
      const host = document.querySelector('.waiter');
      const frames = [...host.querySelectorAll('img')];
      const duration = parseFloat(getComputedStyle(frames[0]).animationDuration) * 1000;
      const seen = new Set(); const visibleCounts = [];
      const end = performance.now() + duration + 150;
      while (performance.now() < end) {
        const visible = frames.map((frame, index) => Number(getComputedStyle(frame).opacity) > .5 ? index : -1).filter(index => index !== -1);
        visible.forEach(index => seen.add(index)); visibleCounts.push(visible.length);
        await new Promise(resolve => setTimeout(resolve, 31));
      }
      return { seen: [...seen].sort(), visibleCounts, allLoaded: frames.every(frame => frame.complete && frame.naturalWidth === 320 && frame.naturalHeight === 320) };
    })()`)
    assert.deepEqual(playback.seen, [0, 1, 2, 3, 4, 5], `${variant} must show all six poses`)
    assert.ok(playback.visibleCounts.every(count => count === 1), `${variant} must show exactly one pose at a time`)
    assert.ok(playback.allLoaded)
    // Freeze the fourth pose for a reviewable screenshot without changing the source assets.
    await evaluate(`document.querySelectorAll('.waiter-frame').forEach(frame => { for (const animation of frame.getAnimations()) { animation.pause(); const duration = parseFloat(getComputedStyle(frame).animationDuration) * 1000; animation.currentTime = duration * (1 + 3.5 / 6); } })`)
    await delay(50)
    const picture = await call('Page.captureScreenshot', { format: 'png' })
    await writeFile(`.browser-check/animations/${route || 'home'}-pose4.png`, Buffer.from(picture.data, 'base64'))
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
    const reduced = await evaluate(`[...document.querySelectorAll('.waiter-frame')].map(frame => ({ opacity: getComputedStyle(frame).opacity, animation: getComputedStyle(frame).animationName }))`)
    assert.equal(reduced[0].opacity, '1')
    assert.ok(reduced.slice(1).every(frame => frame.opacity === '0'))
    assert.ok(reduced.every(frame => frame.animation === 'none'))
    await call('Emulation.setEmulatedMedia', { features: [] })
  }
  console.log('Passed real playback of all 6 poses on Home, Menu Reading, Request Received, and Fully Confirmed; exactly one visible frame throughout each loop; original 320×320 images loaded; reduced motion shows frame 1.')
} finally {
  await call('Target.closeTarget', { targetId: target.id }).catch(() => {})
  ws.close()
}
