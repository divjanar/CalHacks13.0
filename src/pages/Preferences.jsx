import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import Page from '../components/Page'
import Button from '../components/Button'
import Field from '../components/Field'
import Notice from '../components/Notice'
import DietaryGuidance from '../components/DietaryGuidance'
import {
  allergenLabel,
  allergenOptions,
  religiousDietOptions,
} from '../data/menu'
import { useApp } from '../state/context'

export default function Preferences({ accountMode = false }) {
  const { state } = useApp()

  if (!state.signedIn) {
    return (
      <Page title="Sign in to continue.">
        <Button to="#/signin">Sign in</Button>
      </Page>
    )
  }

  if (state.accountLoading) {
    return (
      <Page title="Loading your dining preferences…">
        <p role="status">Getting your saved answers.</p>
      </Page>
    )
  }

  if (!state.account?.profile?.firstName) {
    return (
      <Page
        title="Start with your personal information."
        intro="Save your name and local area before your dining preferences."
      >
        <Button to="#/settings">Complete personal information →</Button>
      </Page>
    )
  }

  return (
    <PreferencesForm
      key={state.account.profile._id}
      accountMode={accountMode}
    />
  )
}

function PreferencesForm({ accountMode }) {
  const { state, update } = useApp()
  const savePreferences = useMutation(api.accounts.savePreferences)

  const [preferences, setPreferences] = useState(() => ({
    ...state.preferences,
    allergies: [...(state.preferences.allergies || [])],
  }))

  const [answered, setAnswered] = useState(
    state.preferences.allergiesAnswered === true
  )
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  function change(key, value) {
    setMessage('')
    setFailed(false)
    setPreferences(previous => ({
      ...previous,
      [key]: value,
    }))
  }

  async function save(event) {
    event.preventDefault()
    if (saving) return

    setMessage('')
    setFailed(false)

    if (!answered) {
      setExpanded(true)
      setFailed(true)
      setMessage('Select your allergies or explicitly choose None.')
      return
    }

    if (!preferences.diet) {
      setFailed(true)
      setMessage('Select a dietary preset or None.')
      return
    }

    const religiousDetails = religiousDietOptions.includes(
      preferences.diet
    )
      ? (preferences.religiousDetails || '').trim()
      : ''

    if (preferences.diet === 'Other' && !religiousDetails) {
      setFailed(true)
      setMessage('Describe your dietary needs.')
      return
    }

    setSaving(true)

    try {
      await savePreferences({
        diet: preferences.diet,
        allergies: preferences.allergies,
        allergiesAnswered: true,
        religiousDetails,
      })

      update({
        restaurantConfirmed: false,
        bookingIntent: accountMode ? false : state.bookingIntent,
        verificationNext: 'consent',
      })

      if (accountMode) {
        setMessage('Your dining preferences have been saved to your account.')
      } else {
        window.location.hash = state.verified
          ? '/consent'
          : '/verify'
      }
    } catch (error) {
      setFailed(true)
      setMessage(
        typeof error?.data === 'string'
          ? error.data
          : error.message || 'Unable to save your preferences.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page
      eyebrow={
        accountMode
          ? 'YOUR ACCOUNT'
          : 'ACCOUNT SETUP · DINING PREFERENCES'
      }
      title={
        accountMode
          ? 'User preferences'
          : 'Your kind of evening.'
      }
      intro="Tell us your allergies and dietary requirements so we can review restaurant menus against your needs."
    >
      <form
        className="card narrow-card"
        onSubmit={save}
        aria-busy={saving}
      >
        <fieldset
          disabled={saving}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <div className="allergy-picker">
            <button
              className="field field-trigger"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded(value => !value)}
            >
              <span>Food allergies · Required</span>
              <span className="field-value">
                {answered
                  ? preferences.allergies.map(allergenLabel).join(', ') ||
                    'None'
                  : 'Choose allergies or select None'}
              </span>
            </button>

            {expanded && (
              <fieldset>
                <legend>Food allergies</legend>

                <div className="checkbox-grid">
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={
                        answered && preferences.allergies.length === 0
                      }
                      onChange={event => {
                        setAnswered(event.target.checked)
                        change('allergies', [])
                      }}
                    />
                    None
                  </label>

                  {allergenOptions.map(allergen => (
                    <label key={allergen} className="check">
                      <input
                        type="checkbox"
                        checked={preferences.allergies.includes(allergen)}
                        onChange={event => {
                          const next = event.target.checked
                            ? [...preferences.allergies, allergen]
                            : preferences.allergies.filter(
                                item => item !== allergen
                              )

                          change('allergies', next)
                          setAnswered(next.length > 0)
                        }}
                      />
                      {allergenLabel(allergen)}
                    </label>
                  ))}
                </div>

                <small>
                  Select None explicitly if no listed allergies apply.
                </small>
              </fieldset>
            )}
          </div>

          <Field label="Dietary restrictions · Required">
            <select
              required
              value={preferences.diet}
              onChange={event => change('diet', event.target.value)}
            >
              <option value="" disabled>
                Select restrictions or None
              </option>
              <option value="No preference">None</option>
              <option>Vegetarian</option>
              <option>Vegan</option>
              <option>Pescatarian</option>
              {religiousDietOptions.map(diet => (
                <option key={diet}>{diet}</option>
              ))}
            </select>
          </Field>

          <DietaryGuidance diet={preferences.diet} />

          {religiousDietOptions.includes(preferences.diet) && (
            <Field
              label={
                preferences.diet === 'Other'
                  ? 'Your dietary needs'
                  : 'Additional dietary requirements (optional)'
              }
              hint="Describe any foods, ingredients, or preparation methods you need to avoid."
            >
              <textarea
                required={preferences.diet === 'Other'}
                maxLength={500}
                value={preferences.religiousDetails || ''}
                onChange={event =>
                  change('religiousDetails', event.target.value)
                }
              />
            </Field>
          )}
        </fieldset>

        <Notice>
          These answers are saved privately to your account in Convex.
          Menu analysis can miss ingredients. Preparation, sourcing,
          and cross-contact require restaurant confirmation.
        </Notice>

        {message && (
          <p
            className={failed ? 'error' : 'status-message'}
            role={failed ? 'alert' : 'status'}
          >
            {message}
          </p>
        )}

        <button className="button" type="submit" disabled={saving}>
          {saving
            ? 'Saving…'
            : accountMode
              ? 'Save preferences'
              : 'Save and continue →'}
        </button>

        {accountMode && (
          <Button to="#/discover" secondary>
            Back to dinners
          </Button>
        )}
      </form>
    </Page>
  )
}