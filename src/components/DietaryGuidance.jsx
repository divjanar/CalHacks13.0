import { dietaryGuidance } from '../data/dietaryGuidance'

export default function DietaryGuidance({ diet }) {
  const guidance = dietaryGuidance[diet]
  if (!guidance) return null
  return <aside className="notice dietary-guidance" aria-live="polite">
    <strong>{diet} {guidance.preset ? 'restrictions' : 'dietary practices'}</strong>
    <p>{guidance.meaning}</p>
    {guidance.preset ? <>
      <p><strong>Avoid:</strong> {guidance.preset.avoids}</p>
      <p><strong>Not excluded:</strong> {guidance.preset.allows}</p>
      <small>These are the app’s preset rules. Add any further exclusions below. Ingredients and preparation still need restaurant confirmation.</small>
    </> : <small>General guidance; your personal requirements take priority. <a className="text-link" href={guidance.url} target="_blank" rel="noreferrer">Read more · {guidance.source}</a></small>}
  </aside>
}
