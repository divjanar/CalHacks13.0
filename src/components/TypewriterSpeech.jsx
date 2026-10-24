import { useEffect, useState } from 'react'

function SpeechText({ text, className }) {
  const characters = Array.from(text)
  const [count, setCount] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? characters.length : 0)
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (motion.matches) return
    let timer
    let index = 0
    function type() {
      index++
      setCount(index)
      if (index < Array.from(text).length) timer = setTimeout(type, /[.!?]/.test(Array.from(text)[index - 1]) ? 320 : /[,\n]/.test(Array.from(text)[index - 1]) ? 160 : 32)
    }
    const finish = event => { if (event.matches) { clearTimeout(timer); setCount(Array.from(text).length) } }
    motion.addEventListener('change', finish)
    timer = setTimeout(type, 250)
    return () => { clearTimeout(timer); motion.removeEventListener('change', finish) }
  }, [text])
  return <p className={className}>
    <span className="sr-only">{text}</span>
    <span className="host-speech-text" aria-hidden="true"><span className="host-speech-measure">{text}</span><span className="host-speech-visible">{characters.slice(0, count).join('')}{count < characters.length && <span className="host-speech-cursor" />}</span></span>
  </p>
}
export default function TypewriterSpeech({ text, className = 'discover-host-bubble' }) {
  return <SpeechText key={text} text={text} className={className} />
}
