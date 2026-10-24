import { useApp } from '../state/context'
import AccountMenu from './AccountMenu'

export default function Header({ home }) {
  const { state } = useApp()

  const account = state.signedIn
    ? <AccountMenu />
    : <a href="#/signin">Sign in</a>

  return (
    <header
      className={`site-header${home ? ' home-header' : ''}`}
    >
      <a
        className="logo"
        href={state.signedIn ? '#/discover' : '#/'}
        aria-label={
          state.signedIn
            ? 'Table 8 discover dinners'
            : 'Table 8 home'
        }
      >
        Table 8
      </a>

      <nav
        className="desktop-nav"
        aria-label="Main navigation"
      >
        {state.signedIn && (
          <a href="#/discover">
            Explore
          </a>
        )}

        {home ? (
          <a href="#how-it-works">How it Works</a>
        ) : state.signedIn ? (
          <a href="#/table">My tables</a>
        ) : null}

        <a href="#/safety">
          {home ? 'Trust & Safety' : 'Trust & safety'}
        </a>

        {account}
      </nav>

      <nav
        className="mobile-nav"
        aria-label="Main navigation"
      >
        {state.signedIn && (
          <>
            <a href="#/discover">Dinners</a>
            <a href="#/table">My tables</a>
          </>
        )}

        {account}
      </nav>
    </header>
  )
}
