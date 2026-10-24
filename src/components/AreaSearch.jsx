import { useEffect, useRef, useState } from 'react'
import LocationInput from './LocationInput'
import { searchAreas } from '../services/areaSearch'

export default function AreaSearch({ onSelect, onReset, children, initialQuery = '' }) {
  const [query, setQuery] = useState(initialQuery)
  const [loading, setLoading] = useState(Boolean(initialQuery.trim()))
  const [error, setError] = useState('')
  const [choices, setChoices] = useState([])
  const active = useRef(null)
  const savedQuery = useRef('')
  const pendingQuery = useRef('')
  useEffect(() => () => { active.current?.abort('cancelled'); active.current = null }, [])
  useEffect(() => {
    if (!initialQuery.trim()) return
    const controller = new AbortController()
    active.current = controller
    pendingQuery.current = initialQuery.trim()
    const timeout = setTimeout(() => controller.abort('timeout'), 10000)
    searchAreas(initialQuery, controller.signal).then(locations => {
      if (controller.signal.aborted || active.current !== controller) return
      if (!locations.length) { setError('Your saved area could not be found. Enter a city, state or ZIP code.'); return }
      savedQuery.current = initialQuery.trim()
      onSelect(locations[0])
      setChoices(locations)
    }).catch(() => {
      if (controller.signal.reason !== 'cancelled' && active.current === controller) setError(controller.signal.aborted ? 'Saved area search timed out. Press Enter to try again.' : 'Your saved area could not load. Press Enter to try again.')
    }).finally(() => {
      clearTimeout(timeout)
      if (active.current === controller) { active.current = null; setLoading(false) }
    })
    return () => { controller.abort('cancelled'); clearTimeout(timeout); if (active.current === controller) active.current = null }
  }, [initialQuery, onSelect])


  async function search(event, text = query) {
    event?.preventDefault()
    const next = text.trim()
    if (!next) { clear(); return }
    if (savedQuery.current === next || (active.current && pendingQuery.current === next)) return
    active.current?.abort('cancelled')
    pendingQuery.current = next
    if (next.length < 2) { setError('Enter a city, neighborhood or postal code.'); return }
    const controller = new AbortController()
    active.current = controller
    setLoading(true)
    setError('')
    setChoices([])
    const timeout = setTimeout(() => controller.abort('timeout'), 10000)
    try {
      const locations = await searchAreas(next, controller.signal)
      if (controller.signal.aborted) return
      if (!locations.length) {
        setError('We couldn’t find that area. Add a US state or ZIP code and try again.')
        return
      }
      savedQuery.current = next
      onSelect(locations[0])
      setChoices(locations)
    } catch (failure) {
      if (controller.signal.reason === 'cancelled') return
      setError(controller.signal.aborted ? 'Area search timed out. Please try again.' : failure.message === 'Failed to fetch' ? 'Couldn’t connect to area search. Check your connection and try again.' : failure.message)
    } finally {
      clearTimeout(timeout)
      if (active.current === controller) {
        active.current = null
        setLoading(false)
      }
    }
  }
  function clear() {
    active.current?.abort('cancelled')
    active.current = null
    savedQuery.current = ''
    setQuery('')
    setChoices([])
    setError('')
    setLoading(false)
    onReset()
  }
  return <div className="area-search">
    <form className="area-search-form" onSubmit={search} aria-label="Search an area">
      <LocationInput label="Area" type="search" value={query} onChange={value => { active.current?.abort('cancelled'); setQuery(value) }} onCommit={value => search(undefined, value)} />

    </form>
    <small role="status">{loading ? 'Saving area...' : choices.length ? 'Area saved.' : ''}</small>
    {error && <p className="area-search-error" role="alert">{error} The map and listings still show the previous area.</p>}
    {children}
    {query && <button className="text-link subtle-link" onClick={clear}>Show all areas</button>}
  </div>
}
