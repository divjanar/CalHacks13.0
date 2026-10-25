import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../../convex/_generated/api'
import Page from '../components/Page'
import Field from '../components/Field'
import LocationInput from '../components/LocationInput'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { resolveLocalArea } from '../services/areaSuggestions'
import { useApp } from '../state/context'

export default function UserSettings() {
  const { state, pendingEmail } = useApp()

  if (state.authLoading || state.accountLoading) {
    return (
      <div
        className="account-spinner-screen"
        role="status"
        aria-label="Loading your account"
        aria-busy="true"
      >
        <div className="account-spinner" aria-hidden="true" />
      </div>
    )
  }

  if (!state.signedIn) {
    return (
      <Page title="Sign in to continue.">
        <Button to="#/signin">Sign in</Button>
      </Page>
    )
  }

  const legalName = state.account?.legalName

  if (
    state.account?.ageCheckPassed !== true ||
    !legalName?.firstName ||
    !legalName.lastName
  ) {
    return (
      <Page
        eyebrow="ACCOUNT SETUP"
        title="Verification comes first."
        intro="Complete the prototype name and DOB checks before adding your account information."
      >
        <Button to="#/verify">
          Continue to verification →
        </Button>
      </Page>
    )
  }

  return (
    <ProfileForm
      key={JSON.stringify([
        state.account?.profile?._id || 'new-profile',
        legalName.firstName,
        legalName.lastName,
      ])}
      profile={state.account?.profile}
      legalName={legalName}
      email={pendingEmail}
      onboarding={!state.onboardingComplete}
      demoDeclaration={state.account?.verificationMethod === 'demo_self_attested'}
    />
  )
}

function ProfileForm({
  profile,
  legalName,
  email,
  onboarding,
  demoDeclaration,
}) {
  const saveProfile = useMutation(api.accounts.saveProfile)

  const [preferredFirstName, setPreferredFirstName] = useState(
    profile?.preferredFirstName || ''
  )

  const [localArea, setLocalArea] = useState(
    profile?.localArea || ''
  )

  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  function clearMessage() {
    setMessage('')
    setFailed(false)
  }

  async function save(event) {
    event.preventDefault()
    if (saving) return

    clearMessage()

    if (!localArea.trim()) {
      setFailed(true)
      setMessage('Enter your local area.')
      return
    }

    setSaving(true)

    try {
      const area = await resolveLocalArea(localArea)

      const preferred =
        preferredFirstName.trim() || legalName.firstName

      await saveProfile({
        firstName: legalName.firstName,
        lastName: legalName.lastName,
        preferredFirstName: preferred,
        localArea: area,
      })

      if (onboarding) {
        window.location.hash = '/preferences'
        return
      }

      setLocalArea(area)
      setPreferredFirstName(preferred)
      setMessage('Your account details have been saved.')
    } catch (error) {
      setFailed(true)
      setMessage(
        typeof error?.data === 'string'
          ? error.data
          : error.message || 'Unable to save your profile.'
      )
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page
      eyebrow={
        onboarding
          ? 'ACCOUNT SETUP · PERSONAL INFORMATION'
          : 'YOUR ACCOUNT'
      }
      title={
        onboarding
          ? 'Let’s get to know you.'
          : 'User settings'
      }
      intro={
        onboarding
          ? demoDeclaration
            ? 'Your name comes from your temporary demo declaration. Add your preferred name and local area.'
            : 'Your legal name comes from your completed document check. Add your preferred name and local area.'
          : 'Manage your preferred name and local area.'
      }
    >
      <form
        className="card narrow-card settings-form"
        onSubmit={save}
        aria-busy={saving}
      >
        <h2>Personal information</h2>

        <fieldset
          disabled={saving}
          style={{
            border: 0,
            padding: 0,
            margin: 0,
            minWidth: 0,
          }}
        >
          <Field
            label={demoDeclaration ? 'First name' : 'Legal first name'}
            hint={demoDeclaration ? 'Saved from your temporary demo declaration.' : 'Saved from your completed prototype name check.'}
          >
            <input
              name="firstName"
              autoComplete="given-name"
              value={legalName.firstName}
              readOnly
            />
          </Field>

          <Field
            label={demoDeclaration ? 'Last name' : 'Legal last name'}
            hint={demoDeclaration ? 'Saved from your temporary demo declaration.' : 'Legal-name changes require another review.'}
          >
            <input
              name="lastName"
              autoComplete="family-name"
              value={legalName.lastName}
              readOnly
            />
          </Field>

          <Field
            label="Preferred first name (optional)"
            hint="Shown beside your account icon. Leave blank to use your first name."
          >
            <input
              name="preferredFirstName"
              autoComplete="nickname"
              maxLength={80}
              value={preferredFirstName}
              onChange={event => {
                setPreferredFirstName(event.target.value)
                clearMessage()
              }}
            />
          </Field>

          <LocationInput
            label="Local area"
            required
            value={localArea}
            onChange={value => {
              setLocalArea(value)
              clearMessage()
            }}
          />

          <Field
            label="University email"
            hint="Your sign-in email is managed by Clerk."
          >
            <input
              type="email"
              value={email || ''}
              readOnly
            />
          </Field>
        </fieldset>

        <Notice>
          {demoDeclaration
            ? 'Your name was saved through temporary demo setup. No document or identity verification was performed. Your preferred name can be different.'
            : 'Your legal name is tied to the saved prototype document check. Your preferred name can be different. The check compares printed text; it does not establish document authenticity or ownership.'}
        </Notice>

        {message && (
          <p
            className={failed ? 'error' : 'status-message'}
            role={failed ? 'alert' : 'status'}
          >
            {message}
          </p>
        )}

        <button
          className="button"
          type="submit"
          disabled={saving}
        >
          {saving
            ? 'Saving…'
            : onboarding
              ? 'Save and continue to dining preferences →'
              : 'Save changes'}
        </button>

        {!onboarding && (
          <Button to="#/discover" secondary>
            Back to dinners
          </Button>
        )}

        <Button to="#/report" secondary>
          Get account help
        </Button>
      </form>
    </Page>
  )
}
