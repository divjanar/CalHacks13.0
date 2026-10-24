import { useState } from 'react'
import { deduplicateDishes } from '../data/menuDishes'
import { allergenLabel } from '../data/menu'
import Page from '../components/Page'
import Button from '../components/Button'
import Notice from '../components/Notice'
import { useApp } from '../state/context'
import { selectedDinner } from '../data/dinners'
import { useRestaurantMenu } from '../data/useRestaurantMenu'

function category(dish) {
  if (dish.matching.recommended) return 0

  if (
    dish.matching.assessed &&
    !dish.matching.hasConflict
  ) {
    return 1
  }

  return 2
}

function rank(dishes) {
  return deduplicateDishes(dishes).sort((a, b) =>
    category(a) - category(b) ||
    b.matching.suitabilityScore -
      a.matching.suitabilityScore,
  )
}

export default function Food() {
  const { state } = useApp()
  const dinner = selectedDinner(state)
  const preferences = state.preferences || {}

  const profileKey = JSON.stringify([
    dinner.venueId,
    preferences,
  ])

  const [topProfile, setTopProfile] = useState(null)
  const showTop = topProfile === profileKey
  const full = useRestaurantMenu(dinner, preferences, 'full')
  const allDishes = deduplicateDishes(full.menu?.dishes || [])
  const topDishes = rank(allDishes)
    .filter(dish => dish.matching.assessed && dish.matching.recommended && !dish.matching.hasConflict)
  const visible = showTop ? topDishes : allDishes
  const error = full.error

  return (
    <Page
      className="food-page"
      title="A menu that works for you."
      intro={`${dinner.restaurant} | Matched to your dining needs.`}
    >
      <Notice>
        Your saved needs:{' '}
        {preferences.diet || 'No diet selected'}
        {' | '}
        Allergies:{' '}
        {(preferences.allergies || []).map(allergenLabel).join(', ') ||
          'None selected'}

        {preferences.religiousDetails &&
          ` | ${preferences.religiousDetails}`}

        {preferences.notes &&
          ` | ${preferences.notes}`}
      </Notice>

      <Button to="#/user-preferences" secondary>
        Edit my dining needs
      </Button>

      {!full.menu && full.loading && (
        <p role="status">
          Reading the official restaurant menu...
        </p>
      )}

      {error && (
        <Notice>
          <span role="alert">{error}</span>
          {' '}
          <button
            type="button"
            className="button secondary"
            onClick={full.retry}
          >
            Try again
          </button>
        </Notice>
      )}

      {full.menu?.sourceUrl && <p><a href={full.menu.sourceUrl} target="_blank" rel="noopener noreferrer">View official menu</a></p>}
      <div className="menu-view-actions" role="group" aria-label="Menu view">
        <button type="button" className={`button${showTop ? ' secondary' : ''}`} aria-pressed={!showTop} onClick={() => setTopProfile(null)}>Full menu</button>
        <button type="button" className={`button${showTop ? '' : ' secondary'}`} aria-pressed={showTop} onClick={() => setTopProfile(profileKey)}>Top options</button>
      </div>
      {full.menu && (
        <>
          {full.reviewing && <p role="status">Checking these dishes against your saved diet and allergies...</p>}
          {full.reviewError && <Notice><span role="alert">{full.reviewError}</span><button type="button" className="button secondary" onClick={full.retryReview}>Retry dietary review</button></Notice>}
          <h2>{showTop ? `Top options (${topDishes.length})` : `Full menu (${allDishes.length})`}</h2>
          {showTop && topDishes.length === 0 && <p className="muted">{full.reviewing || full.loading
            ? 'Options will appear as Gemini finishes checking your saved needs.'
            : 'No assessed dishes currently have no identified conflicts with your saved needs.'}</p>}
          {full.loading && <p role="status">Loading the remaining menu sections. Extracted dishes appear below.</p>}
          <div className="menu-grid">
            {visible.map(dish => {
              const matching = dish.matching

              const aiDietReasons = matching.dietConflicts
                .filter(item => item.group === preferences.diet)
                .flatMap(item => Array.isArray(item.evidence) ? item.evidence : [item.evidence])
              const localDietReasons = matching.dietConflicts
                .filter(item => item.group !== preferences.diet && !aiDietReasons.some(reason => reason.toLowerCase().includes(item.group.toLowerCase())))
                .flatMap(item => Array.isArray(item.evidence) ? item.evidence : [item.evidence])
              const dietReasons = [...new Set([...aiDietReasons, ...localDietReasons])]
              const conflicts = [
                ...matching.allergyConflicts,
                ...(dietReasons.length ? [{ group: preferences.diet || 'Dietary restriction', evidence: dietReasons }] : []),
              ]

              return (
                <article
                  className="card menu-option"
                  key={dish.id}
                >
                  <h2>
                    {dish.name}
                    {dish.price && ` | ${dish.price}`}
                  </h2>
                  <p><strong>Ingredients: </strong>{dish.listedIngredients?.join(', ') || 'Not listed on the menu.'}</p>

                  <p
                    className={
                      matching.hasConflict
                        ? 'error'
                        : ''
                    }
                  >
                    <strong>
                      {!matching.assessed
                        ? matching.hasConflict ? 'Warning identified; Gemini review pending' : 'Gemini review pending'
                        : matching.hasConflict
                          ? 'Conflict identified'
                          : matching.recommended
                            ? 'No conflict identified'
                            : 'Needs confirmation'}
                    </strong>
                  </p>

                  {conflicts.map((item, index) => (
                    <p className="error" key={index}>
                      <strong>
                        {allergenLabel(item.allergen || item.group)}:
                      </strong>
                      {' '}
                      {Array.isArray(item.evidence)
                        ? item.evidence.join('; ')
                        : item.evidence}
                    </p>
                  ))}

                  {!matching.recommended &&
                    conflicts.length === 0 && (
                      <p>
                        {matching.recommendationReason}
                      </p>
                    )}


                </article>
              )
            })}
          </div>

          {!showTop && <p className="muted">The full menu includes conflicts and uncertain dishes.</p>}
          {full.menu.validationNeedsReview && <p className="muted">Some source information is incomplete; results cover the dishes read.</p>}

          <Notice>
            AI checks can miss ingredients. Confirm
            ingredients, preparation, sourcing and cross-contact
            with the restaurant. These options are not allergy-safe guarantees
            or religious certifications.
          </Notice>
        </>
      )}

      <Button to="#/dinner" secondary>
        Back to reservation options
      </Button>
    </Page>
  )
}
