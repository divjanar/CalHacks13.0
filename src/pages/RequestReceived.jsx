import Page from '../components/Page'
import BookingSummary from '../components/BookingSummary'
import Waiter from '../components/Waiter'
import { useApp } from '../state/context'

export default function RequestReceived() {
  const { update } = useApp()
  function approve() {
    update({ requested: true, restaurantConfirmed: true })
    window.location.hash = '/confirmed'
  }
  return <Page className="request-page" eyebrow="YOU’RE IN" title="Your request is received." intro="We’re checking the restaurant’s menu against the needs of everyone at your table.">
    <div className="request-layout"><BookingSummary /><div className="request-host" aria-label="Your host celebrates your sample request"><div className="jumping-host"><Waiter variant="celebration" /></div></div></div>
    <button className="button approval-button" onClick={approve}>Preview restaurant approval →</button>
  </Page>
}
