import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import './index.css'

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <p>حصلت مشكلة غير متوقعة.</p>
          <pre dir="ltr" style={{ fontSize: 11, opacity: 0.6, whiteSpace: 'pre-wrap', margin: '8px 0' }}>{this.state.error.message}</pre>
          <button onClick={() => location.reload()} style={{ padding: '8px 16px', marginTop: 8 }}>إعادة التحميل</button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <BrowserRouter basename="/el-dof3a-events">
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
)
