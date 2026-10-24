import Header from '../components/Header'
import Button from '../components/Button'
import Field from '../components/Field'

export default function UIKit() {
  return <main className="ui-kit" id="main-content" tabIndex={-1}>
    <section className="kit-foundations"><h1>Table 8 · shared components</h1><div className="kit-examples"><Button to="#/preferences">Continue →</Button><Button to="#/preferences" secondary>Continue →</Button><Field label="Field label"><input defaultValue="Sample value" /></Field></div></section>
    <Header />
  </main>
}
