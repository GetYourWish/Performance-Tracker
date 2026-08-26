import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { subDays, startOfWeek, format, differenceInDays, startOfMonth, getYear, startOfYear } from 'date-fns'
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import MomentumRing from './MomentumRing'
import { calculateTaskScoreBreakdown, formatDate, groupTasksByDate } from '../utils/helpers'

const RANGE_OPTIONS = [
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All-time' }
]

const PANEL_META = {
  intensity: { title: 'INTENSITY', gradient: 'linear-gradient(135deg, rgba(239,68,68,0.85), rgba(251,191,36,0.7))' },
  records: { title: 'RECORDS', gradient: 'linear-gradient(135deg, rgba(168,85,247,0.85), rgba(59,130,246,0.7))' },
  rhythm: { title: 'RHYTHM', gradient: 'linear-gradient(135deg, rgba(34,197,94,0.85), rgba(16,185,129,0.7))' },
  composition: { title: 'COMPOSITION', gradient: 'linear-gradient(135deg, rgba(59,130,246,0.85), rgba(168,85,247,0.7))' }
}

function isCardVisible(settings, cardId) {
  const dash = settings.dashboard || {}
  return dash[cardId] !== false
}

function getRangeStart(rangeKey) {
  const now = new Date()
  switch (rangeKey) {
    case '30d': return subDays(now, 29)
    case '90d': return subDays(now, 89)
    case 'year': {
      const y = getYear(now)
      return startOfYear(new Date(y, 0, 1))
    }
    default: return null // all-time
  }
}

function filterByRange(tasks, rangeKey) {
  if (rangeKey === 'all') return tasks
  const start = getRangeStart(rangeKey)
  if (!start) return tasks
  return tasks.filter(t => {
    if (!t.completion?.completedAt) return false
    return new Date(t.completion.completedAt) >= start
  })
}

function EmptyCard() {
  return <div className="dash-empty">Complete tasks to unlock this panel.</div>
}

function AnimatedNumber({ value, decimals = 0, suffix = '' }) {
  return (
    <motion.span
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
    >
      {typeof value === 'number' ? (decimals > 0 ? value.toFixed(decimals) : Math.round(value)) : value}{suffix}
    </motion.span>
  )
}

function StatCard({ icon, value, label, decimals = 0, suffix = '' }) {
  return (
    <div className="dash-stat-card">
      {icon && <div className="dash-stat-icon">{icon}</div>}
      <div className="dash-stat-body">
        <div className="dash-stat-value"><AnimatedNumber value={value} decimals={decimals} suffix={suffix} /></div>
        <div className="dash-stat-label">{label}</div>
      </div>
    </div>
  )
}

function Panel({ panelKey, title, gradient, children }) {
  return (
    <div className="dash-panel">
      <div className="dash-panel-header" style={{ background: gradient }}>
        <span className="dash-panel-title">{title}</span>
      </div>
      <div className="dash-panel-body">
        {children}
      </div>
    </div>
  )
}

function DashTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="dash-tooltip">
      <div className="dash-tooltip-label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || 'var(--text-primary)' }}>
          {p.name}: <strong>{typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</strong>
        </div>
      ))}
    </div>
  )
}

function IntensityPanel({ tasks, rangeTasks, difficulties, categories, settings }) {
  const hasData = rangeTasks.length > 0
  if (!hasData) return <EmptyCard />

  const diffMap = new Map(difficulties.map(d => [d.id, d]))
  const catMap = new Map(categories.map(c => [c.id, c]))
  const sortedDiffs = [...difficulties].filter(d => d.active !== false).sort((a, b) => a.score - b.score)
  const minDiff = sortedDiffs.length > 0 ? sortedDiffs[0].score : 0
  const maxDiff = sortedDiffs.length > 0 ? sortedDiffs[sortedDiffs.length - 1].score : 1
  const range = maxDiff - minDiff || 1

  const avgDifficulty = rangeTasks.reduce((sum, t) => {
    const d = diffMap.get(t.completion?.difficultyId)
    return sum + (d ? d.score : 0)
  }, 0) / rangeTasks.length

  const avgPosition = Math.max(0, Math.min(100, ((avgDifficulty - minDiff) / range) * 100))

  const gaugeGradient = sortedDiffs.map(d => `${d.color} ${((d.score - minDiff) / range) * 100}%`).join(', ')

  const fatigueInc = settings.fatigueIncrement || 0.10
  const fatigueCap = settings.fatigueCap || 3.0

  let totalTrue = 0
  let totalEffort = 0
  rangeTasks.forEach(t => {
    const bd = calculateTaskScoreBreakdown(t, rangeTasks, difficulties, fatigueInc, fatigueCap, categories)
    totalTrue += bd.finalScore
    totalEffort += bd.basePoints * bd.fatigueMultiplier
  })

  const pointsPerTask = rangeTasks.length > 0 ? totalTrue / rangeTasks.length : 0

  const delta = totalEffort > 0 ? ((totalTrue - totalEffort) / totalEffort) * 100 : 0

  const weekMap = new Map()
  rangeTasks.forEach(t => {
    if (!t.completion?.completedAt) return
    const d = new Date(t.completion.completedAt)
    const weekStart = startOfWeek(d, { weekStartsOn: settings.weekStartsOn || 1 })
    const key = formatDate(weekStart)
    if (!weekMap.has(key)) weekMap.set(key, { sum: 0, count: 0 })
    const entry = weekMap.get(key)
    const diff = diffMap.get(t.completion.difficultyId)
    entry.sum += diff ? diff.score : 0
    entry.count++
  })

  const trendData = [...weekMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-12)
    .map(([key, v]) => ({
      week: format(parseDate(key), 'MMM d'),
      avg: v.count > 0 ? v.sum / v.count : 0
    }))


  return (
    <>
      {isCardVisible(settings, 'avgDifficulty') && (
        <div className="dash-card">
          <div className="dash-card-label">Avg Difficulty</div>
          <div className="dash-gauge-container">
            <div className="dash-gauge-track" style={{ background: gaugeGradient || 'var(--bg-tertiary)' }}>
              <div className="dash-gauge-marker" style={{ left: `${avgPosition}%` }} />
            </div>
            <div className="dash-gauge-labels">
              <span>{minDiff}</span>
              <span className="dash-gauge-value">{avgDifficulty.toFixed(2)}</span>
              <span>{maxDiff}</span>
            </div>
          </div>
        </div>
      )}

      {isCardVisible(settings, 'pointsPerTask') && (
        <StatCard
          icon={<span style={{ fontSize: '18px' }}>&#9733;</span>}
          value={pointsPerTask}
          decimals={1}
          label="Points Per Task"
        />
      )}

      {isCardVisible(settings, 'intensityTrend') && trendData.length > 1 && (
        <div className="dash-card dash-card-chart">
          <div className="dash-card-label">Intensity Trend (weekly avg difficulty)</div>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={trendData}>
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<DashTooltip />} />
              <Line type="monotone" dataKey="avg" stroke="#f87171" strokeWidth={2} dot={{ r: 3, fill: '#f87171' }} name="Avg Difficulty" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {isCardVisible(settings, 'trueVsEffort') && (
        <div className="dash-card">
          <div className="dash-card-label">True vs Effort</div>
          <div className="dash-tve-row">
            <div className="dash-tve-stat">
              <span className="dash-tve-value" style={{ color: 'var(--text-primary)' }}>{totalTrue.toFixed(1)}</span>
              <span className="dash-tve-sub">true score</span>
            </div>
            <span className="dash-tve-vs">vs</span>
            <div className="dash-tve-stat">
              <span className="dash-tve-value" style={{ color: 'var(--text-muted)' }}>{totalEffort.toFixed(1)}</span>
              <span className="dash-tve-sub">effort score</span>
            </div>
          </div>
          <div className="dash-tve-delta" style={{ color: delta >= 0 ? '#22c55e' : '#ef4444' }}>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% {delta >= 0 ? 'from working on what matters' : 'category drag'}
          </div>
        </div>
      )}
    </>
  )
}

function RecordsPanel({ tasks, rangeTasks, difficulties, categories, settings, onDayClick }) {
  const allCompleted = tasks
  if (allCompleted.length === 0) return <EmptyCard />

  const diffMap = new Map(difficulties.map(d => [d.id, d]))
  const catMap = new Map(categories.map(c => [c.id, c]))
  const fatigueInc = settings.fatigueIncrement || 0.10
  const fatigueCap = settings.fatigueCap || 3.0

  const tasksByDate = groupTasksByDate(allCompleted)
  const dateScores = new Map()

  for (const [dateStr, dayTasks] of tasksByDate) {
    let score = 0
    const sorted = [...dayTasks].sort((a, b) => new Date(a.completion.completedAt) - new Date(b.completion.completedAt))
    let mult = 1.0
    for (const t of sorted) {
      const d = diffMap.get(t.completion.difficultyId)
      const base = d ? d.score : 0
      let pm = 1.0
      if (t.completion.categoryId) {
        const cat = catMap.get(t.completion.categoryId)
        if (cat && typeof cat.priorityMultiplier === 'number') pm = cat.priorityMultiplier
      }
      score += base * mult * pm
      mult = Math.min(mult + fatigueInc, fatigueCap)
    }
    dateScores.set(dateStr, { score, count: dayTasks.length })
  }

  let bestDay = null
  let bestWeekScore = 0
  let bestWeekLabel = ''
  let bestWeekCount = 0
  let bestMonthScore = 0
  let bestMonthLabel = ''
  let bestMonthCount = 0

  const weekScores = new Map()
  const monthScores = new Map()

  for (const [dateStr, data] of dateScores) {
    if (!bestDay || data.score > bestDay.score) {
      bestDay = { date: dateStr, ...data }
    }

    const d = parseDate(dateStr)
    const ws = startOfWeek(d, { weekStartsOn: settings.weekStartsOn || 1 })
    const wKey = formatDate(ws)
    if (!weekScores.has(wKey)) weekScores.set(wKey, { score: 0, count: 0, label: format(ws, 'MMM d') })
    const w = weekScores.get(wKey)
    w.score += data.score
    w.count += data.count

    const ms = startOfMonth(d)
    const mKey = formatDate(ms)
    if (!monthScores.has(mKey)) monthScores.set(mKey, { score: 0, count: 0, label: format(ms, 'MMM yyyy') })
    const m = monthScores.get(mKey)
    m.score += data.score
    m.count += data.count
  }

  for (const [k, v] of weekScores) {
    if (v.score > bestWeekScore) { bestWeekScore = v.score; bestWeekLabel = v.label; bestWeekCount = v.count }
  }
  for (const [k, v] of monthScores) {
    if (v.score > bestMonthScore) { bestMonthScore = v.score; bestMonthLabel = v.label; bestMonthCount = v.count }
  }

  const allDates = [...dateScores.keys()].sort()
  let currentStreak = 0
  let longestStreak = 0
  let tempStreak = 0
  const today = formatDate(new Date())
  const yesterday = formatDate(subDays(new Date(), 1))

  if (allDates.includes(today) || allDates.includes(yesterday)) {
    let checkDate = allDates.includes(today) ? today : yesterday
    const idx = allDates.indexOf(checkDate)
    for (let i = idx; i >= 0; i--) {
      const expected = formatDate(subDays(parseDate(checkDate), idx - i))
      if (allDates.includes(expected)) currentStreak++
      else break
    }
  }

  for (let i = 0; i < allDates.length; i++) {
    if (i === 0) { tempStreak = 1 }
    else {
      const prev = parseDate(allDates[i - 1])
      const curr = parseDate(allDates[i])
      if (differenceInDays(curr, prev) === 1) tempStreak++
      else tempStreak = 1
    }
    longestStreak = Math.max(longestStreak, tempStreak)
  }

  const highPriorityCats = categories.filter(c => (c.priorityMultiplier ?? 1) > 1)
  const highPriorityIds = new Set(highPriorityCats.map(c => c.id))

  let importantCurrentStreak = 0
  let importantLongestStreak = 0
  let impTemp = 0
  const importantDates = allDates.filter(d => {
    const dayTasks = tasksByDate.get(d) || []
    return dayTasks.some(t => t.completion?.categoryId && highPriorityIds.has(t.completion.categoryId))
  })

  if (importantDates.length > 0) {
    if (importantDates.includes(today) || importantDates.includes(yesterday)) {
      const startD = importantDates.includes(today) ? today : yesterday
      const startIdx = importantDates.indexOf(startD)
      for (let i = startIdx; i >= 0; i--) {
        const expected = formatDate(subDays(parseDate(startD), i - startIdx))
        if (importantDates.includes(expected)) importantCurrentStreak++
        else break
      }
    }
    for (let i = 0; i < importantDates.length; i++) {
      if (i === 0) impTemp = 1
      else {
        const prev = parseDate(importantDates[i - 1])
        const curr = parseDate(importantDates[i])
        if (differenceInDays(curr, prev) === 1) impTemp++
        else impTemp = 1
      }
      importantLongestStreak = Math.max(importantLongestStreak, impTemp)
    }
  }

  let heaviestLift = null
  let maxVal = 0
  allCompleted.forEach(t => {
    const bd = calculateTaskScoreBreakdown(t, allCompleted, difficulties, fatigueInc, fatigueCap, categories)
    if (bd.finalScore > maxVal) { maxVal = bd.finalScore; heaviestLift = { task: t, breakdown: bd } }
  })

  let balanceDays = 0
  for (const [dateStr, dayTasks] of tasksByDate) {
    const uniqueCats = new Set(dayTasks.map(t => t.completion?.categoryId).filter(Boolean))
    if (uniqueCats.size >= 2) balanceDays++
  }

  return (
    <>
      {isCardVisible(settings, 'bestPeriods') && (
        <div className="dash-trophy-grid">
          {bestDay && (
            <div className="dash-trophy-card" style={{ cursor: 'pointer' }} onClick={() => onDayClick && onDayClick(bestDay.date)}>
              <div className="dash-trophy-icon">&#127942;</div>
              <div className="dash-trophy-label">Best Day</div>
              <div className="dash-trophy-score">{bestDay.score.toFixed(1)}</div>
              <div className="dash-trophy-meta">{format(parseDate(bestDay.date), 'MMM d, yyyy')} &middot; {bestDay.count} tasks</div>
            </div>
          )}
          <div className="dash-trophy-card">
            <div className="dash-trophy-icon">&#128200;</div>
            <div className="dash-trophy-label">Best Week</div>
            <div className="dash-trophy-score">{bestWeekScore.toFixed(1)}</div>
            <div className="dash-trophy-meta">{bestWeekLabel || '-'} &middot; {bestWeekCount} tasks</div>
          </div>
          <div className="dash-trophy-card">
            <div className="dash-trophy-icon">&#128197;</div>
            <div className="dash-trophy-label">Best Month</div>
            <div className="dash-trophy-score">{bestMonthScore.toFixed(1)}</div>
            <div className="dash-trophy-meta">{bestMonthLabel || '-'} &middot; {bestMonthCount} tasks</div>
          </div>
        </div>
      )}

      {isCardVisible(settings, 'streaks') && (
        <div className="dash-card">
          <div className="dash-card-label">Streaks</div>
          <div className="dash-streak-row">
            <div className="dash-streak-item">
              <div className="dash-streak-value"><AnimatedNumber value={currentStreak} /></div>
              <div className="dash-streak-sub">current</div>
            </div>
            <div className="dash-streak-divider" />
            <div className="dash-streak-item">
              <div className="dash-streak-value"><AnimatedNumber value={longestStreak} /></div>
              <div className="dash-streak-sub">longest</div>
            </div>
          </div>
        </div>
      )}

      {isCardVisible(settings, 'importantStreak') && (
        <div className="dash-card">
          <div className="dash-card-label">Important Streak <span className="dash-card-hint">(multiplier &gt; 1)</span></div>
          <div className="dash-streak-row">
            <div className="dash-streak-item">
              <div className="dash-streak-value"><AnimatedNumber value={importantCurrentStreak} /></div>
              <div className="dash-streak-sub">current</div>
            </div>
            <div className="dash-streak-divider" />
            <div className="dash-streak-item">
              <div className="dash-streak-value"><AnimatedNumber value={importantLongestStreak} /></div>
              <div className="dash-streak-sub">longest</div>
            </div>
          </div>
        </div>
      )}

      {isCardVisible(settings, 'heaviestLift') && heaviestLift && (
        <div className="dash-card dash-heaviest">
          <div className="dash-card-label">Heaviest Lift</div>
          <div className="dash-heaviest-text">{heaviestLift.task.text}</div>
          <div className="dash-heaviest-badges">
            <span className="dash-badge" style={{ backgroundColor: heaviestLift.breakdown.difficultyColor }}>
              {heaviestLift.breakdown.difficultyLabel}
            </span>
            {heaviestLift.breakdown.categoryName && (
              <span className="dash-badge" style={{ backgroundColor: heaviestLift.breakdown.categoryColor }}>
                {heaviestLift.breakdown.categoryName}
              </span>
            )}
          </div>
          <div className="dash-heaviest-value">{heaviestLift.breakdown.finalScore} pts</div>
          {heaviestLift.task.completion.note && (
            <div className="dash-heaviest-note">"{heaviestLift.task.completion.note.length > 60 ? heaviestLift.task.completion.note.slice(0, 60) + '...' : heaviestLift.task.completion.note}"</div>
          )}
        </div>
      )}

      {isCardVisible(settings, 'balanceDays') && (
        <StatCard
          icon={<span style={{ fontSize: '18px' }}>&#9878;</span>}
          value={balanceDays}
          label="Balance Days (2+ categories)"
        />
      )}
    </>
  )
}

function RhythmPanel({ tasks, rangeTasks, difficulties, categories, settings }) {
  const allCompleted = tasks
  if (allCompleted.length === 0) return <EmptyCard />

  const diffMap = new Map(difficulties.map(d => [d.id, d]))
  const fatigueInc = settings.fatigueIncrement || 0.10
  const fatigueCap = settings.fatigueCap || 3.0

  const now = new Date()
  const last30 = subDays(now, 29)
  const last30Tasks = allCompleted.filter(t => {
    if (!t.completion?.completedDate) return false
    return parseDate(t.completion.completedDate) >= last30
  })

  const uniqueDays30 = new Set(last30Tasks.map(t => t.completion?.completedDate).filter(Boolean))
  const activePct = Math.round((uniqueDays30.size / 30) * 100)

  const activePctClamped = Math.min(activePct, 100)
  const ringR = 28
  const ringCirc = 2 * Math.PI * ringR
  const ringOffset = ringCirc * (1 - activePctClamped / 100)

  const activeDaysInRange = new Set(rangeTasks.map(t => t.completion?.completedDate).filter(Boolean))
  const focusDepth = activeDaysInRange.size > 0 ? (rangeTasks.length / activeDaysInRange.size) : 0

  const weekdayData = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, i) => {
    const dayTasks = rangeTasks.filter(t => {
      if (!t.completion?.completedAt) return false
      return new Date(t.completion.completedAt).getDay() === i
    })
    const uniqueDays = new Set(dayTasks.map(t => t.completion?.completedDate).filter(Boolean))
    const activeDayCount = uniqueDays.size
    let totalScore = 0
    dayTasks.forEach(t => {
      const bd = calculateTaskScoreBreakdown(t, allCompleted, difficulties, fatigueInc, fatigueCap, categories)
      totalScore += bd.finalScore
    })
    return {
      day: name,
      avg: activeDayCount > 0 ? totalScore / activeDayCount : 0,
      activeDays: activeDayCount
    }
  })

  const strongestDay = weekdayData.reduce((best, d) => d.avg > best.avg ? d : best, weekdayData[0])

  const shelfTimes = []
  let sameDayCount = 0
  allCompleted.forEach(t => {
    if (!t.completion?.completedAt || !t.createdAt) return
    const created = new Date(t.createdAt)
    const completed = new Date(t.completion.completedAt)
    const days = differenceInDays(completed, created)
    shelfTimes.push(days)
    if (formatDate(created) === t.completion.completedDate) sameDayCount++
  })

  const avgShelf = shelfTimes.length > 0 ? (shelfTimes.reduce((a, b) => a + b, 0) / shelfTimes.length) : 0
  const sameDayRate = allCompleted.length > 0 ? Math.round((sameDayCount / allCompleted.length) * 100) : 0

  const blocks = [
    { label: 'Morning', key: 'morning', minH: 5, maxH: 12 },
    { label: 'Afternoon', key: 'afternoon', minH: 12, maxH: 17 },
    { label: 'Evening', key: 'evening', minH: 17, maxH: 22 },
    { label: 'Night', key: 'night', minH: 22, maxH: 29 }
  ]

  const blockData = blocks.map(b => {
    const blockTasks = rangeTasks.filter(t => {
      if (!t.completion?.completedAt) return false
      const h = new Date(t.completion.completedAt).getHours()
      return b.minH <= h && h < b.maxH
    })
    let totalPts = 0
    blockTasks.forEach(t => {
      const bd = calculateTaskScoreBreakdown(t, allCompleted, difficulties, fatigueInc, fatigueCap, categories)
      totalPts += bd.finalScore
    })
    return {
      block: b.label,
      count: blockTasks.length,
      avgPts: blockTasks.length > 0 ? totalPts / blockTasks.length : 0
    }
  })

  const goldenWindow = blockData.reduce((best, b) => b.avgPts > best.avgPts ? b : best, blockData[0])

  return (
    <>
      {isCardVisible(settings, 'activeDays') && (
        <div className="dash-card dash-active-days-card">
          <div className="dash-card-label">Active Days (last 30)</div>
          <div className="dash-active-ring-wrap">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r={ringR} stroke="var(--border-color)" strokeWidth="5" fill="none" />
              <motion.circle
                cx="36" cy="36" r={ringR}
                stroke="var(--momentum-streak)"
                strokeWidth="5"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={ringCirc}
                initial={{ strokeDashoffset: ringCirc }}
                animate={{ strokeDashoffset: ringOffset }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
              <text x="36" y="40" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--text-primary)">{activePct}%</text>
            </svg>
          </div>
        </div>
      )}

      {isCardVisible(settings, 'focusDepth') && (
        <StatCard
          icon={<span style={{ fontSize: '18px' }}>&#9881;</span>}
          value={focusDepth}
          decimals={1}
          label="Focus Depth (tasks / active day)"
        />
      )}

      {isCardVisible(settings, 'weekdayBars') && (
        <div className="dash-card dash-card-chart">
          <div className="dash-card-label">Weekday Strength</div>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={weekdayData}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<DashTooltip />} />
              <Bar dataKey="avg" name="Avg Score" radius={[4, 4, 0, 0]}>
                {weekdayData.map((d, i) => (
                  <Cell key={i} fill={d.day === strongestDay.day ? '#22c55e' : 'var(--aurora-1, rgba(59,130,246,0.5))'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="dash-strongest-label">Strongest: <strong>{strongestDay.day}</strong></div>
        </div>
      )}

      {isCardVisible(settings, 'shelfTime') && (
        <div className="dash-card">
          <div className="dash-card-label">Shelf Time</div>
          <div className="dash-shelf-row">
            <div className="dash-shelf-stat">
              <div className="dash-shelf-value"><AnimatedNumber value={avgShelf} decimals={1} /></div>
              <div className="dash-shelf-sub">avg days on board</div>
            </div>
            <div className="dash-shelf-divider" />
            <div className="dash-shelf-stat">
              <div className="dash-shelf-value"><AnimatedNumber value={sameDayRate} suffix="%" /></div>
              <div className="dash-shelf-sub">same-day rate</div>
            </div>
          </div>
        </div>
      )}

      {isCardVisible(settings, 'powerHours') && (
        <div className="dash-card dash-card-chart">
          <div className="dash-card-label">Power Hours</div>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={blockData}>
              <XAxis dataKey="block" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} width={30} />
              <Tooltip content={<DashTooltip />} />
              <Bar dataKey="count" name="Completions" radius={[4, 4, 0, 0]} fill="var(--aurora-2, rgba(168,85,247,0.6))" />
            </BarChart>
          </ResponsiveContainer>
          <div className="dash-golden-label">Golden window: <strong>{goldenWindow.block}</strong></div>
        </div>
      )}
    </>
  )
}

function CompositionPanel({ tasks, rangeTasks, difficulties, categories, settings }) {
  const hasData = rangeTasks.length > 0
  if (!hasData) return <EmptyCard />

  const diffMap = new Map(difficulties.map(d => [d.id, d]))
  const catMap = new Map(categories.map(c => [c.id, c]))
  const fatigueInc = settings.fatigueIncrement || 0.10
  const fatigueCap = settings.fatigueCap || 3.0

  const sortedDiffs = [...difficulties].filter(d => d.active !== false).sort((a, b) => b.score - a.score)
  const diffCounts = new Map()
  rangeTasks.forEach(t => {
    const d = diffMap.get(t.completion?.difficultyId)
    const label = d ? d.label : 'Unknown'
    diffCounts.set(label, (diffCounts.get(label) || 0) + 1)
  })
  const totalTasks = rangeTasks.length
  const mixData = sortedDiffs.map(d => {
    const count = diffCounts.get(d.label) || 0
    return { label: d.label, pct: totalTasks > 0 ? (count / totalTasks) * 100 : 0, color: d.color, count }
  })

  const [donutMode, setDonutMode] = useState('tasks')

  const catByTasks = new Map()
  const catByPoints = new Map()
  let uncategorizedTasks = 0
  let uncategorizedPoints = 0

  rangeTasks.forEach(t => {
    const bd = calculateTaskScoreBreakdown(t, rangeTasks, difficulties, fatigueInc, fatigueCap, categories)
    const cat = t.completion?.categoryId ? catMap.get(t.completion.categoryId) : null
    if (cat) {
      catByTasks.set(cat.id, (catByTasks.get(cat.id) || 0) + 1)
      catByPoints.set(cat.id, (catByPoints.get(cat.id) || 0) + bd.finalScore)
    } else {
      uncategorizedTasks++
      uncategorizedPoints += bd.finalScore
    }
  })

  const donutData = categories.filter(c => c.active !== false).map(c => {
    const tCount = catByTasks.get(c.id) || 0
    const pCount = catByPoints.get(c.id) || 0
    return {
      name: c.name,
      value: donutMode === 'tasks' ? tCount : Math.round(pCount),
      color: c.color
    }
  }).filter(d => d.value > 0)

  if (uncategorizedTasks > 0 || uncategorizedPoints > 0) {
    donutData.push({
      name: 'Uncategorized',
      value: donutMode === 'tasks' ? uncategorizedTasks : Math.round(uncategorizedPoints),
      color: 'var(--text-muted)'
    })
  }

  const topDiff = sortedDiffs.length > 0 ? sortedDiffs[0] : null
  const topDiffCount = topDiff ? (diffCounts.get(topDiff.label) || 0) : 0

  const highPriorityIds = new Set(categories.filter(c => (c.priorityMultiplier ?? 1) > 1).map(c => c.id))
  let highPriorityPoints = 0
  let totalPoints = 0
  rangeTasks.forEach(t => {
    const bd = calculateTaskScoreBreakdown(t, rangeTasks, difficulties, fatigueInc, fatigueCap, categories)
    totalPoints += bd.finalScore
    if (t.completion?.categoryId && highPriorityIds.has(t.completion.categoryId)) {
      highPriorityPoints += bd.finalScore
    }
  })
  const alignmentPct = totalPoints > 0 ? Math.round((highPriorityPoints / totalPoints) * 100) : 0

  const now = new Date()
  const last7 = subDays(now, 6)
  const prev7Start = subDays(now, 13)
  const last7End = subDays(now, 1)

  const momentumData = categories.filter(c => c.active !== false).map(c => {
    const recent = rangeTasks.filter(t => {
      if (t.completion?.categoryId !== c.id || !t.completion?.completedAt) return false
      return new Date(t.completion.completedAt) >= last7
    }).length
    const prev = rangeTasks.filter(t => {
      if (t.completion?.categoryId !== c.id || !t.completion?.completedAt) return false
      const d = new Date(t.completion.completedAt)
      return d >= prev7Start && d < last7
    }).length
    const pct = prev > 0 ? Math.round(((recent - prev) / prev) * 100) : (recent > 0 ? 100 : 0)
    return { name: c.name, color: c.color, pct, recent, prev }
  }).filter(c => c.recent > 0 || c.prev > 0)

  const quietCategories = categories.filter(c => {
    if ((c.priorityMultiplier ?? 1) < 1.5) return false
    const last14 = subDays(now, 13)
    const hasRecent = rangeTasks.some(t => {
      if (t.completion?.categoryId !== c.id || !t.completion?.completedAt) return false
      return new Date(t.completion.completedAt) >= last14
    })
    return !hasRecent
  })

  return (
    <>
      {isCardVisible(settings, 'difficultyMix') && (
        <div className="dash-card">
          <div className="dash-card-label">Difficulty Mix</div>
          <div className="dash-mix-bars">
            {mixData.map(d => (
              <div key={d.label} className="dash-mix-row">
                <span className="dash-mix-label">{d.label}</span>
                <div className="dash-mix-track">
                  <motion.div
                    className="dash-mix-fill"
                    style={{ backgroundColor: d.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${d.pct}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                  />
                </div>
                <span className="dash-mix-pct">{d.pct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isCardVisible(settings, 'categoryDonut') && donutData.length > 0 && (
        <div className="dash-card dash-card-chart">
          <div className="dash-donut-header">
            <span className="dash-card-label">Category Breakdown</span>
            <div className="dash-donut-toggle">
              {['tasks', 'points'].map(m => (
                <button
                  key={m}
                  className={`dash-donut-btn ${donutMode === m ? 'active' : ''}`}
                  onClick={() => setDonutMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={40}
                outerRadius={65}
                paddingAngle={2}
                dataKey="value"
              >
                {donutData.map((d, i) => (
                  <Cell key={i} fill={d.color} stroke="none" />
                ))}
              </Pie>
              <Tooltip content={<DashTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="dash-donut-legend">
            {donutData.map(d => (
              <div key={d.name} className="dash-donut-legend-item">
                <span className="dash-donut-dot" style={{ backgroundColor: d.color }} />
                <span>{d.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isCardVisible(settings, 'topDifficulty') && topDiff && (
        <div className="dash-card">
          <div className="dash-card-label">Top Difficulty</div>
          <div className="dash-top-diff">
            <span className="dash-badge" style={{ backgroundColor: topDiff.color, fontSize: '14px', padding: '6px 14px' }}>
              {topDiffCount} x {topDiff.label}
            </span>
          </div>
        </div>
      )}

      {isCardVisible(settings, 'alignment') && (
        <div className="dash-card">
          <div className="dash-card-label">Alignment <span className="dash-card-hint">(points in multiplier &gt; 1 categories)</span></div>
          <div className="dash-alignment-value">
            <AnimatedNumber value={alignmentPct} suffix="%" />
          </div>
        </div>
      )}

      {isCardVisible(settings, 'momentum') && momentumData.length > 0 && (
        <div className="dash-card">
          <div className="dash-card-label">Category Momentum <span className="dash-card-hint">(7d vs prev 7d)</span></div>
          <div className="dash-momentum-list">
            {momentumData.map(c => (
              <div key={c.name} className="dash-momentum-row">
                <span className="dash-momentum-dot" style={{ backgroundColor: c.color }} />
                <span className="dash-momentum-name">{c.name}</span>
                <span className="dash-momentum-pct" style={{ color: c.pct > 0 ? '#22c55e' : c.pct < 0 ? '#ef4444' : 'var(--text-muted)' }}>
                  {c.pct > 0 ? '+' : ''}{c.pct}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isCardVisible(settings, 'quietNudge') && quietCategories.length > 0 && (
        <div className="dash-card dash-quiet-nudge">
          {quietCategories.map(c => {
            const daysSince = (() => {
              let latest = null
              tasks.filter(t => t.completion?.categoryId === c.id && t.completion?.completedAt).forEach(t => {
                const d = new Date(t.completion.completedAt)
                if (!latest || d > latest) latest = d
              })
              return latest ? differenceInDays(now, latest) : '?'
            })()
            return (
              <div key={c.id} className="dash-quiet-item">
                <span className="dash-quiet-dot" style={{ backgroundColor: c.color }} />
                <span className="dash-quiet-text">{c.name} has been quiet for {daysSince} days</span>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}

export default function Dashboard({ data }) {
  const [range, setRange] = useState('30d')

  const tasks = data?.tasks || []
  const completedTasks = tasks.filter(t => t.completion)
  const difficulties = data?.difficulties || []
  const categories = data?.categories || []
  const settings = data?.settings || {}

  const rangeTasks = useMemo(() => filterByRange(completedTasks, range), [completedTasks, range])

  const allTimeTotal = useMemo(() => {
    let total = 0
    const fatigueInc = settings.fatigueIncrement || 0.10
    const fatigueCap = settings.fatigueCap || 3.0
    const sorted = [...completedTasks].sort((a, b) => new Date(a.completion.completedAt) - new Date(b.completion.completedAt))
    let mult = 1.0
    const diffMap = new Map(difficulties.map(d => [d.id, d]))
    const catMap = new Map(categories.map(c => [c.id, c]))
    for (const t of sorted) {
      const d = diffMap.get(t.completion.difficultyId)
      const base = d ? d.score : 0
      let pm = 1.0
      if (t.completion.categoryId) {
        const cat = catMap.get(t.completion.categoryId)
        if (cat && typeof cat.priorityMultiplier === 'number') pm = cat.priorityMultiplier
      }
      total += base * mult * pm
      mult = Math.min(mult + fatigueInc, fatigueCap)
    }
    return total
  }, [completedTasks, difficulties, categories, settings])

  const handleDayClick = (dateStr) => {
    const event = new CustomEvent('dashboard-day-click', { detail: dateStr })
    window.dispatchEvent(event)
  }

  return (
    <div className="dashboard-container">
      <div className="dash-header">
        <div className="dash-range-toggle">
          {RANGE_OPTIONS.map(r => (
            <button
              key={r.key}
              className={`dash-range-btn ${range === r.key ? 'active' : ''}`}
              onClick={() => setRange(r.key)}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="dash-header-stats">
          <MomentumRing tasks={completedTasks} />
          <div className="dash-header-totals">
            <div className="dash-header-total">
              <span className="dash-header-total-value"><AnimatedNumber value={allTimeTotal} decimals={1} /></span>
              <span className="dash-header-total-label">all-time score</span>
            </div>
            <div className="dash-header-total">
              <span className="dash-header-total-value"><AnimatedNumber value={completedTasks.length} /></span>
              <span className="dash-header-total-label">tasks completed</span>
            </div>
          </div>
        </div>
      </div>

      <div className="dash-grid">
        <Panel panelKey="intensity" title={PANEL_META.intensity.title} gradient={PANEL_META.intensity.gradient}>
          <IntensityPanel tasks={completedTasks} rangeTasks={rangeTasks} difficulties={difficulties} categories={categories} settings={settings} />
        </Panel>

        <Panel panelKey="records" title={PANEL_META.records.title} gradient={PANEL_META.records.gradient}>
          <RecordsPanel tasks={completedTasks} rangeTasks={rangeTasks} difficulties={difficulties} categories={categories} settings={settings} onDayClick={handleDayClick} />
        </Panel>

        <Panel panelKey="rhythm" title={PANEL_META.rhythm.title} gradient={PANEL_META.rhythm.gradient}>
          <RhythmPanel tasks={completedTasks} rangeTasks={rangeTasks} difficulties={difficulties} categories={categories} settings={settings} />
        </Panel>

        <Panel panelKey="composition" title={PANEL_META.composition.title} gradient={PANEL_META.composition.gradient}>
          <CompositionPanel tasks={completedTasks} rangeTasks={rangeTasks} difficulties={difficulties} categories={categories} settings={settings} />
        </Panel>
      </div>
    </div>
  )
}
