import Footer from './Footer'
export default function Page({ eyebrow, title, intro, children, className = '', afterFooter, headingAside }) {
  return <main className={`page ${className}`} id="main-content" tabIndex={-1}>{eyebrow && <p className="eyebrow">{eyebrow}</p>}<>{headingAside ? <div className="page-heading"><div className="page-heading-copy"><h1>{title}</h1>{intro && <p className="intro">{intro}</p>}</div>{headingAside}</div> : <><h1>{title}</h1>{intro && <p className="intro">{intro}</p>}</>}</>{children}<Footer />{afterFooter}</main>
}
