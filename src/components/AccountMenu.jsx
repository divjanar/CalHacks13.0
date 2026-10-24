import { useEffect, useRef, useState } from 'react'
import { useClerk } from '@clerk/react'
import { useApp } from '../state/context'

export default function AccountMenu() {
  const { state, setPendingEmail } = useApp()
  const clerk = useClerk()
  const menu = useRef(null)

  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState('')

  const name =
    state.profile?.preferredFirstName ||
    state.profile?.firstName ||
    'My account'

  useEffect(() => {
    function close(event) {
      const outside =
        event.type === 'pointerdown' &&
        !menu.current?.contains(event.target)

      if (
        event.type === 'hashchange' ||
        outside ||
        event.key === 'Escape'
      ) {
        if (menu.current?.open) {
          menu.current.open = false

          if (event.key === 'Escape') {
            menu.current.querySelector('summary')?.focus()
          }
        }
      }
    }

    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('hashchange', close)

    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('hashchange', close)
    }
  }, [])

  async function handleSignOut() {
    if (signingOut) return

    setSigningOut(true)
    setError('')

    try {
      await clerk.signOut()
      setPendingEmail('')
      window.location.hash = '/'
    } catch {
      setError('Unable to sign out. Please try again.')
      setSigningOut(false)
    }
  }

  return (
    <details className="account-menu" ref={menu}>
      <summary
        className="account-badge"
        aria-label={`Account options for ${name}`}
        title={name}
      >
        <img
          className="account-user-icon"
          src="/user-3-fill.svg"
          width="20"
          height="20"
          alt=""
          aria-hidden="true"
        />
        <span>{name}</span>
      </summary>

      <div className="account-dropdown">
        <a href="#/settings">User settings</a>
        <a href="#/user-preferences">User preferences</a>

        <button
          type="button"
          disabled={signingOut}
          onClick={handleSignOut}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </button>

        {error && <p role="alert">{error}</p>}
      </div>
    </details>
  )
}