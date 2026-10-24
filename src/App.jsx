import { useEffect, useState } from 'react'
import AppProvider from './state/AppProvider'
import { useApp } from './state/context'
import Header from './components/Header'
import Home from './pages/Home'
import Details from './pages/Details'
import Discover from './pages/Discover'
import SignIn from './pages/SignIn'
import SignUp from './pages/SignUp'
import Preferences from './pages/Preferences'
import Verify from './pages/Verify'
import Consent from './pages/Consent'
import RequestReceived from './pages/RequestReceived'
import MyTable from './pages/MyTable'
import Safety from './pages/Safety'
import Report from './pages/Report'
import Food from './pages/Food'
import MenuUnavailable from './pages/MenuUnavailable'
import FullyConfirmed from './pages/FullyConfirmed'
import NotFound from './pages/NotFound'
import UIKit from './pages/UIKit'
import UserSettings from './pages/UserSettings'
import UserPreferences from './pages/UserPreferences'
import './App.css'

const routes = {
  home: [Home, 'Good company starts here'],
  discover: [Discover, 'Discover dinners'], dinner: [Details, 'Dinner details'],
  settings: [UserSettings, 'User settings'],
  'user-preferences': [UserPreferences, 'User preferences'],
  signup: [SignUp, 'Create account'],
  signin: [SignIn, 'Sign in'], preferences: [Preferences, 'Dining preferences'],
  verify: [Verify, 'Verify identity'], consent: [Consent, 'Community agreement'],
  confirmation: [RequestReceived, 'Request received'], 'request-received': [RequestReceived, 'Request received'],
  table: [MyTable, 'My table'], safety: [Safety, 'Trust & safety'], report: [Report, 'Report & support'],
  food: [Food, 'Food I can eat'], reading: [Food, 'Reading menu'],
  checking: [Food, 'Checking dining needs'], unavailable: [MenuUnavailable, 'Menu review needed'],
  confirmed: [FullyConfirmed, 'Sample confirmation'],
  'ui-kit': [UIKit, 'Shared components'],
}
function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0]
  return !hash || hash === 'how-it-works' || hash === 'main-content' ? 'home' : hash
}
function Router() {
  const { state } = useApp()
  const [route, setRoute] = useState(currentRoute)
  const activeRoute = route === 'discover' && !state.signedIn ? 'signin' : route
  const [Screen, title] = routes[activeRoute] || [NotFound, 'Page not found']
  useEffect(() => {
    if (route === 'discover' && !state.signedIn) window.location.replace('#/signin')
  }, [route, state.signedIn])
  useEffect(() => {
    const navigate = () => {
      if (window.location.hash === '#main-content') { document.getElementById('main-content')?.focus(); return }
      setRoute(currentRoute())
      if (window.location.hash === '#how-it-works') {
        requestAnimationFrame(() => document.getElementById('how-it-works')?.scrollIntoView())
      } else window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', navigate)
    return () => window.removeEventListener('hashchange', navigate)
  }, [])
  useEffect(() => {
    document.title = activeRoute === 'discover' || activeRoute === 'home' ? 'Table 8' : `${title} \u00b7 Table 8`
    if (window.location.hash === '#how-it-works') document.getElementById('how-it-works')?.scrollIntoView()
    else document.getElementById('main-content')?.focus({ preventScroll: true })
  }, [activeRoute, title])
  return <><a href="#main-content" className="skip-link">Skip to content</a><div className="app">{activeRoute !== 'ui-kit' && <Header home={activeRoute === 'home'} />}<Screen key={activeRoute} /></div></>
}
export default function App() { return <AppProvider><Router /></AppProvider> }
