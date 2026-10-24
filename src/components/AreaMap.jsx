import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

const defaultLocation = {
  latitude: 36.9741,
  longitude: -122.0308,
  label: 'California sample outings',
}

const emptyVenues = []

function validCoordinates(latitude, longitude) {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 85 &&
    Math.abs(longitude) <= 180
  )
}

function venueMapUrl(venue) {
  return (
    'https://www.google.com/maps/search/?api=1&query=' +
    encodeURIComponent(
      `${venue.restaurant || ''}, ${venue.address || ''}`
    )
  )
}

function markerIcon(index, pins, active) {
  const color = active ? '#a34e33' : '#273c2d'

  if (pins) {
    return L.divIcon({
      className: 'table8-map-marker',
      html: `
        <svg
          width="30"
          height="40"
          viewBox="0 0 30 40"
          aria-hidden="true"
        >
          <path
            d="M15 1C7.3 1 1 7.3 1 15c0 10 14 24 14 24s14-14 14-24C29 7.3 22.7 1 15 1Z"
            fill="${color}"
            stroke="#ffffff"
            stroke-width="2"
          />
          <circle cx="15" cy="15" r="5" fill="#ffffff" />
        </svg>
      `,
      iconSize: [30, 40],
      iconAnchor: [15, 40],
      popupAnchor: [0, -36],
    })
  }

  return L.divIcon({
    className: 'table8-map-marker',
    html: `
      <span style="
        display:flex;
        align-items:center;
        justify-content:center;
        width:32px;
        height:32px;
        box-sizing:border-box;
        border:2px solid #ffffff;
        border-radius:50%;
        background:${color};
        color:#ffffff;
        font-size:12px;
        font-weight:700;
        box-shadow:0 2px 6px rgba(0,0,0,.2);
      ">${index + 1}</span>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  })
}

function popupContent(venue) {
  const content = document.createElement('div')

  const name = document.createElement('strong')
  name.textContent = venue.restaurant || 'Restaurant'

  const address = document.createElement('p')
  address.textContent = venue.address || ''

  const when = document.createElement('p')
  when.textContent = [
    venue.shortDay,
    venue.time,
  ].filter(Boolean).join(' · ')

  const link = document.createElement('a')
  link.textContent = 'Open restaurant location ↗'
  link.href = venueMapUrl(venue)
  link.target = '_blank'
  link.rel = 'noreferrer'

  content.append(name, address)

  if (when.textContent) {
    content.append(when)
  }

  content.append(link)

  return content
}

export default function AreaMap({
  location,
  venues = emptyVenues,
  highlightedId,
  onHighlight,
  pins = false,
}) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const markersRef = useRef([])

  const onHighlightRef = useRef(onHighlight)
  const activeIdRef = useRef(highlightedId)

  const [error, setError] = useState('')

  const apiKey = (
    import.meta.env.VITE_GEOAPIFY_API_KEY || ''
  ).trim()

  const usableLocation =
    location &&
    validCoordinates(
      location.latitude,
      location.longitude
    )
      ? location
      : defaultLocation

  const {
    latitude,
    longitude,
    label,
  } = usableLocation

  useEffect(() => {
    onHighlightRef.current = onHighlight
  }, [onHighlight])

  useEffect(() => {
    activeIdRef.current = highlightedId
  }, [highlightedId])

  // Create the Leaflet map and Geoapify tile layer.
  useEffect(() => {
    const container = containerRef.current

    if (!apiKey || !container) return

    setError('')

    const map = L.map(container, {
      center: [
        defaultLocation.latitude,
        defaultLocation.longitude,
      ],
      zoom: 13,
      scrollWheelZoom: false,
    })

    mapRef.current = map

    const tiles = L.tileLayer(
      'https://maps.geoapify.com/v1/tile/osm-carto/' +
      '{z}/{x}/{y}.png?apiKey=' +
      encodeURIComponent(apiKey),
      {
        maxZoom: 19,
        attribution:
          'Powered by ' +
          '<a href="https://www.geoapify.com/" ' +
          'target="_blank" rel="noreferrer">Geoapify</a>' +
          ' | © ' +
          '<a href="https://www.openstreetmap.org/copyright" ' +
          'target="_blank" rel="noreferrer">' +
          'OpenStreetMap contributors</a>',
      }
    )

    function handleTileError() {
      setError(
        'Map tiles could not load. Check your Geoapify ' +
        'key, allowed domains, quota, and connection.'
      )
    }

    tiles.on('tileerror', handleTileError)
    tiles.addTo(map)

    let resizeObserver
    let resizeFrame

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        cancelAnimationFrame(resizeFrame)

        resizeFrame = requestAnimationFrame(() => {
          if (
            mapRef.current === map &&
            container.isConnected
          ) {
            map.invalidateSize({ pan: false })
          }
        })
      })

      resizeObserver.observe(container)
    }

    return () => {
      resizeObserver?.disconnect()
      cancelAnimationFrame(resizeFrame)

      tiles.off('tileerror', handleTileError)

      markersRef.current.forEach(({ marker }) => {
        marker.off()
        marker.remove()
      })

      markersRef.current = []
      mapRef.current = null

      map.remove()
    }
  }, [apiKey])

  // Update restaurant markers without rebuilding the map.
  useEffect(() => {
    const map = mapRef.current

    if (!map) return

    markersRef.current.forEach(({ marker }) => {
      marker.off()
      marker.remove()
    })

    markersRef.current = []

    const positions = []

    venues.forEach((venue, index) => {
      if (
        !validCoordinates(
          venue.latitude,
          venue.longitude
        )
      ) {
        return
      }

      const position = [
        venue.latitude,
        venue.longitude,
      ]

      positions.push(position)

      const marker = L.marker(position, {
        title: venue.restaurant || 'Restaurant',
        icon: markerIcon(
          index,
          pins,
          venue.id === activeIdRef.current
        ),
      }).addTo(map)

      marker.bindPopup(popupContent(venue))

      marker.on('click', () => {
        onHighlightRef.current?.(venue.id, true)
      })

      markersRef.current.push({
        id: venue.id,
        index,
        marker,
      })
    })

    if (positions.length > 1) {
      map.fitBounds(L.latLngBounds(positions), {
        padding: [40, 40],
        maxZoom: 15,
        animate: false,
      })
    } else if (positions.length === 1) {
      map.setView(positions[0], 15, {
        animate: false,
      })
    } else {
      map.setView([latitude, longitude], 13, {
        animate: false,
      })
    }

    if (containerRef.current) {
      containerRef.current.dataset.venueMarkers =
        String(positions.length)
    }
  }, [
    apiKey,
    venues,
    latitude,
    longitude,
    pins,
  ])

  // Highlight the marker for the selected dinner.
  useEffect(() => {
    markersRef.current.forEach(
      ({ id, index, marker }) => {
        const active = id === highlightedId

        marker.setIcon(
          markerIcon(index, pins, active)
        )

        marker.setZIndexOffset(active ? 1000 : 0)
      }
    )

    if (containerRef.current) {
      containerRef.current.dataset.highlightedVenue =
        highlightedId || ''
    }
  }, [
    highlightedId,
    venues,
    pins,
    apiKey,
  ])

  function focusVenue(venueId) {
    onHighlightRef.current?.(venueId, true)

    const entry = markersRef.current.find(
      (item) => item.id === venueId
    )

    if (!entry || !mapRef.current) return

    mapRef.current.panTo(
      entry.marker.getLatLng()
    )

    entry.marker.openPopup()
  }

  const fullMapUrl =
    venues.length === 1
      ? venueMapUrl(venues[0])
      : (
          'https://www.openstreetmap.org/' +
          `?mlat=${latitude}&mlon=${longitude}` +
          `#map=13/${latitude}/${longitude}`
        )

  return (
    <section
      className="card area-map"
      aria-label={`Restaurant map for ${label}`}
    >
      <div className="area-map-heading">
        <h2>{label}</h2>
      </div>

      {!apiKey && (
        <p className="map-status" role="alert">
          Add VITE_GEOAPIFY_API_KEY to your frontend
          .env file and restart Vite.
        </p>
      )}

      {error && (
        <p className="map-status" role="alert">
          {error}
        </p>
      )}

      <div
        ref={containerRef}
        className="area-map-frame table8-leaflet-map"
        aria-label={`Interactive map of ${label}`}
        style={{
          width: '100%',
          height: 340,
          minHeight: 280,
          position: 'relative',
          zIndex: 0,
        }}
      />

      {pins ? (
        <ul className="map-venue-legend map-pin-legend">
          {venues.map((venue) => (
            <li key={venue.id}>
              <span aria-hidden="true">📍 </span>

              <button
                type="button"
                className={
                  highlightedId === venue.id
                    ? 'venue-highlighted'
                    : ''
                }
                onClick={() => focusVenue(venue.id)}
              >
                {venue.restaurant}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ol className="map-venue-legend">
          {venues.map((venue, index) => (
            <li key={venue.id} value={index + 1}>
              <button
                type="button"
                className={
                  highlightedId === venue.id
                    ? 'venue-highlighted'
                    : ''
                }
                onClick={() => focusVenue(venue.id)}
              >
                {venue.restaurant}
              </button>
            </li>
          ))}
        </ol>
      )}

      <a
        className="text-link"
        href={fullMapUrl}
        target="_blank"
        rel="noreferrer"
      >
        Open larger map ↗
      </a>
    </section>
  )
}