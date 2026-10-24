import TypewriterSpeech from '../components/TypewriterSpeech'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Page from '../components/Page'
import { DateFilter, BudgetFilter } from '../components/DiscoveryFilters'
import { dateWindow } from '../data/discoveryFilters'
import Notice from '../components/Notice'
import AreaSearch from '../components/AreaSearch'
import AreaMap from '../components/AreaMap'
import { matchesDinnerArea } from '../services/areaSearch'
import artwork from '../assets/dinner-table-mobile.svg'
import discoverHost from '../assets/discover-host.png'
import { dinners } from '../data/dinners'
import { useApp } from '../state/context'

export default function Discover() {
  const { state, update } = useApp()
  const savedArea = state.profile?.localArea ?? state.preferences.area ?? ''
  const [area, setArea] = useState(null)
  const [resetVersion, setResetVersion] = useState(0)
  const [date, setDate] = useState({ mode: 'week', date: dinners[0].date })
  const [budget, setBudget] = useState({ min: 0, max: 100 })
  const [highlightedId, setHighlightedId] = useState(null)
  const highlightTimer = useRef(null)
  const list = useRef(null)
  useEffect(() => () => clearTimeout(highlightTimer.current), [])
  const highlight = useCallback((id, fromMap = false) => {
    clearTimeout(highlightTimer.current)
    setHighlightedId(id)
    highlightTimer.current = setTimeout(() => setHighlightedId(null), 3000)
    if (fromMap && list.current) {
      const card = list.current.querySelector(`[data-dinner-id="${id}"]`)
      if (card) list.current.scrollTo({ top: list.current.scrollTop + card.getBoundingClientRect().top - list.current.getBoundingClientRect().top - 8, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
  }, [])
  const window = dateWindow(date)
  const results = useMemo(() => dinners.filter(dinner => matchesDinnerArea(dinner, area) && dinner.date >= window.start && dinner.date <= window.end && (dinner.minPrice === null || budget.min === '' || dinner.minPrice >= budget.min) && (dinner.maxPrice === null || budget.max === '' || dinner.maxPrice <= budget.max)), [area, window.start, window.end, budget.min, budget.max])
  function choose(dinner) {
    update({ dinnerId: dinner.id, ...(dinner.id !== state.dinnerId ? { requested: false, restaurantConfirmed: false } : {}) })
  }
  return <Page headingAside={<aside className="discover-host"><TypewriterSpeech text={"Let\u2019s find a restaurant, caf\u00e9, or something sweet.\n\nAlready reserved a seat? Visit My table to review your reservation."} /><img src={discoverHost} alt="Your Table 8 host holding a serving tray" width="120" height="180" /></aside>} className="discover-page" title="Your next good evening" intro="Choose an evening. We’ll bring eight local people to the same table.">
    <div className="discover-workspace">
    <div className="filters">
      <AreaSearch key={`${resetVersion}:${savedArea}`} initialQuery={resetVersion === 0 ? savedArea : ''} onSelect={setArea} onReset={() => setArea(null)}><AreaMap location={area} resultCount={results.length} venues={results} highlightedId={highlightedId} onHighlight={highlight} /></AreaSearch>
      <div className="discover-time-budget"><DateFilter value={date} onChange={setDate} />
      <BudgetFilter value={budget} onChange={setBudget} /></div>
    </div>
    <div className="discover-results"><h2>Table 8 sample dinners</h2>
    <span className="sr-only" role="status">{results.length} sample dinners found</span>
    <div ref={list} className="dinner-cards" role="region" aria-label="Available sample dinners" tabIndex={0}>{results.map(dinner => <article className={`card${highlightedId === dinner.id ? ' dinner-highlighted' : ''}`} data-dinner-id={dinner.id} key={dinner.id} onClick={event => { if (!event.target.closest('a')) highlight(dinner.id) }}>
      <div className="listing-art-slot"><img className="listing-art" src={artwork} alt="Eight diners around a table" /></div>
      <h3>{dinner.restaurant}</h3><p className="muted">{dinner.address}</p>
      <small>{dinner.shortDay} · {dinner.time}</small><h2>{dinner.title}</h2>
      <p className="muted">{dinner.cuisine} · {dinner.price}</p><p className="seat-count">{dinner.seats} seats available · 8 people total</p>
      <button className="show-on-map" type="button" aria-label={`Highlight ${dinner.restaurant} on the map`}>Show on map</button>
      <a className="button" href="#/dinner" onClick={() => choose(dinner)}>View dinner →</a>
    </article>)}</div>
    {!results.length && <section className="card"><h2>No dinners match these filters.</h2><p>Try another area or date. Sample outings are available in Santa Cruz and San Francisco, California.</p><button className="button secondary" onClick={() => { setArea(null); setResetVersion(version => version + 1); setDate({ mode: 'week', date: dinners[0].date }); setBudget({ min: 0, max: 100 }) }}>Reset filters</button></section>}
    </div>
    </div>
    <Notice>No dinners in your area? Try a wider area or another date. Listings shown here are sample outings. Venues without a published price stay visible.</Notice>
  </Page>
}
