import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './components/components.css'

// DIAGNOSTIC: Capture React errors with full development-mode messages
// This build uses React development builds to reveal object keys in error #62
window.addEventListener('error', (event) => {
  const msg = event.error?.message || event.message || ''
  if (msg.includes('Objects are not valid') || msg.includes('error #62') || msg.includes('setValueForStyles')) {
    console.error('%c╔══════════════════════════════════════════════════════════╗', 'color:red;font-size:14px')
    console.error('%c║  REACT STYLE ERROR — FULL DIAGNOSTIC                 ║', 'color:red;font-size:14px')
    console.error('%c╚══════════════════════════════════════════════════════════╝', 'color:red;font-size:14px')
    console.error('%c[FULL MESSAGE]', 'color:orange;font-size:16px;font-weight:bold', event.error?.message)
    console.error('%c[STACK]', 'color:yellow', event.error?.stack)
    // In dev mode, the message contains "object with keys {x, y, ...}"
    const keysMatch = event.error?.message?.match(/object with keys \{([^}]+)\}/)
    if (keysMatch) {
      console.error('%c[FOUND OBJECT KEYS] ' + keysMatch[1], 'color:red;font-size:18px;font-weight:bold;background:yellow')
    }
    // Also try to catch the value from "found: object" 
    const foundMatch = event.error?.message?.match(/found: ([^\.]+)/i)
    if (foundMatch) {
      console.error('%c[FOUND TYPE] ' + foundMatch[1], 'color:red;font-size:16px')
    }
  }
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('%c[UNHANDLED REJECTION]', 'color:red', event.reason)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
