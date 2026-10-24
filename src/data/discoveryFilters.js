const iso = date => date.toISOString().slice(0, 10)
const parse = value => new Date(`${value}T12:00:00Z`)
export function dateWindow(value) {
  if (!value) return null
  const start = parse(value.date)
  if (value.mode === 'week') start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7)
  const end = new Date(start)
  if (value.mode === 'week') end.setUTCDate(end.getUTCDate() + 6)
  return { start: iso(start), end: iso(end) }
}
