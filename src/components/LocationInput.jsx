import { useEffect, useId, useRef, useState } from 'react'
import { resolveLocalArea, suggestAreas } from '../services/areaSuggestions'

export default function LocationInput({ label, value, onChange, onCommit, name = 'localArea', type = 'text', required = false }) {
  const id = useId()
  const activeChoice = useRef(null)
  const [completion, setCompletion] = useState('')
  useEffect(() => () => activeChoice.current?.abort(), [])
  const [focused, setFocused] = useState(false)
  const [edited, setEdited] = useState(false)
  const [selected, setSelected] = useState(0)
  const [result, setResult] = useState({ query: '', items: [], error: '' })
  const eligible = focused && edited && value.trim().length >= 2
  const options = eligible && result.query === value ? result.items : []
  const loading = eligible && result.query !== value
  useEffect(() => {
    if (!eligible) return
    const controller = new AbortController()
    let timeout
    let disposed = false
    const debounce = setTimeout(() => {
      timeout = setTimeout(() => controller.abort(), 8000)
      suggestAreas(value.trim(), controller.signal).then(items => {
        if (!controller.signal.aborted) setResult({ query: value, items, error: '' })
      }).catch(() => {
        if (!disposed) setResult({ query: value, items: [], error: 'Suggestions could not load. You can still type your area.' })
      }).finally(() => clearTimeout(timeout))
    }, 350)
    return () => { disposed = true; clearTimeout(debounce); clearTimeout(timeout); controller.abort() }
  }, [value, eligible])
  async function complete(text, option) {
    activeChoice.current?.abort()
    const controller = new AbortController()
    activeChoice.current = controller
    setEdited(false); setFocused(false); setSelected(0)
    if (!text.trim()) { onCommit?.(''); return }
    setCompletion('Completing area...')
    const timeout = setTimeout(() => controller.abort('timeout'), 10000)
    try {
      const label = await resolveLocalArea(text, controller.signal, option)
      if (controller.signal.aborted || activeChoice.current !== controller) return
      onChange(label); onCommit?.(label); setCompletion('')
    } catch (failure) {
      if (activeChoice.current === controller && controller.signal.reason !== 'cancelled') setCompletion(controller.signal.aborted ? 'Area lookup timed out. Please try again.' : failure.message)
    } finally { clearTimeout(timeout) }
  }
  function choose(option) { complete(option.label, option) }
  function keyboard(event) {
    if (event.key === 'Escape') { setFocused(false); event.preventDefault(); event.stopPropagation() }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
      event.preventDefault()
      setSelected(index => (index + (event.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length)
    }
    if (event.key === 'Enter') {
      if (options.length) { event.preventDefault(); choose(options[Math.min(selected, options.length - 1)]) }
      else { event.preventDefault(); complete(value) }
    }
  }
  return <div className="location-combobox">
    <label className="field" htmlFor={id}><span>{label}</span><input id={id} type={type} name={name} role="combobox" autoComplete="off" required={required} aria-describedby={`${id}-completion`} aria-autocomplete="list" aria-expanded={options.length > 0} aria-controls={`${id}-options`} aria-activedescendant={options.length ? `${id}-option-${Math.min(selected, options.length - 1)}` : undefined} value={value} placeholder="City, neighborhood or ZIP code" maxLength={180} onFocus={() => setFocused(true)} onChange={event => { activeChoice.current?.abort('cancelled'); setCompletion(''); setFocused(true); setEdited(true); setSelected(0); onChange(event.target.value) }} onBlur={() => complete(value, options[0])} onKeyDown={keyboard} /></label>
    {completion && <small id={`${id}-completion`} role="status">{completion}</small>}
    {options.length > 0 && <div className="location-suggestions"><ul role="listbox" id={`${id}-options`} aria-label="Suggested US areas">{options.map((option, index) => <li role="option" id={`${id}-option-${index}`} key={option.id} aria-selected={selected === index} onPointerDown={event => { event.preventDefault(); choose(option) }}>{option.label}</li>)}</ul><small><img src="https://maps.gstatic.com/mapfiles/api-3/images/powered-by-google-on-white3.png" alt="Powered by Google" width="120" height="14" /></small></div>}
    {!options.length && <span className="sr-only" role="status">{loading ? 'Finding areas' : eligible && result.query === value ? result.error || 'No matching areas found' : ''}</span>}
  </div>
}
