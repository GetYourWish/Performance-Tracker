// Custom JSX runtime wrapper that sanitizes all style props.
// Catches object values that trigger React error #62 in setValueForStyles.
// This intercepts at the JSX level BEFORE React processes the style.

import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime'
import { Fragment } from 'react'

function sanitizeStyle(style, componentName) {
  if (!style || typeof style !== 'object') return style
  
  const clean = {}
  let foundBad = false
  
  for (const key in style) {
    if (!Object.prototype.hasOwnProperty.call(style, key)) continue
    const val = style[key]
    
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      foundBad = true
      console.error('%c[STYLE BUG CAUGHT]', 'color:red;font-size:18px;font-weight:bold;background:yellow;padding:2px 8px')
      console.error('%cComponent:', 'color:orange;font-weight:bold', componentName || 'unknown')
      console.error('%cCSS Property:', 'color:orange;font-weight:bold', String(key))
      console.error('%cBad Value:', 'color:red;font-weight:bold', val)
      console.error('%cValue Type:', 'color:red', typeof val, val?.constructor?.name)
      console.error('%cValue Keys:', 'color:red;font-weight:bold', Object.keys(val))
      console.trace('[STYLE BUG STACK TRACE]')
      // Skip this property to prevent the crash
    } else {
      clean[key] = val
    }
  }
  
  return clean
}

export function jsx(type, props, key) {
  if (props?.style) {
    const name = typeof type === 'function' ? type.displayName || type.name : String(type)
    const sanitized = sanitizeStyle(props.style, name)
    props = { ...props, style: sanitized }
  }
  return _jsx(type, props, key)
}

export function jsxs(type, props, key) {
  if (props?.style) {
    const name = typeof type === 'function' ? type.displayName || type.name : String(type)
    const sanitized = sanitizeStyle(props.style, name)
    props = { ...props, style: sanitized }
  }
  return _jsxs(type, props, key)
}

export { Fragment }
