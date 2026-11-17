import { useEffect, useRef, useState } from 'react'

// v1.3.0 (user request 2026-11-18): "in the desktop we are not going to rely
// on windows notification, it will be a small pop up in the bottom right
// inside the app itself that says it and dont forget to implement regular ux
// related things into to it too like the close button so that it doesnt just
// stick there."
//
// Shown when a due deadline task is auto-added to Working On. Standard toast
// UX: explicit close button, auto-dismiss after 8s, auto-dismiss PAUSES on
// hover, and clicking the body opens the Working On popup.

const AUTO_DISMISS_MS = 8000

function ToastCard({ toast, onDismiss, onOpenWorkingOn }) {
  const [paused, setPaused] = useState(false)
  // Keep the latest callbacks reachable from the timer without resetting it
  // on every parent re-render (an inline onDismiss would otherwise restart
  // the countdown each time the stack state changes).
  const dismissRef = useRef(onDismiss)
  dismissRef.current = onDismiss
  const timerRef = useRef(null)
  const remainingRef = useRef(AUTO_DISMISS_MS)
  const startedAtRef = useRef(0)

  useEffect(() => {
    if (paused) {
      clearTimeout(timerRef.current)
      timerRef.current = null
      // freeze the remaining time at the moment the hover started
      remainingRef.current = Math.max(remainingRef.current - (Date.now() - startedAtRef.current), 0)
      return
    }
    startedAtRef.current = Date.now()
    timerRef.current = setTimeout(() => dismissRef.current(), remainingRef.current)
    return () => clearTimeout(timerRef.current)
  }, [paused])

  return (
    <div
      className="deadline-toast"
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <button
        type="button"
        className="deadline-toast-close"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        title="Dismiss"
      >
        ✕
      </button>
      <p className="deadline-toast-title">Deadline reached</p>
      <button type="button" className="deadline-toast-body" onClick={onOpenWorkingOn}>
        <span className="deadline-toast-text">“{toast.text}” was added to Working On</span>
        <span className="deadline-toast-hint">Click to view Working On</span>
      </button>
    </div>
  )
}

// Renders in the bottom-right corner of the app window. At most a handful of
// toasts stack up (the App caps the list); each dismisses itself.
export function DeadlineToastStack({ toasts, onDismiss, onOpenWorkingOn }) {
  if (!toasts || toasts.length === 0) return null
  return (
    <div className="deadline-toast-stack" aria-live="polite">
      {toasts.map(toast => (
        <ToastCard
          key={toast.id}
          toast={toast}
          onDismiss={() => onDismiss(toast.id)}
          onOpenWorkingOn={onOpenWorkingOn}
        />
      ))}
    </div>
  )
}
