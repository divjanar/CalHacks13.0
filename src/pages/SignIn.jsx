import { useState } from 'react'
import Page from '../components/Page'
import Field from '../components/Field'
import Notice from '../components/Notice'
import { useApp } from '../state/context'
import { isUniversityEmail, universityEmailPattern } from '../data/universityEmail'

export default function SignIn({ initialMode = 'signin' }) {
  const { state, update, setPendingEmail } = useApp()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [preferredFirstName, setPreferredFirstName] = useState('')
  const [mode, setMode] = useState(initialMode)
  const [message, setMessage] = useState('')
  function submit(event) {
    event.preventDefault()
    if (!isUniversityEmail(email)) { setMessage('Use a university email address ending in .edu.'); return }
    if (mode === 'reset') { setMessage('Demo password reset preview. No email was sent.'); return }
    if (mode === 'create' && (!firstName.trim() || !lastName.trim())) { setMessage('Enter your first and last name.'); return }
    setPendingEmail(email.trim())
    if (mode === 'create') {
      update({ profile: { firstName: firstName.trim(), lastName: lastName.trim(), preferredFirstName: preferredFirstName.trim() || firstName.trim() }, signedIn: false, verified: false, consent: false, requested: false, restaurantConfirmed: false, bookingIntent: false, verificationNext: 'preferences' })
      window.location.hash = '/verify'
    } else {
      update({ profile: state.profile, signedIn: true, bookingIntent: false, verificationNext: 'consent' })
      window.location.hash = '/discover'
    }
  }
  return <Page eyebrow="WELCOME TO TABLE 8" title={mode === 'create' ? 'Create your account.' : 'Your seat starts here.'} intro={mode === 'create' ? 'Use your university .edu email, then verify your email and government photo ID.' : 'Sign in with your university .edu email or create an account to join your first dinner.'}>
    <form className="card narrow-card" onSubmit={submit}>
      {mode === 'create' && <>
        <Field label="First name"><input name="firstName" autoComplete="given-name" required maxLength={80} value={firstName} onChange={event => setFirstName(event.target.value)} /></Field>
        <Field label="Last name"><input name="lastName" autoComplete="family-name" required maxLength={80} value={lastName} onChange={event => setLastName(event.target.value)} /></Field>
        <Field label="Preferred first name (optional)" hint="This name appears beside the user icon. Leave blank to use your first name."><input name="preferredFirstName" autoComplete="nickname" maxLength={80} value={preferredFirstName} onChange={event => setPreferredFirstName(event.target.value)} /></Field>
      </>}
      <Field label="University email (.edu)" hint="A university email address ending in .edu is required."><input type="email" required value={email} pattern={universityEmailPattern} title="Use your university email ending in .edu, for example you@university.edu." placeholder="you@university.edu" autoComplete="email" onChange={event => { setEmail(event.target.value); setMessage('') }} onBlur={() => setEmail(email.trim())} /></Field>
      {mode !== 'reset' && <Field label="Password"><input type="password" required minLength={8} placeholder="Enter your password" autoComplete={mode === 'create' ? 'new-password' : 'current-password'} /></Field>}
      <button className="button" type="submit">{mode === 'reset' ? 'Preview reset email →' : mode === 'create' ? 'Verify identity →' : 'Continue →'}</button>
      <button className="button secondary" type="button" onClick={() => { setMode(mode === 'create' ? 'signin' : 'create'); setMessage('') }}>{mode === 'create' ? 'Back to sign in' : 'Create an account'}</button>
      <button className="text-link subtle-link" type="button" onClick={() => { setMode(mode === 'reset' ? 'signin' : 'reset'); setMessage('') }}>{mode === 'reset' ? 'Back to sign in' : 'Forgot password? · Reset by email'}</button>
      {message && <p role="status">{message}</p>}
      <Notice>Design preview. Sign-in, account creation, email codes, and identity verification are simulated. Use sample credentials. No authentication or ID service is connected.</Notice>
    </form>
  </Page>
}
