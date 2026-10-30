import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './app/App'
import './styles/index.css'

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <pre style={{ padding: 16, whiteSpace: 'pre-wrap', direction: 'ltr' }}>
          {String(this.state.error.stack || this.state.error.message)}
        </pre>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter basename="/yalla-nezaker">
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
)
