import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './components/components.css'

// Style diagnostics are now in diag-jsx-runtime.js (Vite alias)

window.addEventListener('error', (event) => {
  const msg = event.error?.message || event.message || ''
  if (msg.includes('Objects are not valid') || msg.includes('error #62') || msg.includes('setValueForStyles')) {
    console.error('%c[REACT ERROR]', 'color:red;font-size:14px', event.error?.message)
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
