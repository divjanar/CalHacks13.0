import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'

import Page from '../components/Page'
import Button from '../components/Button'
import Notice from '../components/Notice'
import AreaMap from '../components/AreaMap'
import { dinners } from '../data/dinners'
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
  const format = (cents) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: dinner.currency,
      maximumFractionDigits: 0,
    }).format(cents / 100)

  if (
    dinner.minPriceCents != null &&
    dinner.maxPriceCents != null
  ) {
    return (
      `${format(dinner.minPriceCents)}–` +
      `${format(dinner.maxPriceCents)}`
    )
  }

  return 'Price not provided'
}

function RestaurantMap({ reservation }) {
  const { restaurant, dinner } = reservation

  const mapData = useMemo(() => {
    const listing = dinners.find(
      (item) => item.id === dinner.slug
    )

    // Prefer coordinates saved with the reservation's
    // restaurant, otherwise use its matching dinner listing.
    const hasSavedCoordinates =
      Number.isFinite(restaurant.latitude) &&
      Number.isFinite(restaurant.longitude)

    const latitude = hasSavedCoordinates
      ? restaurant.latitude
      : listing?.latitude

    const longitude = hasSavedCoordinates
      ? restaurant.longitude
      : listing?.longitude

    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {
      return null
    }

    const searchUrl =
      'https://www.google.com/maps/search/?api=1&query=' +
      encodeURIComponent(
        `${restaurant.name}, ${restaurant.address}`
      )

    return {
      location: {
        latitude,
        longitude,
        label: restaurant.name,
      },
      venues: [
        {
          ...listing,
          id: dinner.slug,
          restaurant: restaurant.name,
          address: restaurant.address,
          latitude,
          longitude,
          shortDay: formatWhen(
            dinner.startsAt,
            dinner.timeZone
          ),
          time: '',
          googleMapsUri: searchUrl,
        },
      ],
    }
  }, [restaurant, dinner])

  const directionsUrl =
    'https://www.google.com/maps/dir/?api=1&destination=' +
    encodeURIComponent(
      `${restaurant.name}, ${restaurant.address}`
    )

  return (
    <aside
      className="my-table-map"
      aria-label={`Location of ${restaurant.name}`}
    >
      {mapData ? (
        <AreaMap
          pins
          location={mapData.location}
          venues={mapData.venues}
        />
      ) : (
        <section className="card">
          <h2>{restaurant.name}</h2>
          <p>{restaurant.address}</p>
          <p className="muted">
            Map coordinates are not available for this venue.
          </p>
        </section>
      )}

      <a
        className="button secondary my-table-directions"
        href={directionsUrl}
        target="_blank"
        rel="noreferrer"
      >
        Get directions ↗
      </a>
    </aside>
  )
}

export default function MyTable() {
  const { state, update } = useApp()

  const data = useQuery(
    api.reservations.listMine,
    state.signedIn && !state.authLoading
      ? {}
      : 'skip'
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
          : error.message ||
            'Unable to cancel your request.'
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
        <div
          className="account-spinner"
          aria-hidden="true"
        />
      </div>
    )
  }

  if (!state.signedIn) {
    return (
      <Page
        eyebrow="MY TABLES"
        title="Sign in to see your table."
      >
        <Button to="#/signin">Sign in</Button>
      </Page>
    )
  }

  const reservations = data?.reservations || []

  return (
    <Page
      eyebrow="MY TABLES"
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
            Explore
          </Button>
        </section>
      ) : (
        <div className="my-table-reservations">
          {reservations.map((reservation) => (
            <div
              className="my-table-row"
              key={reservation._id}
            >
              <section className="card dinner-plan">
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
                  {formatPrice(reservation.dinner)}
                  {' '}per person
                </p>

                <p>
                  {reservation.occupied} of{' '}
                  {reservation.dinner.capacity}
                  {' '}seats held
                </p>

                <div className="my-table-actions">
                  <button
                    className="button"
                    type="button"
                    onClick={() =>
                      openFood(reservation.dinner)
                    }
                  >
                    See food I can eat
                  </button>

                  <button
                    className="button secondary"
                    type="button"
                    aria-haspopup="dialog"
                    onClick={() =>
                      openCancellation(reservation)
                    }
                  >
                    Cancel seat request
                  </button>

                  <Button to="#/report" secondary>
                    Report a concern
                  </Button>
                </div>
              </section>

              <RestaurantMap reservation={reservation} />
            </div>
          ))}
        </div>
      )}

      {data?.hasMore && (
        <Notice>
          Showing your latest 20 pending and 20
          confirmed requests.
        </Notice>
      )}

      <dialog
        ref={cancelDialog}
        className="cancel-seat-dialog"
        aria-labelledby="cancel-seat-title"
        aria-describedby="cancel-seat-description"
        onCancel={(event) => {
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
            {cancelling
              ? 'Cancelling…'
              : 'Yes, cancel request'}
          </button>

          <button
            className="button secondary"
            type="button"
            disabled={cancelling}
            autoFocus
            onClick={() =>
              cancelDialog.current?.close()
            }
          >
            Keep my request
          </button>
        </div>
      </dialog>
    </Page>
  )
}
