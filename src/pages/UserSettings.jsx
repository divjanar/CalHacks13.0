import { useState } from 'react'
import Page from '../components/Page'
import Field from '../components/Field'
import LocationInput from '../components/LocationInput'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { resolveLocalArea } from '../services/areaSuggestions'
import { useApp } from '../state/context'

export default function UserSettings() {
  const { state, update, pendingEmail } = useApp()
  const [firstName, setFirstName] = useState(state.profile?.firstName || '')
  const [lastName, setLastName] = useState(state.profile?.lastName || '')
  const [preferredFirstName, setPreferredFirstName] = useState(state.profile?.preferredFirstName || '')
  const [localArea, setLocalArea] = useState(state.profile?.localArea ?? state.preferences.area ?? '')
  const [message, setMessage] = useState('')
  const hasAccount = state.signedIn || Boolean(state.profile && state.verificationNext === 'preferences')
  async function save(event) {
    event.preventDefault()
    if (!firstName.trim() || !lastName.trim()) { setMessage('Enter your first and last name.'); return }
    let area
    try { area = await resolveLocalArea(localArea) } catch (failure) { setMessage(failure.message); return }
    update({ profile: { ...state.profile, firstName: firstName.trim(), lastName: lastName.trim(), preferredFirstName: preferredFirstName.trim() || firstName.trim(), localArea: area }, preferences: { ...state.preferences, area } })
    setFirstName(firstName.trim()); setLastName(lastName.trim()); setPreferredFirstName(preferredFirstName.trim() || firstName.trim())
    setLocalArea(area)
    setMessage('Your settings have been saved in this demo session.')
  }
  if (!hasAccount) return <Page eyebrow="YOUR ACCOUNT" title="User settings" intro="Sign in to view your account settings."><Button to="#/signin">Sign in</Button></Page>
  return <Page eyebrow="YOUR ACCOUNT" title="User settings" intro="Manage your account details and the name people see at Table 8.">
    <form className="card narrow-card settings-form" onSubmit={save}>
      <h2>Personal information</h2>
      <Field label="First name"><input name="firstName" autoComplete="given-name" required maxLength={80} value={firstName} onChange={event => { setFirstName(event.target.value); setMessage('') }} /></Field>
      <Field label="Last name"><input name="lastName" autoComplete="family-name" required maxLength={80} value={lastName} onChange={event => { setLastName(event.target.value); setMessage('') }} /></Field>
      <Field label="Preferred first name (optional)" hint="Shown beside your user icon. Leave blank to use your first name."><input name="preferredFirstName" autoComplete="nickname" maxLength={80} value={preferredFirstName} onChange={event => { setPreferredFirstName(event.target.value); setMessage('') }} /></Field>
      <LocationInput label="Local area" required value={localArea} onChange={value => { setLocalArea(value); setMessage('') }} />
      <Field label="University email" hint="Your sign-in email. Email changes are not connected in this demo."><input type="email" value={pendingEmail} readOnly placeholder="Not available in this demo session" /></Field>
      <Notice>These account details are saved in this tab's demo session. A backend profile service is not connected. Passwords and identity documents are never displayed here.</Notice>
      <button className="button" type="submit">Save changes</button>
      {message && <p role="status">{message}</p>}
      <Button to="#/discover" secondary>Back to dinners</Button>
    </form>
  </Page>
}
