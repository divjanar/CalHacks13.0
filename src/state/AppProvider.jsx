import { useCallback, useState } from 'react'
import { useUser } from '@clerk/react'
import { useConvexAuth, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import { AppContext } from './context'

function initialState() {
  return {
    dinnerId: 'midweek',
    bookingIntent: false,
    preferences: {
      diet: '',
      allergies: [],
      allergiesAnswered: false,
      notes: '',
      religiousDetails: '',
      budget: '40',
      area: 'Santa Cruz',
    },
    verified: false,
    consent: false,
    requested: false,
    restaurantConfirmed: false,
    verificationNext: 'preferences',
  }
}

function AccountLoading() {
  return (
    <div
      className="account-loading-overlay"
      role="status"
      aria-label="Loading your account"
      aria-busy="true"
    >
      <div className="account-spinner" aria-hidden="true" />
    </div>
  )
}

export default function AppProvider({ children }) {
  const { isLoaded, user } = useUser()
  const { isLoading, isAuthenticated } = useConvexAuth()

  const authLoading = !isLoaded || isLoading
  const signedIn = Boolean(
    isLoaded && isAuthenticated && user
  )

  const owner = user?.id || 'guest'

  // Keep drafts isolated without remounting the app or Clerk popup.
  const [draftState, setDraftState] = useState(() => ({
    owner,
    value: initialState(),
  }))

  const [emailState, setEmailState] = useState({
    owner: '',
    value: '',
  })

  const draft =
    draftState.owner === owner
      ? draftState.value
      : initialState()

  const account = useQuery(
    api.accounts.getMine,
    signedIn && !authLoading ? {} : 'skip'
  )

  const update = useCallback((patch) => {
    const next = { ...patch }

    delete next.signedIn
    delete next.authLoading
    delete next.account
    delete next.accountLoading
    delete next.onboardingComplete
    delete next.onboardingNext

    setDraftState(previous => ({
      owner,
      value: {
        ...(previous.owner === owner
          ? previous.value
          : initialState()),
        ...next,
      },
    }))
  }, [owner])

  const setPendingEmail = useCallback((value) => {
    setEmailState(previous => ({
      owner,
      value:
        typeof value === 'function'
          ? value(previous.owner === owner ? previous.value : '')
          : value,
    }))
  }, [owner])

  // Never expose another account's cached profile during a transition.
  const currentAccount =
    signedIn && !authLoading ? account : null

  const savedProfile = currentAccount?.profile
  const savedPreferences = currentAccount?.preferences

  const profile = signedIn
    ? savedProfile
      ? {
          ...savedProfile,
          preferredFirstName: savedProfile.preferredFirstName || '',
        }
      : {
          firstName: user?.firstName || '',
          lastName: user?.lastName || '',
          preferredFirstName: '',
          localArea: '',
        }
    : null

  const preferences = {
    ...draft.preferences,
    ...(savedPreferences
      ? {
          diet: savedPreferences.diet,
          allergies: savedPreferences.allergies,
          allergiesAnswered:
            savedPreferences.allergiesAnswered,
          religiousDetails:
            savedPreferences.religiousDetails,
        }
      : {}),
    ...(savedProfile?.localArea
      ? { area: savedProfile.localArea }
      : {}),
  }

  const accountLoading =
    authLoading || (signedIn && account === undefined)

  const state = {
    ...draft,
    profile,
    preferences,
    signedIn,
    authLoading,
    accountLoading,
    account: currentAccount || null,
    onboardingComplete:
      currentAccount?.questionnaireComplete === true,
    onboardingNext: currentAccount?.nextStep || 'profile',
    consent:
      currentAccount?.questionnaireComplete === true ||
      draft.consent,
  }

  const pendingEmail =
    user?.primaryEmailAddress?.emailAddress ||
    (emailState.owner === owner ? emailState.value : '')

  return (
    <AppContext.Provider
      value={{
        state,
        update,
        pendingEmail,
        setPendingEmail,
      }}
    >
      {/* Keep the app mounted while authentication changes. */}
      <div
        inert={accountLoading ? true : undefined}
        aria-hidden={accountLoading ? true : undefined}
      >
        {children}
      </div>

      {accountLoading && <AccountLoading />}
    </AppContext.Provider>
  )
}
