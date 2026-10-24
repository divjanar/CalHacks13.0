const steps = [['signin', 'Sign in'], ['preferences', 'Dining needs'], ['verify', 'Verification'], ['consent', 'Community']]
export default function Progress({ current }) {
  return <nav className="progress" aria-label="Request steps">{steps.map(([path, label], index) => <a key={path} href={`#/${path}`} aria-current={path === current ? 'step' : undefined}>{index + 1} · {label}</a>)}</nav>
}
