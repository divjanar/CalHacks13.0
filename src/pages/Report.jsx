import { useState } from 'react'
import Page from '../components/Page'
import Field from '../components/Field'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { dinners } from '../data/dinners'
import { useApp } from '../state/context'

export default function Report() {
  const { state } = useApp()
  const [submitted, setSubmitted] = useState(false)
  return <Page eyebrow="REPORT & SUPPORT" title="We’re here to listen." intro="Tell us what happened. Reports are reviewed privately by our support team in the connected service.">
    {submitted ? <section className="card booking-card"><h2>Sample report received</h2><p role="status">Preview complete. Nothing was sent or saved. No support team is monitoring this form.</p><button className="button secondary" onClick={() => setSubmitted(false)}>Try another sample report</button><Button to="#/table">Back to my tables</Button></section> : <form className="card booking-card" onSubmit={event => { event.preventDefault(); setSubmitted(true) }}>
      <Field label="What do you need help with?"><select required defaultValue="Safety concern"><option>Safety concern</option><option>Dining needs</option><option>My request</option><option>Something else</option></select></Field>
      <Field label="Related dinner"><select defaultValue={state.dinnerId}>{dinners.map(dinner => <option key={dinner.id} value={dinner.id}>{dinner.day}</option>)}</select></Field>
      <Field label="Person involved (optional)"><select defaultValue=""><option value="">Select a diner</option>{['Maya', 'Leo', 'Alex', 'Sam', 'Jules', 'Robin', 'Kai'].map(name => <option key={name}>{name}</option>)}</select></Field>
      <Field label="Describe what happened"><textarea required minLength={10} maxLength={1500} placeholder="Include details you are comfortable sharing. Do not include ID numbers or payment information." /></Field>
      <Field label="Reply email"><input type="email" required placeholder="you@example.com" /></Field>
      <Notice>A report design preview only. Nothing is sent. In an immediate emergency, contact local emergency services.</Notice>
      <button className="button" type="submit">Preview report received →</button>
      <small>Your report would be reviewed privately. Block and leave-table options will be available in the real service.</small>
    </form>}
  </Page>
}
