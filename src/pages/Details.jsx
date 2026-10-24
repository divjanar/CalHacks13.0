import { useRestaurantMenu } from '../data/useRestaurantMenu'
import TypewriterSpeech from '../components/TypewriterSpeech'
import { useApp } from '../state/context'
import { selectedDinner } from '../data/dinners'
import detailsTable from '../assets/dinner-table-details.svg'
import Button from '../components/Button'
import Page from '../components/Page'
import discoverHost from '../assets/discover-host.png'
export default function Details() {
  const { state, update } = useApp()
  const dinner = selectedDinner(state)
  useRestaurantMenu(dinner, state.preferences || {}, 'full')
  return <Page className="dinner-details-page" title={dinner.title} intro={`${dinner.day} - ${dinner.time} - ${dinner.area}`} headingAside={<aside className="discover-host dinner-details-host"><TypewriterSpeech text={"If you\u2019d like, you can check out the menu before continuing with your reservation."} /><img src={discoverHost} alt="Your Table 8 host holding a serving tray" width="120" height="180" /></aside>}>
    <div className="details-grid">
      <section className="dinner-intro"><img className="details-art" src={detailsTable} alt="Eight diners sharing a meal" /><h2>One table. A fresh start.</h2><p>Come solo and share dinner with seven new people. Groups are formed randomly among eligible local diners whose availability and dining needs fit.</p></section>
      <section className="card"><h2>Your evening</h2><p>{dinner.day} · {dinner.time}–{dinner.endTime}</p><p>{dinner.address}</p><p>{dinner.restaurant} · {dinner.area} · Sample local restaurant</p><p>{dinner.price} per person · Pay the restaurant</p><p>Eight seats at this table</p><aside>Before confirming, we check the needs of all eight diners with this restaurant. If any diner cannot be accommodated, choose another venue or table.</aside><Button to="#/food" secondary onClick={() => update({ bookingIntent: false })}>See food I can eat</Button><Button to={state.signedIn ? '#/preferences' : '#/signin'} onClick={() => update({ bookingIntent: state.signedIn })}>Join table →</Button><small>Sample dinner · No booking or charge in this prototype.</small></section>
    </div>
  </Page>
}
