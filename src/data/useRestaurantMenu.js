import { useEffect, useState } from 'react'
import { cachedMenu, extractionKey, extractionTask } from './menuClient'
import { analyzeDishLocally } from './localMenuAnalysis'

export function useRestaurantMenu(dinner, preferences = {}, requestedMode = 'preview', enabled = true) {
  const mode = requestedMode === 'top' ? 'preview' : requestedMode
  const key = extractionKey(dinner, mode)
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState(() => ({ key, menu: cachedMenu(dinner, mode), jobId: null, status: 'running', error: '', progress: null }))
  useEffect(() => {
    if (!enabled) return
    let active = true
    let task
    const listener = value => { if (active) setState({ key, ...value }) }
    const timer = setTimeout(() => {
      task = extractionTask(dinner, mode, attempt > 0)
      task.listeners.add(listener)
      listener(task.state)
    }, 0)
    return () => { active = false; clearTimeout(timer); task?.listeners.delete(listener) }
  // key contains venue ID, configured menu URL, and mode.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, attempt])
  const current = state.key === key ? state : { menu: null, jobId: null, status: 'running', error: '', progress: null }
  const menu = current.menu ? { ...current.menu, dishes: current.menu.dishes.map(dish => analyzeDishLocally(dish, preferences)) } : null
  return {
    menu, loading: enabled && current.status === 'running', error: enabled ? current.error : '', progress: current.progress,
    retry: () => setAttempt(value => value + 1),
  }
}
