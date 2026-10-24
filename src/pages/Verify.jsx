import { useEffect, useRef, useState } from 'react'
import { useAuth, useClerk, useUser } from '@clerk/react'
import Page from '../components/Page'
import Field from '../components/Field'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { useApp } from '../state/context'
import { isUniversityEmail } from '../data/universityEmail'

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function Verify() {
  const { state, update } = useApp()
  const { getToken } = useAuth()
  const { isLoaded, isSignedIn, user } = useUser()
  const clerk = useClerk()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [file, setFile] = useState(null)
  const [consent, setConsent] = useState(false)
  const [checking, setChecking] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [awaitingSavedResult, setAwaitingSavedResult] =
    useState(false)
  const [message, setMessage] = useState('')
  const [failed, setFailed] = useState(false)

  const requestRef = useRef(null)
  const requestNumber = useRef(0)
  const fileInputRef = useRef(null)
  const initializedFor = useRef(null)

  const emailAddress = user?.primaryEmailAddress
  const email = emailAddress?.emailAddress || ''

  const emailVerified =
    emailAddress?.verification?.status === 'verified' &&
    isUniversityEmail(email)

  // This backend value now requires both name and DOB checks.
  const passed = state.account?.ageCheckPassed === true

  const savedFirstName =
    state.account?.profile?.firstName || ''
  const savedLastName =
    state.account?.profile?.lastName || ''

  useEffect(() => {
    return () => {
      requestNumber.current += 1
      requestRef.current?.abort()
    }
  }, [])

  // Reset document drafts when the account or email changes.
  useEffect(() => {
    requestNumber.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    initializedFor.current = null

    setFirstName('')
    setLastName('')
    setFile(null)
    setConsent(false)
    setChecking(false)
    setAwaitingSavedResult(false)
    setMessage('')
    setFailed(false)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [user?.id, email])

  // Prefill an existing account name once account loading finishes.
  useEffect(() => {
    if (
      !user?.id ||
      !state.signedIn ||
      state.authLoading ||
      state.accountLoading
    ) {
      return
    }

    const owner = `${user.id}:${email}`

    if (initializedFor.current === owner) return

    initializedFor.current = owner
    setFirstName(savedFirstName)
    setLastName(savedLastName)
  }, [
    user?.id,
    email,
    state.signedIn,
    state.authLoading,
    state.accountLoading,
    savedFirstName,
    savedLastName,
  ])

  useEffect(() => {
    if (passed) {
      setAwaitingSavedResult(false)
    }
  }, [passed])

  function clearMessage() {
    setMessage('')
    setFailed(false)
  }

  function selectFile(event) {
    clearMessage()
    setFile(null)

    const selected = event.target.files?.[0]

    if (!selected) return

    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      setFailed(true)
      setMessage('Choose a JPEG or PNG image.')
      event.target.value = ''
      return
    }

    if (selected.size > 5 * 1024 * 1024) {
      setFailed(true)
      setMessage('Choose an image no larger than 5 MB.')
      event.target.value = ''
      return
    }

    setFile(selected)
  }

  async function refreshEmail() {
    if (!user || refreshing) return

    setRefreshing(true)
    clearMessage()

    try {
      await user.reload()
      await getToken({ skipCache: true })
    } catch {
      setFailed(true)
      setMessage('Unable to refresh your email status.')
    } finally {
      setRefreshing(false)
    }
  }

  async function checkDocument(event) {
    event.preventDefault()

    if (checking || passed || awaitingSavedResult) return

    clearMessage()

    if (!emailVerified) {
      setFailed(true)
      setMessage(
        'Verify your university .edu email before continuing.'
      )
      return
    }

    const legalFirstName = firstName.trim()
    const legalLastName = lastName.trim()

    if (
      !legalFirstName ||
      !legalLastName ||
      legalFirstName.length > 80 ||
      legalLastName.length > 80
    ) {
      setFailed(true)
      setMessage(
        'Enter your legal first and last name, each no longer than 80 characters.'
      )
      return
    }

    if (!file || !consent) {
      setFailed(true)
      setMessage(
        'Choose a fictional test image and agree to processing.'
      )
      return
    }

    requestNumber.current += 1
    const currentRequest = requestNumber.current

    const controller = new AbortController()
    requestRef.current = controller

    setChecking(true)
    setMessage('Checking the printed name and date of birth…')

    const timeout = setTimeout(
      () => controller.abort(),
      90000
    )

    try {
      const token = await getToken()

      if (!token) {
        throw new Error('Please sign in again.')
      }

      if (controller.signal.aborted) {
        throw new DOMException(
          'Request aborted',
          'AbortError'
        )
      }

      const body = new FormData()
      body.append('firstName', legalFirstName)
      body.append('lastName', legalLastName)
      body.append('image', file)

      const response = await fetch(
        `${API_URL}/api/age-check`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body,
          signal: controller.signal,
        }
      )

      let result

      try {
        result = await response.json()
      } catch {
        throw new Error(
          'The backend returned an unexpected response.'
        )
      }

      if (currentRequest !== requestNumber.current) return

      if (!response.ok) {
        throw new Error(
          result.error || 'Unable to complete the document check.'
        )
      }

      if (
        result.status === 'meets_age_requirement' &&
        result.eligible === true &&
        result.nameMatch === 'matched' &&
        result.saved === true
      ) {
        setAwaitingSavedResult(true)
        setFile(null)

        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }

        setMessage(
          'The name and DOB checks passed and were saved. ' +
          'Waiting for your account to update…'
        )
      } else if (result.status === 'under_18') {
        setFailed(true)
        setMessage(
          'The printed DOB indicates an age under 18. ' +
          'This result does not allow you to continue.'
        )
      } else if (result.status === 'name_mismatch') {
        setFailed(true)
        setMessage(
          'The printed name does not match the entered legal name. ' +
          'Check both fields against your fictional document.'
        )
      } else if (result.status === 'needs_review') {
        setFailed(true)
        setMessage(
          'The name or DOB could not be confirmed reliably. ' +
          'Check the entered name and try a clearer fictional image.'
        )
      } else {
        throw new Error(
          'The backend returned an unexpected document-check result.'
        )
      }
    } catch (error) {
      if (currentRequest !== requestNumber.current) return

      setFailed(true)
      setMessage(
        error.name === 'AbortError'
          ? 'The document check timed out. Please try again.'
          : error instanceof TypeError
            ? 'Cannot reach the backend. Check that it is running on port 3001.'
            : error.message || 'Unable to complete the check.'
      )
    } finally {
      clearTimeout(timeout)

      if (currentRequest === requestNumber.current) {
        setChecking(false)
        requestRef.current = null
      }
    }
  }

  function continueSetup() {
    if (!passed) return

    update({
      verified: true,
      verificationNext: 'preferences',
    })

    window.location.hash = '/settings'
  }

  if (
    !isLoaded ||
    state.authLoading ||
    state.accountLoading
  ) {
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

  if (!isSignedIn || !state.signedIn) {
    return (
      <Page
        eyebrow="ACCOUNT SETUP"
        title="Sign in to continue."
        intro="Your document check belongs to your Table 8 account."
      >
        <Button to="#/signin">Sign in</Button>
      </Page>
    )
  }

  const busy = checking || awaitingSavedResult

  return (
    <Page
      eyebrow="ACCOUNT SETUP · VERIFICATION FIRST"
      title="A thoughtful first hello."
      intro="Check your university email, then complete the prototype name and DOB checks."
    >
      <section className="card narrow-card">
        <h2>1 · University email</h2>

        <p>
          <strong>{email || 'No primary email available'}</strong>
        </p>

        {emailVerified ? (
          <Notice>
            University email verified through Clerk.
            Inbox access does not prove current enrollment.
          </Notice>
        ) : (
          <>
            <Notice>
              Verify a primary university email ending in .edu
              before continuing.
            </Notice>

            <button
              className="button secondary verification-action"
              type="button"
              onClick={() => clerk.openUserProfile()}
            >
              Manage account email
            </button>

            <button
              className="button secondary verification-action"
              type="button"
              disabled={refreshing}
              onClick={refreshEmail}
            >
              {refreshing
                ? 'Refreshing…'
                : 'Refresh email status'}
            </button>
          </>
        )}

        <h2>2 · Legal name and document DOB</h2>

        {passed ? (
          <Notice>
            Your prototype name match and DOB result are saved.
            Document authenticity, ownership, and expiry have
            not been verified.
          </Notice>
        ) : (
          <form
            onSubmit={checkDocument}
            aria-busy={busy}
          >
            <Notice>
              Development test: use fictional names and documents.
              The entered name and image are sent to Google Gemini.
              This compares printed text; it does not authenticate
              the document or establish who uploaded it.
            </Notice>

            <fieldset
              disabled={busy || !emailVerified}
              style={{
                border: 0,
                padding: 0,
                margin: 0,
                minWidth: 0,
              }}
            >
              <Field
                label="Legal first name"
                hint="Enter the first name exactly as printed. Do not include a separately listed middle name."
              >
                <input
                  name="firstName"
                  autoComplete="given-name"
                  required
                  maxLength={80}
                  value={firstName}
                  onChange={event => {
                    setFirstName(event.target.value)
                    clearMessage()
                  }}
                />
              </Field>

              <Field
                label="Legal last name"
                hint="Include every part of a compound surname."
              >
                <input
                  name="lastName"
                  autoComplete="family-name"
                  required
                  maxLength={80}
                  value={lastName}
                  onChange={event => {
                    setLastName(event.target.value)
                    clearMessage()
                  }}
                />
              </Field>

              <Field label="Fictional document · JPEG or PNG · Maximum 5 MB">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png"
                  required
                  onChange={selectFile}
                />
              </Field>

              {file && (
                <p className="field-value">
                  Selected: {file.name}
                </p>
              )}

              <label className="check">
                <input
                  type="checkbox"
                  required
                  checked={consent}
                  onChange={event => {
                    setConsent(event.target.checked)
                    clearMessage()
                  }}
                />
                <span>
                  I agree to Gemini processing the entered name
                  and image, and confirm they contain fictional
                  test data.
                </span>
              </label>

              <button
                className="button secondary verification-action"
                type="submit"
                disabled={!file || !consent}
              >
                {checking
                  ? 'Checking name and DOB…'
                  : awaitingSavedResult
                    ? 'Updating account…'
                    : 'Check name and age'}
              </button>
            </fieldset>
          </form>
        )}

        {message && !passed && (
          <p
            className={failed ? 'error' : 'status-message'}
            role={failed ? 'alert' : 'status'}
            aria-live="polite"
          >
            {message}
          </p>
        )}

        <button
          className="button"
          type="button"
          disabled={!passed || checking}
          onClick={continueSetup}
        >
          Continue to account information →
        </button>

        <Button to="#/report" secondary>
          Get verification help
        </Button>
      </section>
    </Page>
  )
}