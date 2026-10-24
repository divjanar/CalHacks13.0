import { useEffect, useRef } from 'react'
import { useApp } from '../state/context'

export default function AccountMenu() {
  const { state, update, setPendingEmail } = useApp()
  const menu = useRef(null)
  const name = state.profile?.preferredFirstName || state.profile?.firstName || 'My account'
  useEffect(() => {
    const close = event => {
      if (event.type === 'hashchange' || (event.type === 'pointerdown' && !menu.current?.contains(event.target)) || event.key === 'Escape') {
        if (menu.current?.open) {
          menu.current.open = false
          if (event.key === 'Escape') menu.current.querySelector('summary')?.focus()
        }
      }
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('hashchange', close)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', close); window.removeEventListener('hashchange', close) }
  }, [])
  function signOut() {
    update({ signedIn: false, bookingIntent: false, verificationNext: 'consent' })
    setPendingEmail('')
    menu.current.open = false
    window.location.hash = '/'
  }
  return <details className="account-menu" ref={menu}>
    <summary className="account-badge" aria-label={`Account options for ${name}`} title={name}><img className="account-user-icon" src="/user-3-fill.svg" width="20" height="20" alt="" aria-hidden="true" /><span>{name}</span></summary>
    <div className="account-dropdown"><a href="#/settings">User settings</a><a href="#/user-preferences">User preferences</a><button type="button" onClick={signOut}>Sign out</button></div>
  </details>
}
