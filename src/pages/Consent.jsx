import { useState } from 'react'
import Page from '../components/Page'
import Notice from '../components/Notice'
import { useApp } from '../state/context'

export default function Consent() {
  const { state, update } = useApp()
  const [choices, setChoices] = useState({ community: false, terms: false, privacy: false, marketing: false })
  function submit(event) {
    event.preventDefault()
    const requestingSeat = state.bookingIntent === true
    update({ consent: true, marketing: choices.marketing, bookingIntent: false, ...(requestingSeat ? { requested: true, restaurantConfirmed: false } : {}) })
    window.location.hash = requestingSeat ? '/confirmation' : '/discover'
  }
  const acknowledgments = [
    ['community', 'I agree to the community guidelines.'],
    ['terms', 'I have reviewed the participation terms and understand this is an in-person event.'],
    ['privacy', 'I have read the privacy notice.'],
    ['marketing', 'Send me occasional dinner updates. (Optional)'],
  ]
  return <Page eyebrow="STEP 3 OF 3 · COMMUNITY & CONSENT" title="Make room for respect." intro="Review the guidelines and make your choices before confirming your seat.">
    <form className="card narrow-card consent-card" onSubmit={submit}>
      <h2>At every table</h2>
      <p>Respect personal boundaries.<br />Ask before taking or sharing photos.<br />Meet at the confirmed public venue.<br />Report harassment or unwanted contact.</p>
      <hr />
      {acknowledgments.map(([key, label]) => <label className={`check ${key === 'marketing' ? 'muted' : ''}`} key={key}><input type="checkbox" required={key !== 'marketing'} checked={choices[key]} onChange={event => setChoices({ ...choices, [key]: event.target.checked })} />{label}</label>)}
      <Notice>Consent wording is a design draft. Required acknowledgments must be separate from optional marketing preferences.</Notice>
      <button className="button" type="submit">{state.bookingIntent ? 'Request my seat →' : 'Continue to dinners →'}</button>
      <small>Prototype · No legal consent record is stored. Marketing is not connected.</small>
    </form>
  </Page>
}
