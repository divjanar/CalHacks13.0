import TypewriterSpeech from '../components/TypewriterSpeech'
import desktopTable from '../assets/dinner-table-desktop.svg'
import mobileTable from '../assets/dinner-table-mobile.svg'
import Button from '../components/Button'
import Footer from '../components/Footer'
import Waiter from '../components/Waiter'
export default function Home() {
  return <main className="home" id="main-content" tabIndex={-1}>
    <section className="hero" aria-labelledby="home-title">
      <div className="hero-copy">
        <p className="eyebrow mobile-only">MAKE ROOM FOR SOMETHING REAL</p>
        <h1 id="home-title">Eight strangers.<br />One table.<br /><span>Something real.</span></h1>
        <p className="hero-description">Meet seven new people near you over dinner.<br className="desktop-break" /> Good food, real conversations, and a seat for you.</p>
        <Button to="#/signin">Find my table →</Button>
      </div>
      <picture className="hero-table"><source media="(max-width: 700px)" srcSet={mobileTable} /><img src={desktopTable} alt="Eight diners sharing dinner around one table" /></picture>
      <div className="host-welcome"><TypewriterSpeech className="" text={"Welcome! I\u2019m your Table 8 host.\nLet\u2019s find your table."} /><Waiter /></div>
    </section>
    <section className="how-it-works" id="how-it-works" aria-labelledby="how-title">
      <h2 id="how-title">Good company starts here<span className="mobile-only">.</span></h2>
      <div className="steps">
        <div><h3><span className="mobile-only">01 · </span>Pick your evening</h3><p>Choose your area, date, and dinner budget<span className="mobile-only">.</span></p></div>
        <div><h3><span className="mobile-only">02 · </span>Meet your table</h3><p><span className="desktop-only">We randomly group you with 7 local diners</span><span className="mobile-only">We randomly group you with seven local diners.</span></p></div>
        <div><h3><span className="mobile-only">03 · </span>Share a meal</h3><p><span className="desktop-only">Arrive at the restaurant and start with hello!</span><span className="mobile-only">Arrive at the restaurant and start with hello.</span></p></div>
      </div>
      <div className="mobile-only"><Button to="#/safety" secondary>How we look out for you</Button><Footer /></div>
    </section>
  </main>
}
