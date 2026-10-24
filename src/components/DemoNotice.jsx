export default function DemoNotice({ children }) {
  return <aside className="demo-notice"><strong>Simulated demo.</strong> {children || 'Sample data only. No real booking, payment, or restaurant communication takes place.'}</aside>
}
