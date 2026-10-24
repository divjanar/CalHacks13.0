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
  const matching = dish.matching || {}

  if (
    matching.assessed &&
    matching.recommended &&
    !matching.hasConflict
  ) {
    return 0
  }

  if (matching.assessed && !matching.hasConflict) {
    return 1
  }

  return 2
}

function rank(dishes) {
  return [...deduplicateDishes(dishes)].sort((a, b) =>
    category(a) - category(b) ||
    Number(b.matching?.suitabilityScore || 0) -
      Number(a.matching?.suitabilityScore || 0)
  )
}

function evidenceList(value) {
  return (Array.isArray(value) ? value : [value])
    .filter(item => typeof item === 'string' && item.trim())
}

export default function Food() {
  const { state } = useApp()
  const dinner = selectedDinner(state)
  const preferences = state.preferences || {}

  const [view, setView] = useState('full')

  // Both views use the full extraction.
  // Only the Top options display is limited to eight.
  const full = useRestaurantMenu(
    dinner,
    preferences,
    'full'
  )

  const allDishes = deduplicateDishes(
    full.menu?.dishes || []
  )

  const topDishes = rank(allDishes)
    .filter(dish =>
      dish.matching?.assessed &&
      dish.matching?.recommended &&
      !dish.matching?.hasConflict
    )
    .slice(0, 8)

  const showTop = view === 'top'
  const visible = showTop ? topDishes : allDishes

  const sourceUrl = full.menu?.sourceUrl || dinner.menuUrl

  return (
    <Page
      className="food-page"
      title="A menu that works for you."
      intro={`${dinner.restaurant} · Reviewed against your saved dining needs.`}
    >
      <Notice>
        Your saved needs:{' '}
        {preferences.diet || 'No diet selected'}
        {' · '}
        Allergies:{' '}
        {(preferences.allergies || [])
          .map(allergenLabel)
          .join(', ') ||
          (
            preferences.allergiesAnswered
              ? 'None listed'
              : 'Not answered'
          )}

        {preferences.religiousDetails &&
          ` · ${preferences.religiousDetails}`}

        {preferences.notes &&
          ` · ${preferences.notes}`}
      </Notice>

      <Button to="#/user-preferences" secondary>
        Edit my dining needs
      </Button>

      {sourceUrl && (
        <p>
          <a
            href={sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            View official menu ↗
          </a>
        </p>
      )}

      <div
        className="menu-view-actions"
        role="group"
        aria-label="Menu view"
      >
        <button
          type="button"
          className={`button${showTop ? ' secondary' : ''}`}
          aria-pressed={!showTop}
          onClick={() => setView('full')}
        >
          Full menu
        </button>

        <button
          type="button"
          className={`button${showTop ? '' : ' secondary'}`}
          aria-pressed={showTop}
          onClick={() => setView('top')}
        >
          Top options
        </button>
      </div>

      {!full.menu && full.loading && (
        <p role="status">
          Gemini is reading the restaurant’s full menu…
        </p>
      )}

      {full.error && (
        <Notice>
          <span role="alert">{full.error}</span>
          {' '}
          <button
            type="button"
            className="button secondary"
            disabled={full.loading}
            onClick={full.retry}
          >
            Try again
          </button>
        </Notice>
      )}

      {full.menu && (
        <>
          <h2>
            {showTop
              ? `Top options (${topDishes.length})`
              : `Full menu · ${allDishes.length} dishes read`}
          </h2>

          {showTop ? (
            <p className="muted">
              Up to eight assessed options with no identified
              conflicts appear here. Restaurant confirmation
              is still required.
            </p>
          ) : (
            <p className="muted">
              Showing every extracted dish, including conflicts
              and dishes that still need confirmation.
            </p>
          )}

          {showTop && topDishes.length === 0 && (
            <p role="status">
              {full.reviewing || full.loading
                ? 'Options will appear as Gemini completes the dietary checks.'
                : 'No assessed options currently meet the Top options criteria. Review the full menu for conflicts and uncertainties.'}
            </p>
          )}

          {full.loading && (
            <p role="status">
              Reading the menu. Available dishes remain visible.
            </p>
          )}

          {full.reviewing && (
            <p role="status">
              Checking dishes against your saved dining needs…
            </p>
          )}

          <div className="menu-grid">
            {visible.map(dish => {
              const matching = dish.matching || {}

              const dietConflicts =
                matching.dietConflicts || []

              const aiDietReasons = dietConflicts
                .filter(item =>
                  item.group === preferences.diet
                )
                .flatMap(item =>
                  evidenceList(item.evidence)
                )

              const localDietReasons = dietConflicts
                .filter(item =>
                  item.group !== preferences.diet &&
                  !aiDietReasons.some(reason =>
                    reason
                      .toLowerCase()
                      .includes(
                        String(item.group || '').toLowerCase()
                      )
                  )
                )
                .flatMap(item =>
                  evidenceList(item.evidence)
                )

              const dietReasons = [...new Set([
                ...aiDietReasons,
                ...localDietReasons,
              ])]

              const conflicts = [
                ...(matching.allergyConflicts || []),
                ...(dietReasons.length
                  ? [{
                      group:
                        preferences.diet ||
                        'Dietary restriction',
                      evidence: dietReasons,
                    }]
                  : []),
              ]

              const ingredients =
                dish.listedIngredients || []

              const label = matching.hasConflict
                ? matching.assessed
                  ? 'Conflict identified'
                  : 'Warning identified'
                : !matching.assessed
                  ? 'Dietary review incomplete'
                  : matching.recommended
                    ? 'No conflict identified'
                    : 'Needs confirmation'

              return (
                <article
                  className="card menu-option"
                  key={dish.id}
                >
                  {dish.section && (
                    <p className="eyebrow">
                      {dish.section}
                    </p>
                  )}

                  <h2>
                    {dish.name}
                    {dish.price && ` · ${dish.price}`}
                  </h2>

                  {dish.description && (
                    <p>{dish.description}</p>
                  )}

                  <p>
                    <strong>Listed ingredients: </strong>

                    {ingredients.join(', ') ||
                      (
                        dish.extractionStatus === 'pending'
                          ? 'Reading ingredients…'
                          : dish.extractionStatus === 'needs_review'
                            ? 'Not confirmed; extraction is incomplete.'
                            : 'Not listed on the menu.'
                      )}
                  </p>

                  <p
                    className={
                      matching.hasConflict
                        ? 'error'
                        : matching.recommended
                          ? 'menu-no-conflict'
                          : ''
                    }
                  >
                    <strong>{label}</strong>
                  </p>

                  {matching.assessed && (
                    <p className="muted">
                      Gemini reviewed the available menu
                      evidence. Complete ingredients, sourcing,
                      and cross-contact remain unknown.
                    </p>
                  )}

                  {conflicts.map((item, index) => (
                    <p
                      className="error"
                      key={`${item.allergen || item.group}-${index}`}
                    >
                      <strong>
                        {allergenLabel(
                          item.allergen || item.group
                        )}:
                      </strong>
                      {' '}
                      {evidenceList(item.evidence).join('; ')}
                    </p>
                  ))}

                  {!matching.hasConflict && (
                    <p>
                      {matching.recommendationReason ||
                        'Confirm ingredients, preparation, sourcing, and cross-contact with the restaurant before choosing.'}
                    </p>
                  )}
                </article>
              )
            })}
          </div>

          {full.reviewError && (
            <Notice>
              Some dietary checks could not finish.
              {' '}
              <button
                type="button"
                className="button secondary"
                disabled={full.reviewing}
                onClick={full.retryReview}
              >
                Continue dietary checks
              </button>
            </Notice>
          )}

          {full.menu.coverageVerified !== true && (
            <Notice>
              Full-menu coverage has not been independently
              verified. This page shows all dishes returned
              by the reader; additional source items may
              still be missing.
            </Notice>
          )}

          <Notice>
            AI checks can miss ingredients. Confirm ingredients,
            preparation, sourcing, and cross-contact with the
            restaurant. These results are not allergy-safety
            guarantees or religious certifications.
          </Notice>
        </>
      )}

      <button
        className="button secondary"
        type="button"
        disabled={full.loading}
        onClick={full.retry}
      >
        {full.loading
          ? 'Reading full menu…'
          : 'Read full menu again'}
      </button>

      <Button to="#/dinner" secondary>
        Back to reservation options
      </Button>
    </Page>
  )
}