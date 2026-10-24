import { useState } from 'react'

export default function AskRestaurant({ dish, children = 'Ask about this dish' }) {
  const [open, setOpen] = useState(false)
  return <div className="restaurant-question">
    <button className="button secondary" aria-expanded={open} onClick={() => setOpen(!open)}>{children}</button>
    {open && <div className="question-panel" role="status"><strong>Question to ask the restaurant</strong><p>Please confirm {dish ? `the full ingredients in ${dish}, substitutions, and preparation` : 'the current menu, full ingredients, and preparation'} against my dining needs, including cross-contact.</p><small>Preview only. No message has been sent; no restaurant service is connected.</small></div>}
  </div>
}
