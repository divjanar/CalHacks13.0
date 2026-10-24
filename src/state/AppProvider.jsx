import { useState } from 'react'
import { AppContext } from './context'

const initial = { profile: null, dinnerId: 'midweek', signedIn: false, bookingIntent: false, preferences: { diet: 'Vegetarian', allergies: ['Peanuts'], allergiesAnswered: true, notes: '', budget: '40', area: 'Santa Cruz' }, verified: false, consent: false, requested: false, restaurantConfirmed: false }
function restore() {
  try {
    const saved = JSON.parse(sessionStorage.getItem('table8-demo'))
    if (!saved) return initial
    const preferences = { ...initial.preferences, ...saved.preferences }
    if (preferences.diet === 'Other religious dietary needs') preferences.diet = 'Other'
    // The old Hindu choice did not specify vegetarian status. Require an explicit choice.
    if (preferences.diet === 'Hindu') preferences.diet = ''
    return { ...initial, ...saved, preferences }
  } catch { return initial }
}
export default function AppProvider({ children }) {
  const [state, setState] = useState(restore)
  // Carry the entered email to verification in memory, never session storage.
  const [pendingEmail, setPendingEmail] = useState('')
  const update = (patch) => setState(previous => {
    const next = { ...previous, ...patch }
    try { sessionStorage.setItem('table8-demo', JSON.stringify(next)) } catch { /* Continue in memory if storage is unavailable. */ }
    return next
  })
  return <AppContext.Provider value={{ state, update, pendingEmail, setPendingEmail }}>{children}</AppContext.Provider>
}
