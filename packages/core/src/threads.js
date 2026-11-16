// threads.js — task continuation threads ("#2", "#3" suffixes).
//
// User request (2026-11-17): some tasks are worked on for more than one day
// and the extra effort must be credited. Each task row gets a "thread"
// action that creates ANOTHER task just below it with the SAME text plus a
// " #N" suffix (N starts at 2), e.g. "Deep clean the garage" →
// "Deep clean the garage #2" → "Deep clean the garage #3". Thread
// membership is tracked structurally with `task.threadOf` (the id of the
// task it continues), so any client can tell a thread task from a
// standalone one WITHOUT parsing the text — the suffix is presentation,
// threadOf is the data.
//
// Purity contract: same as the rest of the package (no Date.now, no
// builtins — `now` and ids enter as arguments).

// Matches a trailing " #<digits>" thread suffix (at least one whitespace
// before the #, so a task literally named "Issue #2" keeps its text — the
// suffix is only stripped from CONTINUATION text, never re-derived).
const THREAD_SUFFIX_RE = /\s+#\d+$/

// Strip a trailing " #N" thread suffix from task text.
function stripThreadSuffix(text) {
  return String(text ?? '').replace(THREAD_SUFFIX_RE, '')
}

// True when the text ends with a thread suffix (presentation helper).
function hasThreadSuffix(text) {
  return THREAD_SUFFIX_RE.test(String(text ?? ''))
}

// Resolve the ROOT task of a thread by walking taskOf/threadOf links up.
// Dangling references (parent deleted) and cycles both terminate: the
// deepest resolvable task is treated as the root.
function threadRootOf(task, taskMap) {
  let current = task
  const seen = new Set()
  while (current && current.threadOf && !seen.has(current.id)) {
    seen.add(current.id)
    const parent = taskMap.get(current.threadOf)
    if (!parent) break
    current = parent
  }
  return current || null
}

// Every task that belongs to the same thread as `task` (the root itself
// plus all continuations, completed ones included — a completed "A #2"
// still counts towards the thread, otherwise clicking thread on "A" again
// would recreate "#2" and double-register the effort).
function threadTasks(task, tasks) {
  const taskMap = new Map(tasks.map(t => [t.id, t]))
  const root = threadRootOf(task, taskMap)
  if (!root) return []
  const rootId = root.id
  return tasks.filter(t => {
    const tRoot = threadRootOf(t, taskMap)
    return tRoot && tRoot.id === rootId
  })
}

// The continuation number the NEXT thread task of `sourceTask` must carry:
// thread size + 1 ("A" alone → 2; "A" + "A #2" → 3; …).
function nextThreadNumber(sourceTask, tasks) {
  return threadTasks(sourceTask, tasks).length + 1
}

// Build the continuation task for `sourceTask` against the full task list.
// The caller is responsible for inserting it into the board directly below
// the source task (board position is client state, not core state).
function createThreadContinuation({ sourceTask, tasks, now, generateId }) {
  const baseText = stripThreadSuffix(sourceTask.text)
  const number = nextThreadNumber(sourceTask, tasks)
  return {
    id: generateId(),
    text: `${baseText} #${number}`,
    createdAt: now,
    updatedAt: now,
    completion: null,
    threadOf: sourceTask.id
  }
}

module.exports = {
  stripThreadSuffix,
  hasThreadSuffix,
  threadRootOf,
  threadTasks,
  nextThreadNumber,
  createThreadContinuation
}
