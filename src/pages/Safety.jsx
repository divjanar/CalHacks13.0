import Page from '../components/Page'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { useApp } from '../state/context'

export default function Safety() {
  const { state } = useApp()
  return <Page eyebrow="TRUST & SAFETY" title="Good evenings start with trust." intro="Thoughtful steps before, during, and after every dinner.">
    <div className="safety-grid">
      <section className="card"><h2>Verified identity</h2><p>Identity and age checks before joining. Verification is one layer of trust; it cannot guarantee someone’s behavior.</p></section>
      <section className="card"><h2>A public place to meet</h2><p>Dinner takes place at a confirmed public restaurant. Share your plan with someone you trust and arrange your own travel.</p></section>
      <section className="card"><h2>Your boundaries matter</h2><p>Ask before taking photos or sharing contact details. You can leave, block contact, or report a concern.</p></section>
    </div>
    <section className="card booking-card faq-card"><h2>Before you book</h2>
      <p>How is my ID handled?<br />A verification provider and retention policy will be finalized before launch. Other diners never receive your ID.</p>
      <p>Who sees my dietary needs?<br />Only the information needed to arrange your meal should be shared with the restaurant.</p>
      <p>What if I feel uncomfortable?<br />Leave the situation if you need to, and contact support. For immediate danger, contact local emergency services.</p>
      {state.signedIn && <Button to="#/report">Report or get support →</Button>}
      {state.signedIn ? <Button to="#/discover" secondary>Browse dinners</Button> : <Button to="#/signup">Create an account</Button>}
    </section>
    <Notice>Design preview. Identity checks, venue confirmation, blocking, and support are not connected. Reports are not monitored.</Notice>
  </Page>
}
