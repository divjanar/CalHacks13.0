import { useEffect, useRef, useState } from 'react'
import { useClerk, useUser } from '@clerk/react'
import Page from '../components/Page'
import Notice from '../components/Notice'
import { useApp } from '../state/context'

const onboardingRoutes = {
  verify: '/verify',
  profile: '/settings',
  preferences: '/preferences',
  consent: '/consent',
  done: '/discover',
}

export default function SignIn({ initialMode = 'signin' }) {
  const clerk = useClerk()
  const { isLoaded, isSignedIn } = useUser()
  const { state } = useApp()

  const [recovering, setRecovering] = useState(false)
  const [message, setMessage] = useState('')
  const recoveryAttempt = useRef(null)

  const creating = initialMode === 'create'

  // Restore an existing session instead of starting another sign-in.
  useEffect(() => {
    if (!isLoaded || isSignedIn) return

    const session = clerk.client?.sessions?.find(
      item => item.status === 'active'
    )

    if (!session || recoveryAttempt.current === session.id) {
      return
    }

    recoveryAttempt.current = session.id
    setRecovering(true)

    clerk.setActive({ session: session.id })
      .catch(() => {
        setMessage(
          'Your saved session could not be opened. Please try again.'
        )
      })
      .finally(() => {
        setRecovering(false)
      })
  }, [clerk, isLoaded, isSignedIn])

  // The backend determines which setup step is unfinished.
  useEffect(() => {
    if (
      !isLoaded ||
      !isSignedIn ||
      state.authLoading ||
      !state.signedIn ||
      state.accountLoading ||
      !state.account
    ) {
      return
    }

    const destination =
      state.account.ageCheckPassed !== true
        ? '/verify'
        : state.onboardingComplete
          ? '/discover'
          : onboardingRoutes[state.onboardingNext] || '/settings'

    window.location.replace(`#${destination}`)
  }, [
    isLoaded,
    isSignedIn,
    state.authLoading,
    state.signedIn,
    state.accountLoading,
    state.account,
    state.onboardingComplete,
    state.onboardingNext,
  ])

  async function openAuthentication() {
    setMessage('')

    try {
      const session = clerk.client?.sessions?.find(
        item => item.status === 'active'
      )

      if (session) {
        setRecovering(true)
        await clerk.setActive({ session: session.id })
        return
      }

      if (creating) {
        clerk.openSignUp()
      } else {
        clerk.openSignIn()
      }
    } catch {
      setMessage(
        'Unable to open your account. Please try again.'
      )
    } finally {
      setRecovering(false)
    }
  }

  const connecting =
    !isLoaded ||
    recovering ||
    state.authLoading ||
    state.accountLoading ||
    Boolean(isSignedIn)

  if (connecting) {
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

  return (
    <Page
      eyebrow="WELCOME TO TABLE 8"
      title={
        creating
          ? 'Create your account.'
          : 'Your seat starts here.'
      }
      intro={
        creating
          ? 'Verify your university email and complete the prototype age check, then tell us about yourself.'
          : 'Sign in to continue to your Table 8 account.'
      }
    >
      <section className="card narrow-card">
        <h2>
          {creating ? 'Join Table 8' : 'Welcome back'}
        </h2>

        <p>
          Use your university-issued email ending in .edu.
        </p>

        <button
          className="button verification-action"
          type="button"
          onClick={openAuthentication}
        >
          {creating ? 'Create account →' : 'Sign in →'}
        </button>

        {message && (
          <p className="status-message" role="alert">
            {message}
          </p>
        )}

        <p>
          {creating ? (
            <a href="#/signin">
              Already have an account? Sign in
            </a>
          ) : (
            <a href="#/signup">
              New to Table 8? Create an account
            </a>
          )}
        </p>

        {!creating && (
          <p className="muted">
            Password recovery is available inside the sign-in window.
          </p>
        )}

        <Notice>
          Clerk handles authentication and email verification.
          Table 8 setup begins with a prototype DOB check,
          followed by account information, dining preferences,
          and community agreements.
        </Notice>
      </section>
    </Page>
  )
}