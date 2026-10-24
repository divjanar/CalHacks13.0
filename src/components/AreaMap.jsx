import { useEffect, useRef, useState } from 'react'
import { mapUrls } from '../services/areaSearch'

const defaultLocation = { latitude: 36.9741, longitude: -122.0308, label: 'California sample outings' }
let mapsLoader
function loadGoogleMaps() {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps)
  if (!mapsLoader) mapsLoader = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    const timeout = setTimeout(() => reject(new Error('Google Maps timed out.')), 15000)
    window.table8MapsReady = () => { clearTimeout(timeout); resolve(window.google.maps) }
    window.gm_authFailure = () => { clearTimeout(timeout); reject(new Error('Google Maps access was denied. Enable Maps JavaScript API and check key restrictions.')) }
    script.src = `https://maps.googleapis.com/maps/api/js?${new URLSearchParams({ key: import.meta.env.VITE_GOOGLE_MAPS_API_KEY, callback: 'table8MapsReady', loading: 'async', v: 'weekly' })}`
    script.async = true
    script.onerror = () => { clearTimeout(timeout); reject(new Error('Google Maps could not connect.')) }
    document.head.append(script)
  }).catch(error => { mapsLoader = null; throw error })
  return mapsLoader
}
function GoogleMap({ location, venues, highlightedId, onHighlight }) {
  const element = useRef(null)
  const markerRefs = useRef([])
  const mapInstance = useRef(null)
  const activeId = useRef(highlightedId)
  const [error, setError] = useState('')
  useEffect(() => {
    let disposed = false
    let map
    const markers = []
    loadGoogleMaps().then(maps => {
      if (disposed) return
      map = mapInstance.current || new maps.Map(element.current, {
        center: { lat: location.latitude, lng: location.longitude }, zoom: 13,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [
          { featureType: 'landscape', stylers: [{ color: '#f5f3ea' }] },
          { featureType: 'water', stylers: [{ color: '#c7d8d3' }] },
          { featureType: 'poi.park', stylers: [{ color: '#e8eddf' }] },
          { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
        ],
      })
      mapInstance.current = map
      map.setCenter({ lat: location.latitude, lng: location.longitude })
      map.setZoom(13)
      const bounds = new maps.LatLngBounds()
      const info = new maps.InfoWindow()
      venues.forEach((venue, index) => {
        const position = { lat: venue.latitude, lng: venue.longitude }
        const marker = new maps.Marker({ map, position, title: venue.restaurant, label: { text: String(index + 1), color: '#ffffff' }, icon: { path: maps.SymbolPath.CIRCLE, fillColor: '#273c2d', fillOpacity: 1, strokeColor: '#ffffff', strokeWeight: 2, scale: 15 } })
        markers.push(marker)
        markerRefs.current.push({ id: venue.id, marker })
        bounds.extend(position)
        marker.addListener('click', () => {
          onHighlight?.(venue.id, true)
          const content = document.createElement('div')
          const name = document.createElement('strong'); name.textContent = venue.restaurant
          const address = document.createElement('p'); address.textContent = venue.address
          const event = document.createElement('p'); event.textContent = `${venue.shortDay}, ${venue.time} - sample dinner`
          const link = document.createElement('a'); link.textContent = 'View venue on Google Maps'; link.href = venue.googleMapsUri; link.target = '_blank'; link.rel = 'noreferrer'
          content.append(name, address, event, link)
          info.setContent(content); info.open({ map, anchor: marker })
        })
      })
      if (venues.length > 1) map.fitBounds(bounds, 40)
      else if (venues.length === 1) { map.setCenter(bounds.getCenter()); map.setZoom(15) }
      element.current.dataset.venueMarkers = String(markers.length)
      markerRefs.current.forEach(({ id, marker }) => {
        const active = id === activeId.current
        marker.setIcon({ ...marker.getIcon(), fillColor: active ? '#a34e33' : '#273c2d', scale: active ? 20 : 15 })
        marker.setZIndex(active ? 1000 : undefined)
      })
    }).catch(failure => { if (!disposed) setError(failure.message) })
    return () => { disposed = true; markerRefs.current = []; markers.forEach(marker => { window.google?.maps?.event.clearInstanceListeners(marker); marker.setMap(null) }) }
  }, [location, venues, onHighlight])
  useEffect(() => {
    activeId.current = highlightedId
    markerRefs.current.forEach(({ id, marker }) => {
      const active = id === highlightedId
      marker.setIcon({ ...marker.getIcon(), fillColor: active ? '#a34e33' : '#273c2d', scale: active ? 20 : 15 })
      marker.setZIndex(active ? 1000 : undefined)
    })
    if (element.current) element.current.dataset.highlightedVenue = highlightedId || ''
  }, [highlightedId])
  return <>{error && <p role="alert" className="map-status">{error}</p>}<div ref={element} className="area-map-frame google-area-map" aria-label={`Google Map of ${location.label}`} /></>
}
export default function AreaMap({ location, resultCount, venues = [], highlightedId, onHighlight }) {
  location = location || defaultLocation
  const google = Boolean(import.meta.env.VITE_GOOGLE_MAPS_API_KEY)
  const full = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`restaurants in ${location.label}`)}`
  return <section className="card area-map" aria-label="Searched area map"><div className="area-map-heading"><h2>{location.label}</h2><p>{resultCount} Table 8 sample dinners</p></div>
    {google ? <GoogleMap location={location} venues={venues} highlightedId={highlightedId} onHighlight={onHighlight} /> : <iframe className="area-map-frame" title={`Map of ${location.label}`} src={mapUrls(location).embed} loading="lazy" />}
    <ol className="map-venue-legend" start={1}>{venues.map((venue, index) => <li key={venue.id} value={index + 1}><button type="button" className={highlightedId === venue.id ? 'venue-highlighted' : ''} onClick={() => onHighlight?.(venue.id, true)}>{venue.restaurant}</button></li>)}</ol>
    <a className="text-link" href={google ? full : mapUrls(location).full} target="_blank" rel="noreferrer">Explore restaurants on the larger map</a>
    <small>{google ? 'Google Maps' : 'OpenStreetMap contributors'} - numbered pins show the sample dinner venues.</small>
  </section>
}
