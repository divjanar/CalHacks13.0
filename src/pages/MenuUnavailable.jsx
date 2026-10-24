import Page from '../components/Page'
import Button from '../components/Button'
import Notice from '../components/Notice'
import AskRestaurant from '../components/AskRestaurant'

export default function MenuUnavailable() {
  return <Page className="unavailable-page" eyebrow="MENU REVIEW NEEDED" title="We need a clearer menu." intro="We couldn’t reliably read this restaurant’s full menu. No food match is confirmed.">
    <section className="card analysis-card">
      <h2>Menu status · Incomplete or unreadable</h2>
      <p>Some ingredients, allergen details, or prices could not be extracted. The AI will not fill in missing facts or label a dish allergy-safe.</p>
      <Notice>Your booking stays pending. Ask the restaurant for a clear, current menu and preparation details. If any diner cannot be accommodated, select another restaurant or table.</Notice>
      <Button to="#/reading">Try menu analysis again →</Button>
      <AskRestaurant>Ask the restaurant</AskRestaurant>
      <Button to="#/discover" secondary>Find another dinner</Button>
      <small>Interactive design demo · Use the buttons to move through simulated AI states. No AI provider or menu service is connected.</small>
    </section>
  </Page>
}
