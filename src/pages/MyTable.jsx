import { useRef, useState } from 'react'
import Page from '../components/Page'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { useApp } from '../state/context'
import { selectedDinner } from '../data/dinners'

export default function MyTable() {
  const { state, update } = useApp()
  const dinner = selectedDinner(state)
  const [checkIn, setCheckIn] = useState(false)
  const cancelDialog = useRef(null)
  if (!state.requested) return <Page eyebrow="MY TABLE" title="Your next table is waiting." intro="You don't have a seat reserved yet.">
    <section className="card booking-card"><h2>Find your next dinner</h2><p>Explore restaurants and available dinners, then join a table to see your reservation here.</p><Button to="#/discover">Discover dinners</Button></section>
  </Page>
  const people = ['You', 'Maya', 'Leo', 'Alex', 'Sam', 'Jules', 'Robin', 'Kai']
  return <Page eyebrow="YOUR NEXT DINNER" title="Your table, coming together." intro={`${dinner.day} · ${dinner.time} · ${dinner.area}`}>
    <div className="table-layout">
      <section className="card"><h2>Eight seats. Eight stories.</h2><div className="people-grid">{people.map(person => <div className="person" key={person}><h3>{person}</h3><small>{person === 'You' ? 'Your seat' : 'Sample diner'}</small></div>)}</div><Notice>All profiles are fictional. Other diners would see only approved profile information; ID documents stay private.</Notice></section>
      <section className="card dinner-plan"><h2>Your dinner plan</h2><p>{dinner.shortDay} · {dinner.time}<br />{dinner.restaurant} · Sample venue<br />{dinner.area}<br />{dinner.price} per person</p>
        <Notice>{state.restaurantConfirmed ? 'Demo approval · All eight diners accommodated. No real restaurant has confirmed.' : 'Sample group check · 8 profiles reviewed. 6 have potential options; 2 need restaurant confirmation. The booking remains pending until all eight can be accommodated.'}</Notice>
        <Button to="#/food">See food I can eat</Button>
        <button className="button" aria-expanded={checkIn} onClick={() => setCheckIn(!checkIn)}>Preview check-in</button>
        {checkIn && <Notice>Demo check-in only. You are not checked in at a venue. No location or attendance is sent.</Notice>}
        <button className="button secondary" aria-haspopup="dialog" onClick={() => cancelDialog.current.showModal()}>Cancel seat</button>
        <dialog ref={cancelDialog} className="cancel-seat-dialog" aria-labelledby="cancel-seat-title" aria-describedby="cancel-seat-description">
          <button className="cancel-dialog-close" type="button" aria-label="Close cancellation confirmation" onClick={() => cancelDialog.current.close()}>&times;</button>
          <h2 id="cancel-seat-title">Are you sure you want to cancel?</h2>
          <p id="cancel-seat-description">This will cancel your sample seat reservation.</p>
          <div className="cancel-dialog-actions">
            <button className="button cancel-confirm" type="button" onClick={() => { cancelDialog.current.close(); update({ requested: false, restaurantConfirmed: false, bookingIntent: false }); setCheckIn(false); window.location.hash = '/discover' }}>Yes</button>
            <button className="button secondary" type="button" autoFocus onClick={() => cancelDialog.current.close()}>No</button>
          </div>
        </dialog>
        <Button to="#/report" secondary>Report a concern</Button>
        <small>After dinner: feedback and reconnection are not connected. No contact details are shared automatically.</small>
      </section>
    </div>
  </Page>
}
