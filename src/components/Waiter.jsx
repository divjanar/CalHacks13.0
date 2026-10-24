import { useState } from 'react'

const assets = import.meta.glob('../assets/waiter/*/*.png', { eager: true, query: '?url', import: 'default' })
// PNGs supply poses, not timing. These durations are adjustable playback defaults.
const durations = { pointing: 1.5, reading: 1.8, celebration: 0.96 }
const descriptions = { pointing: 'Your Table 8 host pointing', reading: 'Your Table 8 host reading the menu', celebration: 'Your Table 8 host celebrating' }

function FrameLoop({ variant }) {
  const [loaded, setLoaded] = useState({})
  const ready = Object.keys(loaded).length === 6
  return <div className="waiter" role="img" aria-label={descriptions[variant]} data-animation={variant} data-ready={ready}>
    {Array.from({ length: 6 }, (_, index) => <img
      key={index}
      className="waiter-frame"
      src={assets[`../assets/waiter/${variant}/${index + 1}.png`]}
      alt=""
      aria-hidden="true"
      draggable="false"
      onLoad={() => setLoaded(previous => ({ ...previous, [index]: true }))}
      style={{ animationDuration: `${durations[variant]}s`, animationDelay: `${index * durations[variant] / 6}s` }}
    />)}
  </div>
}

export default function Waiter({ variant = 'pointing' }) {
  const animation = Object.hasOwn(durations, variant) ? variant : 'pointing'
  return <FrameLoop key={animation} variant={animation} />
}
