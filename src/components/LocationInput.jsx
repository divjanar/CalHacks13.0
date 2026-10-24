import {
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'

import { searchAreas } from '../services/areaSearch'

export default function LocationInput({
  label,
  value = '',
  onChange,
  onCommit,
  name = 'localArea',
  type = 'text',
  required = false,
}) {
  const id = useId()
  const inputValue = String(value || '')

  const activeChoice = useRef(null)
  const lastCommitted = useRef(null)

  const [completion, setCompletion] = useState('')
  const [focused, setFocused] = useState(false)
  const [edited, setEdited] = useState(false)
  const [selected, setSelected] = useState(0)

  const [result, setResult] = useState({
    query: '',
    items: [],
    error: '',
  })

  const eligible =
    focused &&
    edited &&
    inputValue.trim().length >= 2

  const options =
    eligible && result.query === inputValue
      ? result.items
      : []

  const loading =
    eligible && result.query !== inputValue

  useEffect(() => {
    return () => {
      activeChoice.current?.abort('cancelled')
      activeChoice.current = null
    }
  }, [])

  useEffect(() => {
    if (!eligible) return

    const controller = new AbortController()
    let timeout
    let disposed = false

    const debounce = setTimeout(async () => {
      timeout = setTimeout(
        () => controller.abort('timeout'),
        10000
      )

      try {
        const locations = await searchAreas(
          inputValue.trim(),
          controller.signal
        )

        if (
          disposed ||
          controller.signal.aborted
        ) {
          return
        }

        setResult({
          query: inputValue,
          items: locations,
          error: '',
        })
      } catch {
        if (disposed) return

        setResult({
          query: inputValue,
          items: [],
          error: controller.signal.aborted
            ? 'Suggestions timed out. Press Enter to retry.'
            : 'Location suggestions could not load. Press Enter to retry your area search.',
        })
      } finally {
        clearTimeout(timeout)
      }
    }, 350)

    return () => {
      disposed = true
      clearTimeout(debounce)
      clearTimeout(timeout)
      controller.abort('cancelled')
    }
  }, [inputValue, eligible])

  async function complete(text, option) {
    const query = text.trim()

    // Do not repeat an already completed selection.
    if (
      query &&
      lastCommitted.current === query
    ) {
      setFocused(false)
      setEdited(false)
      return
    }

    activeChoice.current?.abort('cancelled')

    const controller = new AbortController()
    activeChoice.current = controller

    setEdited(false)
    setFocused(false)
    setSelected(0)
    setCompletion('')

    setResult({
      query: '',
      items: [],
      error: '',
    })

    if (!query) {
      lastCommitted.current = null
      activeChoice.current = null
      onCommit?.('')
      return
    }

    setCompletion('Finding your area…')

    const timeout = setTimeout(
      () => controller.abort('timeout'),
      10000
    )

    try {
      const location =
        option ||
        (
          await searchAreas(
            query,
            controller.signal
          )
        )[0]

      if (
        controller.signal.aborted ||
        activeChoice.current !== controller
      ) {
        return
      }

      if (!location) {
        setCompletion(
          'Area not found. Add a US state or ZIP code and try again.'
        )
        return
      }

      lastCommitted.current = location.label

      onChange(location.label)
      onCommit?.(location.label)

      setCompletion('')
    } catch (error) {
      if (
        activeChoice.current !== controller ||
        controller.signal.reason === 'cancelled'
      ) {
        return
      }

      setCompletion(
        controller.signal.aborted
          ? 'Area lookup timed out. Press Enter to retry.'
          : error.message ||
            'Area search could not load. Please try again.'
      )
    } finally {
      clearTimeout(timeout)

      if (activeChoice.current === controller) {
        activeChoice.current = null
      }
    }
  }

  function choose(option) {
    complete(option.label, option)
  }

  function keyboard(event) {
    if (event.nativeEvent.isComposing) return

    if (event.key === 'Escape') {
      setFocused(false)
      event.preventDefault()
      event.stopPropagation()
      return
    }

    if (
      (
        event.key === 'ArrowDown' ||
        event.key === 'ArrowUp'
      ) &&
      options.length
    ) {
      event.preventDefault()

      setSelected((index) => {
        const direction =
          event.key === 'ArrowDown' ? 1 : -1

        return (
          index +
          direction +
          options.length
        ) % options.length
      })

      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()

      if (options.length) {
        const index = Math.min(
          selected,
          options.length - 1
        )

        choose(options[index])
      } else {
        complete(inputValue)
      }
    }
  }

  const suggestionMessage =
    eligible && result.query === inputValue
      ? result.error ||
        (
          options.length
            ? ''
            : 'No matching areas found.'
        )
      : ''

  return (
    <div className="location-combobox">
      <label className="field" htmlFor={id}>
        <span>{label}</span>

        <input
          id={id}
          type={type}
          name={name}
          role="combobox"
          autoComplete="off"
          required={required}
          aria-describedby={`${id}-completion`}
          aria-autocomplete="list"
          aria-expanded={options.length > 0}
          aria-controls={
            options.length
              ? `${id}-options`
              : undefined
          }
          aria-activedescendant={
            options.length
              ? `${id}-option-${
                  Math.min(
                    selected,
                    options.length - 1
                  )
                }`
              : undefined
          }
          value={inputValue}
          placeholder="City, neighborhood or ZIP code"
          maxLength={180}
          onFocus={() => setFocused(true)}
          onChange={(event) => {
            activeChoice.current?.abort('cancelled')
            activeChoice.current = null
            lastCommitted.current = null

            setCompletion('')
            setFocused(true)
            setEdited(true)
            setSelected(0)

            onChange(event.target.value)
          }}
          onBlur={() => {
            setFocused(false)

            // Avoid starting a second lookup when Enter
            // or a suggestion already started one.
            if (!activeChoice.current && edited) {
              complete(inputValue)
            }
          }}
          onKeyDown={keyboard}
        />
      </label>

      <small
        id={`${id}-completion`}
        role="status"
      >
        {completion ||
          (
            loading
              ? 'Finding areas…'
              : suggestionMessage
          )}
      </small>

      {options.length > 0 && (
        <div className="location-suggestions">
          <ul
            role="listbox"
            id={`${id}-options`}
            aria-label="Suggested US areas"
          >
            {options.map((option, index) => (
              <li
                role="option"
                id={`${id}-option-${index}`}
                key={
                  `${option.latitude}:` +
                  `${option.longitude}:${index}`
                }
                aria-selected={selected === index}
                onPointerDown={(event) => {
                  event.preventDefault()
                  choose(option)
                }}
              >
                {option.label}
              </li>
            ))}
          </ul>

          <small>
            Location data ©{' '}
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              OpenStreetMap contributors
            </a>
            {' · '}Search by Photon
          </small>
        </div>
      )}
    </div>
  )
}