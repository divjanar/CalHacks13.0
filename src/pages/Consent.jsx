import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import Page from '../components/Page'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { useApp } from '../state/context'

const acknowledgments = [
  ['community', 'I agree to the community guidelines.'],
  [
    'terms',
    'I have reviewed the participation terms and understand this is an in-person event.',
  ],
  ['privacy', 'I have read the privacy notice.'],
  ['marketing', 'Send me occasional dinner updates. (Optional)'],
]

export default function Consent() {
  const { state, update } = useApp()
  const acceptAgreements = useMutation(api.accounts.acceptAgreements)

  const [choices, setChoices] = useState({
    community: false,
    terms: false,
    privacy: false,
    marketing: state.account?.profile?.marketing === true,
  })
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (saving) return

    if (!choices.community || !choices.terms || !choices.privacy) {
      setMessage('Complete all three required acknowledgments.')
      return
    }

    setSaving(true)
    setMessage('')

    try {
      await acceptAgreements(choices)

      update({
        consent: true,
        marketing: choices.marketing,
        bookingIntent: false,
      })

      // Account setup does not submit a reservation.
      window.location.hash = '/discover'
    } catch (error) {
      setMessage(
        typeof error?.data === 'string'
          ? error.data
          : error.message || 'Unable to save your acknowledgments.'
      )
    } finally {
      setSaving(false)
    }
  }

  if (!state.signedIn) {
    return (
      <Page title="Sign in to continue.">
        <Button to="#/signin">Sign in</Button>
      </Page>
    )
  }

  if (state.accountLoading) {
    return (
      <Page title="Loading your account…">
        <p role="status">Getting your saved setup progress.</p>
      </Page>
    )
  }

  if (!state.account?.preferences?.allergiesAnswered) {
    return (
      <Page title="Complete your dining preferences first.">
        <Button to="#/preferences">
          Dining preferences →
        </Button>
      </Page>
    )
  }

  // Keep the existing prototype age-check step in the UI flow.
  if (!state.verified && !state.onboardingComplete) {
    return (
      <Page
        title="Complete the DOB check first."
        intro="The prototype age check is separate from email verification."
      >
        <Button to="#/verify">Continue to DOB check →</Button>
      </Page>
    )
  }

  return (
    <Page
      eyebrow="ACCOUNT SETUP · COMMUNITY & CONSENT"
      title="Make room for respect."
      intro="Review the guidelines and make your choices to finish your account setup."
    >
      <form
        className="card narrow-card consent-card"
        onSubmit={submit}
        aria-busy={saving}
      >
        <h2>At every table</h2>

        <p>
          Respect personal boundaries.
          <br />
          Ask before taking or sharing photos.
          <br />
          Meet at the confirmed public venue.
          <br />
          Report harassment or unwanted contact.
        </p>

        <hr />

        {acknowledgments.map(([key, label]) => (
          <label
            className={`check ${key === 'marketing' ? 'muted' : ''}`}
            key={key}
          >
            <input
              type="checkbox"
              required={key !== 'marketing'}
              disabled={saving}
              checked={choices[key]}
              onChange={event => {
                const checked = event.target.checked
                setChoices(previous => ({
                  ...previous,
                  [key]: checked,
                }))
                setMessage('')
              }}
            />
            {label}
          </label>
        ))}

        <Notice>
          Your required acknowledgments and optional marketing choice
          are saved separately in Convex. The wording remains a
          prototype draft; marketing messages are not connected.
        </Notice>

        {message && (
          <p className="error" role="alert">{message}</p>
        )}

        <button className="button" type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Finish setup and discover dinners →'}
        </button>

        <small>
          Finishing account setup does not reserve a seat or verify
          your identity. Reservation eligibility needs backend enforcement.
        </small>
      </form>
    </Page>
  )
}