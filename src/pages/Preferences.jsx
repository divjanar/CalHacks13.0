import { useState } from 'react'
import Page from '../components/Page'
import Button from '../components/Button'
import Field from '../components/Field'
import Notice from '../components/Notice'
import DietaryGuidance from '../components/DietaryGuidance'
import { allergenLabel, allergenOptions, religiousDietOptions } from '../data/menu'
import { useApp } from '../state/context'

export default function Preferences({ accountMode = false }) {
  const { state, update } = useApp()
  const [preferences, setPreferences] = useState(state.preferences)
  const [message, setMessage] = useState('')
  const [expanded, setExpanded] = useState(false)
  const [answered, setAnswered] = useState(Boolean(state.preferences.allergiesAnswered || state.preferences.allergies.length))
  const change = (key, value) => { setMessage(''); setPreferences(previous => ({ ...previous, [key]: value })) }
  function save(event) {
    event.preventDefault()
    if (!answered) { setExpanded(true); return }
    if (accountMode) {
      update({ preferences: { ...preferences, notes: '', religiousDetails: religiousDietOptions.includes(preferences.diet) ? preferences.religiousDetails || '' : '', allergiesAnswered: true }, restaurantConfirmed: false, bookingIntent: false })
      setMessage('Your dietary preferences have been saved in this demo session.')
      return
    }
    update({ preferences: { ...preferences, notes: '', religiousDetails: religiousDietOptions.includes(preferences.diet) ? preferences.religiousDetails || '' : '', allergiesAnswered: true }, restaurantConfirmed: false, verificationNext: 'consent' })
    window.location.hash = state.verified ? '/consent' : '/verify'
  }
  if (accountMode && !state.signedIn && !(state.profile && state.verificationNext === 'preferences')) return <Page eyebrow="YOUR ACCOUNT" title="User preferences" intro="Sign in to manage your dietary preferences."><Button to="#/signin">Sign in</Button></Page>
  return <Page eyebrow={accountMode ? 'YOUR ACCOUNT' : 'STEP 1 OF 3 - DINNER PREFERENCES'} title={accountMode ? 'User preferences' : 'Your kind of evening.'} intro={accountMode ? 'Keep your dietary preferences and allergies up to date for future reservations.' : 'Help us find a table that works for your dining needs.'}>
    <form className="card narrow-card" onSubmit={save}>
      <div className="allergy-picker"><button className="field field-trigger" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}><span>Food allergies · Required</span><span className="field-value">{answered ? preferences.allergies.map(allergenLabel).join(', ') || 'None' : 'Choose allergies or select None'}</span></button>
        {expanded && <fieldset><legend>Food allergies</legend><div className="checkbox-grid"><label className="check"><input type="checkbox" checked={answered && !preferences.allergies.length} onChange={event => { setAnswered(event.target.checked); change('allergies', []) }} />None</label>{allergenOptions.map(allergen => <label key={allergen} className="check"><input type="checkbox" checked={preferences.allergies.includes(allergen)} onChange={event => { const next = event.target.checked ? [...preferences.allergies, allergen] : preferences.allergies.filter(item => item !== allergen); change('allergies', next); setAnswered(next.length > 0) }} />{allergenLabel(allergen)}</label>)}</div><small>Select None explicitly if no listed allergies apply.</small></fieldset>}
      </div>
      <Field label="Dietary restrictions · Required"><select required value={preferences.diet} onChange={event => change('diet', event.target.value)}><option value="" disabled>Select restrictions or None</option><option value="No preference">None</option><option>Vegetarian</option><option>Vegan</option><option>Pescatarian</option>{religiousDietOptions.map(diet => <option key={diet}>{diet}</option>)}</select></Field>
      <DietaryGuidance diet={preferences.diet} />
      {religiousDietOptions.includes(preferences.diet) && <Field label={preferences.diet === 'Other' ? 'Your dietary needs' : 'Additional dietary requirements (optional)'} hint={preferences.diet === 'Other' ? 'Describe the foods, ingredients or preparation methods you need to avoid.' : 'Tell us any personal requirements beyond the general guidance above.'}><textarea required={preferences.diet === 'Other'} value={preferences.religiousDetails || ''} maxLength={500} placeholder={preferences.diet === 'Other' ? 'Type your dietary needs here' : 'Add any specific requirements you follow'} onChange={event => change('religiousDetails', event.target.value)} /></Field>}
      <p className="muted">For each required question, select “None” or provide details. No answer is never treated as “None”. Update these choices before each booking.</p>
      <Notice>Demo: check all eight diners against restaurant menus. Suitable options and allergy preparation need restaurant confirmation before a group booking is confirmed. No venue receives information; free-text requests are not analyzed.</Notice>
      {!answered && <small className="error" role="status">Please select allergies or explicitly choose None before continuing.</small>}
      <button className="button" type="submit">{accountMode ? 'Save preferences' : state.verified ? 'Continue reservation →' : 'Continue to verification →'}</button>
      {message && <p role="status">{message}</p>}
      {accountMode && <Button to="#/discover" secondary>Back to dinners</Button>}
    </form>
  </Page>
}
