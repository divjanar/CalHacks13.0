const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001').replace(/\/$/, '')
const TTL = 24 * 60 * 60 * 1000
const STORAGE = 'table8-extracted-menu-v6'
const tasks = new Map()

export async function request(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    ...(body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  })
  let data
  try { data = await response.json() } catch { throw new Error('Unexpected menu server response. Check that the updated backend is running.') }
  if (!response.ok) throw new Error(data.error || `Menu request failed (HTTP ${response.status}).`)
  return data
}
export async function followJob(initial, publish) {
  let job = initial
  const deadline = Date.now() + 30 * 60 * 1000
  while (true) {
    if (!job?.jobId || !['running', 'ready', 'error'].includes(job.status)) throw new Error('Invalid menu job response.')
    publish(job)
    if (job.status === 'error') throw new Error(job.error || 'Menu job failed.')
    if (job.status === 'ready') return job
    if (Date.now() > deadline) throw new Error('Menu processing is taking longer than expected. Retry to reconnect.')
    await new Promise(resolve => setTimeout(resolve, 1500))
    job = await request(`/api/menu/jobs/${encodeURIComponent(job.jobId)}`)
  }
}
export function extractionKey(dinner, mode) { return JSON.stringify([dinner.venueId, dinner.menuUrl || '', mode]) }
function valid(menu, dinner, mode) {
  return menu?.venueId === dinner.venueId && menu.mode === mode && Array.isArray(menu.dishes) && menu.dishes.length > 0 && menu.dishes.every(dish => typeof dish.id === 'string' && typeof dish.name === 'string' && typeof dish.evidence === 'string' && Array.isArray(dish.listedIngredients) && Array.isArray(dish.possibleAllergens))
}
export function cachedMenu(dinner, mode) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE) || '[]').find(item => item.key === extractionKey(dinner, mode))
    return saved && Date.now() - saved.at < TTL && valid(saved.menu, dinner, mode) ? saved.menu : null
  } catch { return null }
}
function save(key, menu) {
  try {
    const old = JSON.parse(localStorage.getItem(STORAGE) || '[]')
    localStorage.setItem(STORAGE, JSON.stringify([{ key, at: Date.now(), menu }, ...(Array.isArray(old) ? old : []).filter(item => item.key !== key && Date.now() - item.at < TTL)].slice(0, 10)))
  } catch { /* Browser storage is optional. */ }
}
export function extractionTask(dinner, mode, refresh = false) {
  const key = extractionKey(dinner, mode)
  let task = tasks.get(key)
  if (task?.state.status === 'running') return task
  task = { at: Date.now(), listeners: new Set(), state: { menu: cachedMenu(dinner, mode), jobId: null, reviewReady: false, status: 'running', error: '', progress: null } }
  tasks.set(key, task)
  const publish = job => {
    if (job.result && !valid(job.result, dinner, mode) && job.result.dishes?.length) throw new Error('Invalid extracted menu response.')
    task.state = { ...task.state, menu: job.result?.dishes?.length ? job.result : task.state.menu, jobId: job.jobId, reviewReady: Boolean(job.result?.dishes?.length), status: job.status, progress: job.progress, error: job.error || '' }
    if (task.state.menu) save(key, task.state.menu)
    for (const listener of task.listeners) listener(task.state)
  }
  task.promise = (async () => {
    try {
      await followJob(await request('/api/menu/jobs', { venueId: dinner.venueId, mode, refresh }), publish)
    } catch (error) {
      task.state = { ...task.state, status: 'error', error: error.message || 'Unable to reach the menu backend.' }
      for (const listener of task.listeners) listener(task.state)
    }
  })()
  return task
}
