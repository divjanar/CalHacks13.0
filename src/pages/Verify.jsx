import { useEffect, useRef, useState } from 'react'
import Page from '../components/Page'
import Field from '../components/Field'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { useApp } from '../state/context'
import {
  isUniversityEmail,
  universityEmailPattern,
} from '../data/universityEmail'

const API_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3001'

export default function Verify() {
  const { state, update, pendingEmail } = useApp()

  const [email, setEmail] = useState(pendingEmail || '')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [emailVerified, setEmailVerified] = useState(false)
  const [message, setMessage] = useState('')

  const [file, setFile] = useState(null)
  const [consent, setConsent] = useState(false)
  const [idStatus, setIdStatus] = useState('idle')
  const [idMessage, setIdMessage] = useState('')

  const requestRef = useRef(null)
  const requestNumber = useRef(0)

  // Cancel any pending upload when leaving this page.
  useEffect(() => {
    return () => {
      requestNumber.current += 1
      requestRef.current?.abort()
    }
  }, [])

  function resetIdCheck() {
    requestNumber.current += 1
    requestRef.current?.abort()
    requestRef.current = null
    setIdStatus('idle')
    setIdMessage('')
    update({ verified: false })
  }

  function send(event) {
    event.preventDefault()

    if (!isUniversityEmail(email)) {
      setMessage('Use a university email address ending in .edu.')
      return
    }

    setSent(true)
    setCode('')
    setEmailVerified(false)
    update({ verified: false })
    setMessage(
      'Demo code: 123456. No email was sent. Requesting a new code resets the previous email check.'
    )
  }

  function verifyEmail() {
    if (!sent) {
      setMessage('Enter an email and preview sending a code first.')
      return
    }

    if (code !== '123456') {
      setMessage('That demo code does not match. Use 123456.')
      return
    }

    setEmailVerified(true)
    setMessage(
      'University email check simulated. This does not prove enrollment.'
    )
  }

  function selectFile(event) {
    resetIdCheck()

    const selected = event.target.files?.[0]
    setFile(null)

    if (!selected) return

    if (!['image/jpeg', 'image/png'].includes(selected.type)) {
      setIdMessage('Choose a JPEG or PNG image.')
      event.target.value = ''
      return
    }

    if (selected.size > 5 * 1024 * 1024) {
      setIdMessage('Your image must be 5 MB or smaller.')
      event.target.value = ''
      return
    }

    setFile(selected)
    setIdMessage('Image selected. Ready to check the printed DOB.')
  }

  async function checkId() {
    if (!file || !consent) {
      setIdMessage(
        'Choose a fictional test image and agree to AI processing first.'
      )
      return
    }

    resetIdCheck()

    const currentRequest = requestNumber.current
    const controller = new AbortController()
    requestRef.current = controller

    setIdStatus('checking')
    setIdMessage('Reading the printed date of birth…')

    const formData = new FormData()
    formData.append('image', file)

    const timeout = setTimeout(() => controller.abort(), 90000)

    try {
      const response = await fetch(`${API_URL}/api/age-check`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })

      // The browser adds the multipart Content-Type automatically.
      const result = await response.json()

      if (currentRequest !== requestNumber.current) return

      if (!response.ok) {
        throw new Error(result.error || 'The age check failed.')
      }

      if (
        result.status === 'meets_age_requirement' &&
        result.eligible === true
      ) {
        setIdStatus('passed')
        setIdMessage(
          'The extracted DOB meets the 18+ requirement. Identity and document authenticity have not been verified.'
        )
      } else if (
        result.status === 'under_18' &&
        result.eligible === false
      ) {
        setIdStatus('underage')
        setIdMessage(
          'The extracted DOB indicates an age under 18. You cannot continue with this result.'
        )
      } else {
        setIdStatus('needs_review')
        setIdMessage(
          'The DOB could not be read reliably. Choose a clearer image showing a labeled, unambiguous date of birth.'
        )
      }
    } catch (error) {
      if (currentRequest !== requestNumber.current) return

      setIdStatus('error')
      setIdMessage(
        error.name === 'AbortError'
          ? 'The check timed out. Please try again.'
          : error instanceof TypeError
            ? 'Cannot reach the backend. Make sure it is running on port 3001.'
            : error.message || 'The age check failed. Please try again.'
      )
    } finally {
      clearTimeout(timeout)

      if (currentRequest === requestNumber.current) {
        requestRef.current = null
      }
    }
  }

  function continueSetup() {
    if (!emailVerified || idStatus !== 'passed' || !consent) {
      setMessage(
        'Complete the demo email check and pass the DOB age check before continuing.'
      )
      return
    }

    // Prototype navigation only; this is not server-side verification.
    update({ verified: true, signedIn: true })

    window.location.hash =
      state.verificationNext === 'preferences'
        ? '/preferences'
        : '/consent'
  }

  const checking = idStatus === 'checking'
  const canContinue =
    emailVerified && idStatus === 'passed' && consent

  return (
    <Page
      eyebrow={
        state.verificationNext === 'preferences'
          ? 'CREATE ACCOUNT · EMAIL & AGE'
          : 'STEP 2 OF 3 · EMAIL & AGE'
      }
      title="A thoughtful first hello."
      intro="Preview the university email check and check the date of birth on a fictional test document."
    >
      <section className="card narrow-card">
        <h2>1 · University email</h2>
        <p>
          Email verification is currently simulated. No email will be sent.
        </p>

        <form className="compact-form" onSubmit={send}>
          <Field label="University email (.edu) · Required">
            <input
              type="email"
              required
              pattern={universityEmailPattern}
              title="Use a university email address ending in .edu."
              value={email}
              placeholder="you@university.edu"
              onChange={event => {
                setEmail(event.target.value)
                setEmailVerified(false)
                setSent(false)
                setCode('')
                setMessage('')
                update({ verified: false })
              }}
            />
          </Field>

          <button
            className="button secondary verification-action"
            type="submit"
          >
            Preview sending verification code
          </button>
        </form>

        <Field label="Demo email verification code">
          <input
            inputMode="numeric"
            maxLength={6}
            value={code}
            placeholder="Enter 6-digit code"
            onChange={event =>
              setCode(event.target.value.replace(/\D/g, ''))
            }
          />
        </Field>

        <button
          className="button secondary verification-action"
          type="button"
          onClick={verifyEmail}
        >
          Check demo code
        </button>

        {message && (
          <p className="status-message" role="status">
            {message}
          </p>
        )}

        <h2>2 · Document DOB check</h2>

        <Notice>
          Development test: use fictional documents only. The image is
          sent through our backend to Google Gemini to extract the printed
          DOB. Our backend does not save the image to disk. This check
          does not authenticate an ID, verify its owner, or check expiry.
        </Notice>

        <Field label="Fictional test image · JPEG or PNG · Maximum 5 MB">
          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={selectFile}
          />
        </Field>

        {file && (
          <p className="field-value">
            Selected: {file.name}
          </p>
        )}

        <label className="field">
          <span>
            <input
              type="checkbox"
              checked={consent}
              onChange={event => {
                resetIdCheck()
                setConsent(event.target.checked)
              }}
            />{' '}
            I understand this image will be sent to Google Gemini for
            DOB extraction and confirm it contains fictional test data.
          </span>
        </label>

        <button
          className="button secondary verification-action"
          type="button"
          disabled={!file || !consent || checking}
          onClick={checkId}
        >
          {checking ? 'Checking DOB…' : 'Check age requirement'}
        </button>

        {idMessage && (
          <p className="status-message" role="status" aria-live="polite">
            {idMessage}
          </p>
        )}

        <button
          className="button"
          type="button"
          disabled={!canContinue || checking}
          onClick={continueSetup}
        >
          Continue preview →
        </button>

        <Button to="#/report" secondary>
          Get verification help
        </Button>

        <small>
          Prototype: email verification is simulated. The DOB check uses
          Gemini. Account access must be enforced by the backend before
          this app is used with real diners.
        </small>
      </section>
    </Page>
  )
}