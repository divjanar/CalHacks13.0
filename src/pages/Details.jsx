import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import TypewriterSpeech from '../components/TypewriterSpeech'
import { useApp } from '../state/context'
import { selectedDinner } from '../data/dinners'
import detailsTable from '../assets/dinner-table-details.svg'
import Button from '../components/Button'
import Page from '../components/Page'
import Notice from '../components/Notice'
import discoverHost from '../assets/discover-host.png'

const setupRoutes = {
  verify: '/verify',
  profile: '/settings',
  preferences: '/preferences',
  consent: '/consent',
}

export default function Details() {
  const { state, update } = useApp()
  const dinner = selectedDinner(state)

  const live = useQuery(
    api.reservations.getDinner,
    state.authLoading ? 'skip' : { slug: dinner.id }
  )

  const join = useMutation(api.reservations.join)

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  const accountReady =
    !state.authLoading && !state.accountLoading

  const alreadyJoined = Boolean(live?.myReservation)

  async function joinTable() {
    if (!accountReady || saving) return

    setMessage('')

    if (!state.signedIn) {
      update({ bookingIntent: true })
      window.location.hash = '/signin'
      return
    }

    if (!state.onboardingComplete) {
      const destination =
        setupRoutes[state.onboardingNext] || '/verify'

      update({ bookingIntent: true })
      window.location.hash = destination
      return
    }

    if (alreadyJoined) {
      window.location.hash = '/table'
      return
    }

    if (!live) {
      setMessage('This dinner has not been configured yet.')
      return
    }

    setSaving(true)

    try {
      await join({ slug: dinner.id })

      update({
        bookingIntent: false,
      })

      // Show success only after Convex saves the request.
      window.location.hash = '/table'
    } catch (error) {
      setMessage(
        typeof error?.data === 'string'
          ? error.data
          : error.message || 'Unable to request a seat.'
      )
    } finally {
      setSaving(false)
    }
  }

  const unavailable =
    live &&
    (
      live.availableSeats === 0 ||
      live.status !== 'open'
    )

  return (
    <Page
      className="dinner-details-page"
      title={dinner.title}
      intro={`${dinner.day} · ${dinner.time} · ${dinner.area}`}
      headingAside={
        <aside className="discover-host dinner-details-host">
          <TypewriterSpeech
            text="You can review the menu before requesting your seat."
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
      <div className="details-grid">
        <section className="dinner-intro">
          <img
            className="details-art"
            src={detailsTable}
            alt="Eight diners sharing a meal"
          />

          <h2>One table. A fresh start.</h2>

          <p>
            Come solo and meet new people over dinner.
            Each table has room for eight diners.
          </p>
        </section>

        <section className="card">
          <h2>Your evening</h2>

          <p>
            {dinner.day} · {dinner.time}–{dinner.endTime}
          </p>

          <p>{live?.restaurant.address || dinner.address}</p>

          <p>
            {live?.restaurant.name || dinner.restaurant}
            {' · '}
            {dinner.area}
          </p>

          <p>{dinner.price} per person · Pay the restaurant</p>

          <p>
            {live === undefined
              ? 'Loading available seats…'
              : live
                ? `${live.availableSeats} of ${live.capacity} seats available`
                : 'Dinner setup is not available yet.'}
          </p>

          <Notice>
            Sample event. Your seat request is saved in Convex,
            but no restaurant booking or charge is made.
            Dietary accommodation still requires restaurant
            confirmation.
          </Notice>

          <Button
            to="#/food"
            secondary
            onClick={() => update({ bookingIntent: false })}
          >
            See food I can eat
          </Button>

          <button
            className="button"
            type="button"
            disabled={
              !accountReady ||
              saving ||
              (
                state.onboardingComplete &&
                !alreadyJoined &&
                (
                  live === undefined ||
                  !live ||
                  Boolean(unavailable)
                )
              )
            }
            onClick={joinTable}
          >
            {saving
              ? 'Saving seat request…'
              : alreadyJoined
                ? 'View my table →'
                : state.signedIn && !state.onboardingComplete
                  ? 'Complete setup to join →'
                  : unavailable
                    ? 'Table unavailable'
                    : 'Join table →'}
          </button>

          {message && (
            <p className="error" role="alert">
              {message}
            </p>
          )}

          <small>
            Pending requests hold a sample seat until cancelled.
          </small>
        </section>
      </div>
    </Page>
  )
}