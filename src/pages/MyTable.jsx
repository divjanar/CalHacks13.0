import { useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import Page from '../components/Page'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { useApp } from '../state/context'

function formatWhen(timestamp, timeZone) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

function formatPrice(dinner) {
  const format = cents =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: dinner.currency,
      maximumFractionDigits: 0,
    }).format(cents / 100)

  if (
    dinner.minPriceCents != null &&
    dinner.maxPriceCents != null
  ) {
    return `${format(dinner.minPriceCents)}–${format(dinner.maxPriceCents)}`
  }

  return 'Price not provided'
}

export default function MyTable() {
  const { state, update } = useApp()

  const data = useQuery(
    api.reservations.listMine,
    state.signedIn && !state.authLoading ? {} : 'skip'
  )

  const cancel = useMutation(api.reservations.cancel)

  const [selected, setSelected] = useState(null)
  const [cancelling, setCancelling] = useState(false)
  const [message, setMessage] = useState('')

  const cancelDialog = useRef(null)

  function openFood(dinner) {
    update({
      dinnerId: dinner.slug,
      bookingIntent: false,
    })

    window.location.hash = '/food'
  }

  function openCancellation(reservation) {
    setSelected(reservation)
    setMessage('')
    cancelDialog.current?.showModal()
  }

  async function confirmCancellation() {
    if (!selected || cancelling) return

    setCancelling(true)
    setMessage('')

    try {
      await cancel({
        reservationId: selected._id,
      })

      cancelDialog.current?.close()
      setSelected(null)
    } catch (error) {
      setMessage(
        typeof error?.data === 'string'
          ? error.data
          : error.message || 'Unable to cancel your request.'
      )
    } finally {
      setCancelling(false)
    }
  }

  if (
    state.authLoading ||
    state.accountLoading ||
    (state.signedIn && data === undefined)
  ) {
    return (
      <div
        className="account-spinner-screen"
        role="status"
        aria-label="Loading your reservations"
      >
        <div className="account-spinner" aria-hidden="true" />
      </div>
    )
  }

  if (!state.signedIn) {
    return (
      <Page
        eyebrow="MY TABLE"
        title="Sign in to see your table."
      >
        <Button to="#/signin">Sign in</Button>
      </Page>
    )
  }

  const reservations = data?.reservations || []

  return (
    <Page
      eyebrow="MY TABLE"
      title={
        reservations.length
          ? 'Your table, coming together.'
          : 'Your next table is waiting.'
      }
      intro={
        reservations.length
          ? 'Your saved sample seat requests.'
          : 'Explore dinners and request your first seat.'
      }
    >
      {reservations.length === 0 ? (
        <section className="card booking-card">
          <h2>Find your next dinner</h2>
          <p>
            Choose a dinner and join a table.
            Your saved request will appear here.
          </p>
          <Button to="#/discover">
            Discover dinners
          </Button>
        </section>
      ) : (
        reservations.map(reservation => (
          <section
            className="card dinner-plan"
            key={reservation._id}
          >
            <p className="eyebrow">
              {reservation.status === 'pending'
                ? 'SEAT REQUEST · PENDING'
                : 'CONFIRMED'}
            </p>

            <h2>{reservation.dinner.title}</h2>

            <p>{reservation.restaurant.name}</p>

            <p>
              {formatWhen(
                reservation.dinner.startsAt,
                reservation.dinner.timeZone
              )}
            </p>

            <p>{reservation.restaurant.address}</p>

            <p>
              {formatPrice(reservation.dinner)} per person
            </p>

            <p>
              {reservation.occupied} of{' '}
              {reservation.dinner.capacity} sample seats held
            </p>

            <Notice>
              Your request is saved to your account.
              This is a sample event, not a restaurant booking.
              Ingredients, preparation, and dietary accommodation
              have not been confirmed with the restaurant.
            </Notice>

            <button
              className="button"
              type="button"
              onClick={() => openFood(reservation.dinner)}
            >
              See food I can eat
            </button>

            <button
              className="button secondary"
              type="button"
              aria-haspopup="dialog"
              onClick={() => openCancellation(reservation)}
            >
              Cancel seat request
            </button>

            <Button to="#/report" secondary>
              Report a concern
            </Button>
          </section>
        ))
      )}

      {data?.hasMore && (
        <Notice>
          Showing your latest 20 pending and 20 confirmed requests.
        </Notice>
      )}

      <dialog
        ref={cancelDialog}
        className="cancel-seat-dialog"
        aria-labelledby="cancel-seat-title"
        aria-describedby="cancel-seat-description"
        onCancel={event => {
          if (cancelling) event.preventDefault()
        }}
      >
        <h2 id="cancel-seat-title">
          Cancel your seat request?
        </h2>

        <p id="cancel-seat-description">
          This releases your sample seat at{' '}
          {selected?.restaurant.name}.
        </p>

        {message && (
          <p className="error" role="alert">
            {message}
          </p>
        )}

        <div className="cancel-dialog-actions">
          <button
            className="button cancel-confirm"
            type="button"
            disabled={cancelling}
            onClick={confirmCancellation}
          >
            {cancelling ? 'Cancelling…' : 'Yes, cancel request'}
          </button>

          <button
            className="button secondary"
            type="button"
            disabled={cancelling}
            autoFocus
            onClick={() => cancelDialog.current?.close()}
          >
            Keep my request
          </button>
        </div>
      </dialog>
    </Page>
  )
}