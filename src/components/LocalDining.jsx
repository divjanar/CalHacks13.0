import { useEffect, useRef, useState } from 'react'
import { diningPrice, matchesDiningBudget, searchDining } from '../services/diningSearch'

export default function LocalDining({ location, budget }) {
  const [places, setPlaces] = useState([])
  const [loading, setLoading] = useState(Boolean(location))
  const [error, setError] = useState('')
  const [token, setToken] = useState('')
  const [retry, setRetry] = useState(0)
  const active = useRef(null)
  useEffect(() => {
    if (!location) return
    const controller = new AbortController()
    active.current = controller
    const timeout = setTimeout(() => controller.abort(), 15000)
    searchDining(location, { signal: controller.signal }).then(result => {
      if (controller.signal.aborted) return
      setPlaces(result.places); setToken(result.nextPageToken); setError('')
    }).catch(failure => {
      if (active.current === controller) setError(controller.signal.aborted ? 'Restaurant search timed out. Please try again.' : failure.message)
    }).finally(() => { clearTimeout(timeout); if (active.current === controller) { setLoading(false); active.current = null } })
    return () => { active.current = null; controller.abort(); clearTimeout(timeout) }
  }, [location, retry])
  useEffect(() => () => active.current?.abort(), [])
  async function more() {
    if (loading || active.current) return
    const controller = new AbortController(); active.current = controller
    setLoading(true); setError('')
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const result = await searchDining(location, { signal: controller.signal, pageToken: token })
      if (controller.signal.aborted) return
      setPlaces(previous => [...new Map([...previous, ...result.places].map(place => [place.id, place])).values()])
      setToken(result.nextPageToken)
    } catch (failure) { if (active.current === controller) setError(controller.signal.aborted ? 'Restaurant search timed out. Try again.' : failure.message) }
    finally { clearTimeout(timeout); if (active.current === controller) { setLoading(false); active.current = null } }
  }
  if (!location) return <section className="local-dining"><h2>Dining in your area</h2><p className="muted">Enter a US area above to explore local restaurants and cafés.</p></section>
  const results = places.filter(place => matchesDiningBudget(place, budget))
  return <section className="local-dining" aria-label="Local dining options"><h2>Dining around {location.label}</h2><p className="muted">Restaurant information from Google Maps. Hours shown are current; contact the venue for your selected date, seats, and dining needs. Places without published prices remain visible.</p>
    {loading && <p role="status">Finding dining options…</p>}
    {error && <div className="notice" role="alert"><p>{error}</p><button className="button secondary" onClick={() => { if (token) more(); else { setLoading(true); setRetry(value => value + 1) } }}>Try again</button></div>}
    <p role="status">{results.length} dining options shown{places.length !== results.length ? ` · ${places.length - results.length} outside your budget` : ''}</p>
    <div className="local-dining-grid">{results.map(place => {
      const price = diningPrice(place)
      const money = amount => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount)
      return <article className="card local-dining-card" key={place.id}><h3>{place.displayName?.text || 'Restaurant'}</h3><p>{place.formattedAddress}</p>
        {place.rating != null && <p>{place.rating} / 5 · {place.userRatingCount || 0} Google reviews</p>}
        <p>{price.min !== null && price.max !== null ? `${money(price.min)}–${money(price.max)} estimated per person` : price.min !== null ? `From ${money(price.min)} per person` : price.max !== null ? `Up to ${money(price.max)} per person` : 'Price not provided'}</p>
        <p className="muted">{place.businessStatus === 'CLOSED_TEMPORARILY' ? 'Temporarily closed' : place.currentOpeningHours?.openNow === true ? 'Open now' : place.currentOpeningHours?.openNow === false ? 'Closed now' : 'Hours not provided'}</p>
        {place.currentOpeningHours?.weekdayDescriptions?.length > 0 && <details><summary>Weekly opening hours</summary>{place.currentOpeningHours.weekdayDescriptions.map(day => <p key={day}>{day}</p>)}</details>}
        {place.googleMapsUri && <a className="button secondary" href={place.googleMapsUri} target="_blank" rel="noreferrer">View on Google Maps ↗</a>}
      </article>
    })}</div>
    {!loading && !error && !results.length && <p>No dining options matched this search. Try a wider budget or a nearby US area.</p>}
    {token && <button className="button secondary" disabled={loading} onClick={more}>{loading ? 'Loading…' : 'Show more dining options'}</button>}
    <small>Google Maps · Results are limited to places Google returns for this area; this is not an exhaustive directory or a reservation service.</small>
  </section>
}
