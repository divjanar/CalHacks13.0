import { useState } from 'react'
import { dateWindow } from '../data/discoveryFilters'

const iso = date => date.toISOString().slice(0, 10)
const parse = value => new Date(`${value}T12:00:00Z`)
const format = value => parse(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function DateFilter({ value, onChange }) {
  const [month, setMonth] = useState(() => value.date.slice(0, 7))
  const selected = dateWindow(value)
  const first = parse(`${month}-01`)
  const offset = (first.getUTCDay() + 6) % 7
  const days = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate()
  function move(amount) {
    const next = new Date(first)
    next.setUTCMonth(next.getUTCMonth() + amount)
    setMonth(iso(next).slice(0, 7))
  }
  return <details className="discovery-filter"><summary><small>When</small><span>{value.mode === 'day' ? format(value.date) : `${format(selected.start)} – ${format(selected.end)}`}</span></summary>
    <div className="filter-panel">
      <div className="filter-segments">{['day', 'week'].map(mode => <button type="button" key={mode} aria-pressed={value.mode === mode} onClick={() => onChange({ ...value, mode })}>{mode === 'day' ? 'Choose a day' : 'Choose a week'}</button>)}</div>
      <div className="calendar-heading"><button type="button" aria-label="Previous month" onClick={() => move(-1)}>←</button><strong>{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong><button type="button" aria-label="Next month" onClick={() => move(1)}>→</button></div>
      <div className="calendar-days">{['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, index) => <small key={index}>{day}</small>)}{Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
        const day = new Date(first); day.setUTCDate(index - offset + 1)
        const date = iso(day)
        return <button type="button" key={date} className={date.slice(0, 7) !== month ? 'outside-month' : ''} aria-label={date} aria-pressed={date >= selected.start && date <= selected.end} onClick={() => onChange({ ...value, date })}>{day.getUTCDate()}</button>
      })}</div><small>{value.mode === 'week' ? 'Select any day to choose its Monday–Sunday week.' : 'Select the day you would like to dine.'}</small>
    </div>
  </details>
}

export function BudgetFilter({ value, onChange }) {
  function change(kind, raw, slider = false) {
    const amount = raw === '' ? '' : Math.max(0, Math.min(200, Number(raw)))
    if (amount !== '' && !Number.isFinite(amount)) return
    if (slider) {
      onChange(kind === 'min' ? { min: amount, max: Math.max(amount, value.max === '' ? 200 : value.max) } : { min: Math.min(amount, value.min === '' ? 0 : value.min), max: amount })
    } else onChange({ ...value, [kind]: amount })
  }
  const invalid = value.min !== '' && value.max !== '' && value.min > value.max
  return <details className="discovery-filter"><summary><small>Budget per person</small><span>${value.min === '' ? 'Any' : value.min} - ${value.max === '' ? 'Any' : value.max}</span></summary><div className="filter-panel budget-panel">
    {['min', 'max'].map(kind => <div className="budget-control" key={kind}><label htmlFor={`budget-${kind}`}>{kind === 'min' ? 'Minimum' : 'Maximum'} - {value[kind] === '' ? 'Any' : `$${value[kind]}`}</label><input id={`budget-${kind}`} type="range" min="0" max="200" step="5" value={value[kind] === '' ? (kind === 'min' ? 0 : 200) : value[kind]} onChange={event => change(kind, event.target.value, true)} /><input aria-label={`${kind === 'min' ? 'Minimum' : 'Maximum'} budget amount`} type="number" min="0" max="200" step="any" placeholder="Any" value={value[kind]} onChange={event => change(kind, event.target.value)} /></div>)}
    {invalid && <small role="alert">Minimum must be less than or equal to maximum.</small>}
    <small>Slide in $5 steps or type your own amount. Leave a value empty for no limit.</small>
  </div></details>
}
