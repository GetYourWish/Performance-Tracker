import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './components/components.css'

// Capture full error details before React minification hides them
window.addEventListener('error', (event) => {
  const msg = event.error?.message || event.message || ''
  if (msg.includes('Objects are not valid') || msg.includes('error #62')) {
    console.error('%c[FULL ERROR]', 'color:red;font-size:16px', event.error)
    console.error('%c[ERROR MESSAGE]', 'color:orange', event.error?.message)
    console.error('%c[ERROR STACK]', 'color:yellow', event.error?.stack)
    // Try to extract object keys from the error message
    const keysMatch = event.error?.message?.match(/keys\s*\{([^}]+)\}/)
    if (keysMatch) {
      console.error('%c[OBJECT KEYS]', 'color:red;font-size:14px', keysMatch[1])
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
