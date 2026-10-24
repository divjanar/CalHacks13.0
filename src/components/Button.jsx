export default function Button({ to, secondary = false, children, onClick }) {
  return <a className={`button${secondary ? ' secondary' : ''}`} href={to} onClick={onClick}>{children}</a>
}
