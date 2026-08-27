import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'
import './components/components.css'

// DIAGNOSTIC: Intercept ALL style property assignments to catch the
// exact object value that triggers React error #62 in setValueForStyles.
// This works with production React — no build changes needed.
;(function installStyleInterceptor() {
  const proxyCache = new WeakMap()
  const origStyleDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'style')
  if (!origStyleDescriptor || !origStyleDescriptor.get) return

  Object.defineProperty(HTMLElement.prototype, 'style', {
    get() {
      const realStyle = origStyleDescriptor.get.call(this)
      if (!realStyle || typeof realStyle !== 'object') return realStyle
      if (proxyCache.has(realStyle)) return proxyCache.get(realStyle)

      const proxy = new Proxy(realStyle, {
        set(target, prop, value) {
          if (value !== null && typeof value === 'object') {
            console.error('%c[STYLE BUG CAUGHT]', 'color:red;font-size:18px;font-weight:bold;background:yellow;padding:2px 8px')
            console.error('%cElement:', 'color:orange;font-weight:bold', this.tagName, this.className, this.id)
            console.error('%cProperty:', 'color:orange;font-weight:bold', String(prop))
            console.error('%cValue:', 'color:red;font-weight:bold', value)
            console.error('%cValue keys:', 'color:red;font-weight:bold', Object.keys(value))
            console.error('%cValue type:', 'color:red', typeof value, value.constructor?.name)
            // Log a short stack trace to find the React component
            console.trace('[STYLE BUG STACK TRACE]')
          }
          return Reflect.set(target, prop, value)
        },
        get(target, prop) {
          return Reflect.get(target, prop)
        }
      })
      proxyCache.set(realStyle, proxy)
      return proxy
    },
    configurable: true
  })
})()

// Also capture React's error for additional context
window.addEventListener('error', (event) => {
  const msg = event.error?.message || event.message || ''
  if (msg.includes('Objects are not valid') || msg.includes('error #62') || msg.includes('setValueForStyles')) {
    console.error('%c[REACT ERROR]', 'color:red;font-size:14px', event.error?.message)
    const keysMatch = event.error?.message?.match(/object with keys \{([^}]+)\}/)
    if (keysMatch) {
      console.error('%c[OBJECT KEYS FROM REACT]', 'color:red;font-size:16px;font-weight:bold', keysMatch[1])
    }
  }
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
