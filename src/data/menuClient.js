const API_URL = (
  import.meta.env.VITE_API_URL || 'http://localhost:3001'
).replace(/\/$/, '')

const TTL = 24 * 60 * 60 * 1000
const STORAGE = 'table8-extracted-menu-v8'
const tasks = new Map()

function normalizeMode(mode) {
  if (mode === 'top' || mode === 'preview') return 'preview'
  if (mode === 'full') return 'full'

  throw new Error('Invalid menu mode.')
}

export async function request(path, body) {
  const response = await fetch(`${API_URL}${path}`, {
    ...(body !== undefined
      ? {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(90000),
  })

  let data

  try {
    data = await response.json()
  } catch {
    throw new Error(
      'Unexpected menu server response. Check that the backend is running.'
    )
  }

  if (!response.ok) {
    throw new Error(
      data.error || `Menu request failed (HTTP ${response.status}).`
    )
  }

  return data
}

export async function followJob(initial, publish) {
  let job = initial
  const deadline = Date.now() + 60 * 60 * 1000

  while (true) {
    if (
      !job?.jobId ||
      !['running', 'ready', 'error'].includes(job.status)
    ) {
      throw new Error('Invalid menu job response.')
    }

    publish(job)

    if (job.status === 'error') {
      throw new Error(job.error || 'Menu job failed.')
    }

    if (job.status === 'ready') return job

    if (Date.now() >= deadline) {
      throw new Error(
        'Menu processing is taking longer than expected. Retry to reconnect.'
      )
    }

    await new Promise(resolve => setTimeout(resolve, 1500))

    job = await request(
      `/api/menu/jobs/${encodeURIComponent(job.jobId)}`
    )
  }
}

export function extractionKey(dinner, requestedMode) {
  const mode = normalizeMode(requestedMode)

  return JSON.stringify([
    'menu-v8',
    API_URL,
    dinner.venueId,
    dinner.menuUrl || '',
    mode,
  ])
}

function valid(menu, dinner, requestedMode) {
  const mode = normalizeMode(requestedMode)

  if (
    !menu ||
    menu.venueId !== dinner.venueId ||
    menu.mode !== mode ||
    !Array.isArray(menu.dishes) ||
    menu.dishes.length === 0
  ) {
    return false
  }

  // A preview must never be accepted as a full-menu result.
  if (mode === 'full' && menu.intentionalPreview === true) {
    return false
  }

  return menu.dishes.every(dish =>
    dish &&
    typeof dish.id === 'string' &&
    typeof dish.name === 'string' &&
    typeof dish.evidence === 'string' &&
    Array.isArray(dish.listedIngredients) &&
    Array.isArray(dish.possibleAllergens)
  )
}

export function cachedMenu(dinner, requestedMode) {
  const mode = normalizeMode(requestedMode)

  try {
    const entries = JSON.parse(
      localStorage.getItem(STORAGE) || '[]'
    )

    if (!Array.isArray(entries)) return null

    const saved = entries.find(
      item => item.key === extractionKey(dinner, mode)
    )

    if (
      !saved ||
      Date.now() - saved.at >= TTL ||
      !valid(saved.menu, dinner, mode)
    ) {
      return null
    }

    return saved.menu
  } catch {
    return null
  }
}

function save(key, menu) {
  try {
    const parsed = JSON.parse(
      localStorage.getItem(STORAGE) || '[]'
    )

    const entries = Array.isArray(parsed) ? parsed : []

    localStorage.setItem(
      STORAGE,
      JSON.stringify([
        {
          key,
          at: Date.now(),
          menu,
        },
        ...entries.filter(item =>
          item.key !== key &&
          Date.now() - item.at < TTL
        ),
      ].slice(0, 10))
    )
  } catch {
    // Browser storage is optional.
  }
}

export function extractionTask(
  dinner,
  requestedMode,
  refresh = false
) {
  const mode = normalizeMode(requestedMode)
  const key = extractionKey(dinner, mode)

  const existing = tasks.get(key)

  // Share an in-progress request.
  if (existing?.state.status === 'running') {
    return existing
  }

  // Reuse a completed task with a valid backend job ID.
  if (
    !refresh &&
    existing?.state.status === 'ready' &&
    Date.now() - existing.at < TTL &&
    valid(existing.state.menu, dinner, mode)
  ) {
    return existing
  }

  const saved = cachedMenu(dinner, mode)

  const task = {
    at: Date.now(),
    listeners: new Set(),
    state: {
      menu: saved,
      jobId: null,
      reviewReady: false,
      status: 'running',
      error: '',
      progress: null,
    },
  }

  tasks.set(key, task)

  function notify() {
    for (const listener of task.listeners) {
      listener(task.state)
    }
  }

  function publish(job) {
    const hasDishes = Boolean(job.result?.dishes?.length)

    if (
      hasDishes &&
      !valid(job.result, dinner, mode)
    ) {
      throw new Error(
        'The backend returned the wrong menu mode or an invalid menu.'
      )
    }

    if (job.status === 'ready' && !hasDishes) {
      throw new Error(
        'The menu job finished without readable dishes.'
      )
    }

    const menu = hasDishes
      ? {
          ...job.result,
          dishes:
            mode === 'preview'
              ? job.result.dishes.slice(0, 8)
              : job.result.dishes,
        }
      : task.state.menu

    task.state = {
      ...task.state,
      menu,
      jobId: job.jobId,
      reviewReady: hasDishes,
      status: job.status,
      progress: job.progress,
      error: job.error || '',
    }

    // Save completed extraction only.
    if (job.status === 'ready' && menu) {
      save(key, menu)
    }

    notify()
  }

  task.promise = (async () => {
    try {
      const initial = await request('/api/menu/jobs', {
        venueId: dinner.venueId,
        mode,
        refresh,
      })

      await followJob(initial, publish)
    } catch (error) {
      task.state = {
        ...task.state,
        status: 'error',
        error:
          error.message || 'Unable to reach the menu backend.',
      }

      notify()
    } finally {
      task.at = Date.now()
    }
  })()

  return task
}