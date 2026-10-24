import { useEffect, useState } from 'react'
import { cachedMenu, extractionKey, extractionTask, request, followJob } from './menuClient'
import { mergeDishAssessment } from './dietaryMatching'

const reviewTasks = new Map()
const assessmentCache = new Map()
const TTL = 24 * 60 * 60 * 1000
function assessmentKey(dish, preferences) { return JSON.stringify([dish, preferences]) }
function savedAssessments(dishes, preferences) {
  return Object.fromEntries(dishes.flatMap(dish => {
    const saved = assessmentCache.get(assessmentKey(dish, preferences))
    return saved && Date.now() - saved.at < TTL ? [[dish.id, saved.value]] : []
  }))
}
function useDietaryReview(menu, jobId, preferences, enabled) {
  const [attempt, setAttempt] = useState(0)
  const payload = JSON.stringify({ menuJobId: jobId, preferences })
  const signature = JSON.stringify([payload, menu?.dishes || []])
  const [state, setState] = useState({ key: '', byId: {}, loading: false, error: '' })
  useEffect(() => {
    if (!enabled || !jobId || !menu?.dishes?.length) return
    let active = true
    const dishes = menu.dishes
    const key = signature
    let task = reviewTasks.get(key)
    const notify = () => { if (active) setState({ ...task.state, key }) }
    async function load() {
      if (!task || task.state.error) {
        task = { state: { byId: savedAssessments(dishes, preferences), loading: true, error: '' }, listeners: new Set() }
        reviewTasks.set(key, task)
        task.promise = (async () => {
          try {
            await followJob(await request('/api/menu/reviews', JSON.parse(payload)), job => {
              for (const item of job.result?.assessments || []) {
                const dish = dishes.find(dish => dish.id === item.dishId)
                if (!dish || !['potential', 'conflict', 'unknown'].includes(item.profileStatus) || !Array.isArray(item.concerns)) throw new Error('Invalid dietary assessment response.')
                task.state.byId[item.dishId] = item
                assessmentCache.set(assessmentKey(dish, preferences), { at: Date.now(), value: item })
              }
              task.state = { ...task.state, byId: { ...task.state.byId }, loading: job.status === 'running', error: job.error || '' }
              for (const listener of task.listeners) listener()
            })
          } catch (error) {
            task.state = { ...task.state, loading: false, error: error.message || 'Gemini dietary review failed.' }
            for (const listener of task.listeners) listener()
          }
        })()
      }
      task.listeners.add(notify)
      notify()
    }
    const timer = setTimeout(load, 0)
    return () => { active = false; clearTimeout(timer); task?.listeners.delete(notify) }
  // The serialized signature includes the entire menu and saved profile.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled, attempt])
  const current = state.key === signature ? state : { byId: {}, loading: Boolean(enabled && menu?.dishes?.length), error: '' }
  return { ...current, retry: () => setAttempt(value => value + 1) }
}
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
  const review = useDietaryReview(current.menu, current.jobId, preferences, enabled && Boolean(current.reviewReady))
  const menu = current.menu ? { ...current.menu, dishes: current.menu.dishes.map(dish => mergeDishAssessment(dish, preferences, review.byId[dish.id])) } : null
  return {
    menu, loading: enabled && current.status === 'running', error: enabled ? current.error : '', progress: current.progress,
    reviewing: enabled && review.loading, reviewError: enabled ? review.error : '', retryReview: review.retry,
    retry: () => setAttempt(value => value + 1),
  }
}
