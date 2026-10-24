import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

import TypewriterSpeech from '../components/TypewriterSpeech'
import Page from '../components/Page'
import {
  DateFilter,
  BudgetFilter,
} from '../components/DiscoveryFilters'
import { dateWindow } from '../data/discoveryFilters'
import AreaSearch from '../components/AreaSearch'
import AreaMap from '../components/AreaMap'
import { matchesDinnerArea } from '../services/areaSearch'
import artwork from '../assets/dinner-table-mobile.svg'
import discoverHost from '../assets/discover-host.png'
import { dinners } from '../data/dinners'
import { useApp } from '../state/context'

// Keep subscriptions active even when a joined dinner is hidden.
// If its reservation is cancelled, the dinner can appear again.
function DinnerSubscription({
  dinnerId,
  authLoading,
  onChange,
}) {
  const live = useQuery(
    api.reservations.getDinner,
    authLoading ? 'skip' : { slug: dinnerId }
  )

  useEffect(() => {
    onChange(dinnerId, live)
  }, [dinnerId, live, onChange])

  return null
}

function DinnerCard({
  dinner,
  live,
  highlighted,
  onHighlight,
  onChoose,
}) {
  const seatText =
    live === undefined
      ? 'Loading available seats…'
      : live === null
        ? 'Dinner setup is not available yet.'
        : `${live.availableSeats} seats available`

  return (
    <article
      className={`card${
        highlighted ? ' dinner-highlighted' : ''
      }`}
      data-dinner-id={dinner.id}
      onClick={(event) => {
        if (!event.target.closest('a, button')) {
          onHighlight(dinner.id)
        }
      }}
    >
      <div className="listing-art-slot">
        <img
          className="listing-art"
          src={artwork}
          alt="Eight diners around a table"
        />
      </div>

      <h3>
        {live?.restaurant?.name || dinner.restaurant}
      </h3>

      <p className="muted">
        {live?.restaurant?.address || dinner.address}
      </p>

      <small>
        {dinner.shortDay} · {dinner.time}
      </small>

      <h2>{dinner.title}</h2>

      <p className="muted">
        {dinner.cuisine} · {dinner.price}
      </p>

      <p className="seat-count" aria-live="polite">
        {seatText}
      </p>

      <button
        className="show-on-map"
        type="button"
        aria-label={
          `Highlight ${dinner.restaurant} on the map`
        }
        onClick={() => onHighlight(dinner.id)}
      >
        Show on map
      </button>

      <a
        className="button"
        href="#/dinner"
        onClick={() => onChoose(dinner)}
      >
        View Table
      </a>
    </article>
  )
}

export default function Discover() {
  const { state, update } = useApp()

  const savedArea =
    state.profile?.localArea ??
    state.preferences.area ??
    ''

  const [area, setArea] = useState(null)
  const [resetVersion, setResetVersion] = useState(0)

  const [date, setDate] = useState({
    mode: 'week',
    date: dinners[0].date,
  })

  const [budget, setBudget] = useState({
    min: 0,
    max: 100,
  })

  const [highlightedId, setHighlightedId] = useState(null)
  const [liveDinners, setLiveDinners] = useState({})

  const highlightTimer = useRef(null)
  const list = useRef(null)

  useEffect(() => {
    return () => clearTimeout(highlightTimer.current)
  }, [])

  const receiveDinner = useCallback((dinnerId, live) => {
    setLiveDinners((current) => {
      if (current[dinnerId] === live) {
        return current
      }

      return {
        ...current,
        [dinnerId]: live,
      }
    })
  }, [])

  const highlight = useCallback(
    (id, fromMap = false) => {
      clearTimeout(highlightTimer.current)
      setHighlightedId(id)

      highlightTimer.current = setTimeout(
        () => setHighlightedId(null),
        3000
      )

      if (fromMap && list.current) {
        const card = Array.from(
          list.current.querySelectorAll(
            '[data-dinner-id]'
          )
        ).find(
          (element) => element.dataset.dinnerId === id
        )

        if (card) {
          const reducedMotion = window.matchMedia(
            '(prefers-reduced-motion: reduce)'
          ).matches

          list.current.scrollTo({
            top:
              list.current.scrollTop +
              card.getBoundingClientRect().top -
              list.current.getBoundingClientRect().top -
              8,
            behavior: reducedMotion ? 'auto' : 'smooth',
          })
        }
      }
    },
    []
  )

  const dateRange = dateWindow(date)

  const matchingDinners = useMemo(
    () =>
      dinners.filter(
        (dinner) =>
          matchesDinnerArea(dinner, area) &&
          dinner.date >= dateRange.start &&
          dinner.date <= dateRange.end &&
          (
            dinner.minPrice === null ||
            budget.min === '' ||
            dinner.minPrice >= budget.min
          ) &&
          (
            dinner.maxPrice === null ||
            budget.max === '' ||
            dinner.maxPrice <= budget.max
          )
      ),
    [
      area,
      dateRange.start,
      dateRange.end,
      budget.min,
      budget.max,
    ]
  )

  // Wait for reservation data before showing a dinner.
  // This prevents already-joined dinners briefly appearing.
  const results = useMemo(
    () =>
      state.authLoading
        ? []
        : matchingDinners.filter((dinner) => {
            const live = liveDinners[dinner.id]

            return (
              live !== undefined &&
              !live?.myReservation
            )
          }),
    [
      matchingDinners,
      liveDinners,
      state.authLoading,
    ]
  )

  const loading =
    Boolean(state.authLoading) ||
    matchingDinners.some(
      (dinner) => liveDinners[dinner.id] === undefined
    )

  function choose(dinner) {
    update({
      dinnerId: dinner.id,
      ...(dinner.id !== state.dinnerId
        ? {
            requested: false,
            restaurantConfirmed: false,
          }
        : {}),
    })
  }

  function resetFilters() {
    setArea(null)
    setResetVersion((version) => version + 1)

    setDate({
      mode: 'week',
      date: dinners[0].date,
    })

    setBudget({
      min: 0,
      max: 100,
    })
  }

  return (
    <Page
      className="discover-page"
      title="Find your next table"
      intro="Choose a table. Meet new people over good food."
      headingAside={
        <aside className="discover-host">
          <TypewriterSpeech
            text={
              'Let’s find a restaurant, café, or something sweet.\n\n' +
              'Already reserved a seat? Visit My tables to review your reservation.'
            }
          />

          <img
            src={discoverHost}
            alt="Your Table 8 host holding a serving tray"
            width="120"
            height="180"
          />
        </aside>
      }
    >
      {dinners.map((dinner) => (
        <DinnerSubscription
          key={dinner.id}
          dinnerId={dinner.id}
          authLoading={state.authLoading}
          onChange={receiveDinner}
        />
      ))}

      <div className="discover-workspace">
        <div className="filters">
          <AreaSearch
            key={`${resetVersion}:${savedArea}`}
            initialQuery={
              resetVersion === 0 ? savedArea : ''
            }
            onSelect={setArea}
            onReset={() => setArea(null)}
          >
            <AreaMap
              location={area}
              venues={results}
              highlightedId={highlightedId}
              onHighlight={highlight}
            />
          </AreaSearch>

          <div className="discover-time-budget">
            <DateFilter
              value={date}
              onChange={setDate}
            />

            <BudgetFilter
              value={budget}
              onChange={setBudget}
            />
          </div>
        </div>

        <div className="discover-results">
          <h2>Tables</h2>

          <span className="sr-only" role="status">
            {loading
              ? 'Loading dinners and available seats'
              : `${results.length} sample dinners found`}
          </span>

          {loading && (
            <p className="muted">
              Loading dinners and available seats…
            </p>
          )}

          <div
            ref={list}
            className="dinner-cards"
            role="region"
            aria-label="Available sample dinners"
            aria-busy={loading}
            tabIndex={0}
          >
            {results.map((dinner) => (
              <DinnerCard
                key={dinner.id}
                dinner={dinner}
                live={liveDinners[dinner.id]}
                highlighted={
                  highlightedId === dinner.id
                }
                onHighlight={highlight}
                onChoose={choose}
              />
            ))}
          </div>

          {!loading && !results.length && (
            <section className="card">
              <h2>No new dinners match these filters.</h2>

              <p>
                Dinners you have already joined are in
                My tables. Try another area or date to
                discover more outings.
              </p>

              <a className="button" href="#/table">
                My tables →
              </a>

              <button
                className="button secondary"
                type="button"
                onClick={resetFilters}
              >
                Reset filters
              </button>
            </section>
          )}
        </div>
      </div>

    </Page>
  )
}
