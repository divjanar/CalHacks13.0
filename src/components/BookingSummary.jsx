import Button from './Button'
import Notice from './Notice'
import { useApp } from '../state/context'
import { selectedDinner } from '../data/dinners'

export default function BookingSummary({ confirmed = false }) {
  const { state } = useApp()
  const dinner = selectedDinner(state)
  return <section className="card booking-card">
    <h2>{dinner.title}</h2>
    <p>{dinner.day} · {dinner.time}–{dinner.endTime}<br />{dinner.area} · Sample venue: {dinner.restaurant}<br />{dinner.price} per person · Pay the restaurant</p>
    <Notice>{confirmed ? 'Demo approval · All eight diners accommodated. This is a simulated confirmed booking.' : 'Sample booking request · Pending dietary confirmation for all eight diners. No real seat has been reserved.'}</Notice>
    <Button to="#/table">Meet my table →</Button>
    <Button to="#/discover" secondary>Back to dinners</Button>
    <small>Need to cancel? You can review cancellation options from My table.</small>
  </section>
}
