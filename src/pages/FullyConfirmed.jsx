import Page from '../components/Page'
import BookingSummary from '../components/BookingSummary'
import Waiter from '../components/Waiter'

export default function FullyConfirmed() {
  return <Page eyebrow="YOU’RE IN" title="Your table is confirmed!" intro="The restaurant has confirmed suitable options for all eight diners.">
    <div className="confirmed-banner"><div className="jumping-host"><Waiter variant="celebration" /></div><p>You’re all set!<br />Eight seats. One great evening.</p></div>
    <BookingSummary confirmed />
  </Page>
}
