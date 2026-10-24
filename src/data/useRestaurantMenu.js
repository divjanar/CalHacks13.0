import { useEffect, useState, useSyncExternalStore } from 'react'
import { restoreReviews, storeReview, assessmentsFor, getReviewSnapshot, getServerReviewSnapshot, subscribeReviews } from './dietaryReviewCache'
import { cachedMenu, extractionKey, extractionTask, request, followJob } from './menuClient'
import { mergeDishAssessment } from './dietaryMatching'

const reviewTasks = new Map()
function useDietaryReview(menu, jobId, preferences, enabled) {
  const [attempt, setAttempt] = useState(0)
  const cachedReviews = useSyncExternalStore(subscribeReviews, getReviewSnapshot, getServerReviewSnapshot)
  useEffect(() => { restoreReviews() }, [])
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
        task = { state: { byId: assessmentsFor(getReviewSnapshot(), dishes, preferences), loading: true, error: '' }, listeners: new Set() }
        reviewTasks.set(key, task)
        task.promise = (async () => {
          try {
            const missing = dishes.filter(dish => !task.state.byId[dish.id])
            if (!missing.length) { task.state = { ...task.state, loading: false }; return }
            await followJob(await request('/api/menu/reviews', { ...JSON.parse(payload), dishIds: missing.map(dish => dish.id) }), job => {
              for (const item of job.result?.assessments || []) {
                const dish = dishes.find(dish => dish.id === item.dishId)
                if (!dish) continue
                if (!['potential', 'conflict', 'unknown'].includes(item.profileStatus) || !Array.isArray(item.concerns)) throw new Error('Invalid dietary assessment response.')
                task.state.byId[item.dishId] = item
                storeReview(dish, preferences, item)
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
  const cachedById = assessmentsFor(cachedReviews, menu?.dishes || [], preferences)
  const current = state.key === signature ? state : { byId: {}, loading: Boolean(enabled && menu?.dishes?.length), error: '' }
  const byId = { ...current.byId, ...cachedById }
  const missing = (menu?.dishes || []).some(dish => !byId[dish.id])
  return { ...current, byId, loading: missing && current.loading, retry: () => setAttempt(value => value + 1) }
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
  const reviewMenu = current.menu
  const review = useDietaryReview(reviewMenu, current.jobId, preferences, enabled && Boolean(current.reviewReady))
  const menu = current.menu ? { ...current.menu, dishes: current.menu.dishes.map(dish => mergeDishAssessment(dish, preferences, review.byId[dish.id])) } : null
  return {
    menu, loading: enabled && current.status === 'running', error: enabled ? current.error : '', progress: current.progress,
    reviewing: enabled && review.loading, reviewError: enabled ? review.error : '', retryReview: review.retry,
    retry: () => setAttempt(value => value + 1),
  }
}
