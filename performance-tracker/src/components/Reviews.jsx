import { useState, useMemo } from 'react'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, getYear, startOfYear, endOfYear } from 'date-fns'
import { calculateDayScore, parseDate, formatDate, groupTasksByDate } from '../utils/helpers'
import ChronoStream from './ChronoStream'
import HeatmapGrid from './HeatmapSkyline'

// Task Detail Popup Component
function TaskDetailPopup({ task, difficulty, category, onClose }) {
  const completion = task.completion
  
  if (!completion) return null
  
  const completedDate = new Date(completion.completedDate)
  const completedTime = new Date(completion.completedAt)
  
  return (
    <div 
      className="popup-overlay" 
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
    >
      <div className="completion-popup" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h3 id="task-detail-title">Task Details</h3>
          <button 
            className="action-btn" 
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
        
        <div className="task-text" style={{ marginBottom: '16px' }}>{task.text}</div>
        
        <div className="form-group">
          <label>Completion Date</label>
          <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
            {format(completedDate, 'EEEE, MMMM d, yyyy')}
          </div>
        </div>
        
        <div className="form-group">
          <label>Completion Time</label>
          <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)' }}>
            {format(completedTime, 'h:mm a')}
          </div>
        </div>
        
        {difficulty && (
          <div className="form-group">
            <label>Difficulty</label>
            <div 
              className="difficulty-badge"
              style={{ 
                backgroundColor: difficulty.color, 
                display: 'inline-block',
                padding: '8px 16px',
                borderRadius: '12px',
                color: '#fff',
                fontWeight: 500
              }}
            >
              {difficulty.label} ({difficulty.score})
            </div>
          </div>
        )}
        
        <div className="form-group">
          <label>Category</label>
          {category ? (
            <div 
              className="category-badge"
              style={{ 
                backgroundColor: category.color, 
                display: 'inline-block',
                padding: '8px 16px',
                borderRadius: '12px',
                color: '#fff',
                fontWeight: 500
              }}
            >
              {category.name}
            </div>
          ) : (
            <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
              No category
            </div>
          )}
        </div>
        
        <div className="form-group">
          <label>Note</label>
          {completion.note ? (
            <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
              {completion.note}
            </div>
          ) : (
            <div style={{ padding: '10px 12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', color: 'var(--text-muted)' }}>
              No note
            </div>
          )}
        </div>
        
        <div className="popup-actions">
          <button className="btn-cancel" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

// Delete Confirmation Popup Component
function DeleteConfirmPopup({ task, onConfirm, onCancel }) {
  return (
    <div 
      className="popup-overlay" 
      onClick={onCancel}
      onKeyDown={(e) => e.key === 'Escape' && onCancel()}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="delete-confirm-title"
    >
      <div className="completion-popup" onClick={(e) => e.stopPropagation()}>
        <h3 id="delete-confirm-title">Delete task?</h3>
        
        <div className="task-text" style={{ marginBottom: '16px' }}>{task.text}</div>
        
        <p style={{ color: '#ef4444', marginBottom: '24px', fontWeight: 500 }}>
          This cannot be undone.
        </p>
        
        <div className="popup-actions">
          <button className="btn-cancel" onClick={onCancel}>Cancel</button>
          <button 
            className="btn-confirm" 
            onClick={onConfirm}
            style={{ backgroundColor: '#ef4444' }}
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

function Reviews({ data, onDayClick }) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [reviewType, setReviewType] = useState('daily')
  const [heatmapYear, setHeatmapYear] = useState(getYear(new Date()))

  const tasks = data?.tasks || []
  const difficulties = data?.difficulties || []
  const categories = data?.categories || []
  const settings = data?.settings || {}

  const completedTasks = tasks.filter(t => t.completion)
  
  // Pre-group completed tasks by date for O(1) lookup - MAJOR PERFORMANCE IMPROVEMENT
  const tasksByDate = useMemo(() => {
    return groupTasksByDate(completedTasks)
  }, [completedTasks])
  
  // Create difficulty map for O(1) lookup
  const difficultyMap = useMemo(() => {
    return new Map(difficulties.map(d => [d.id, d]))
  }, [difficulties])

  // Daily Review Data - OPTIMIZED: Use pre-grouped tasks
  const dailyData = useMemo(() => {
    const dateStr = formatDate(selectedDate)
    const daysTasks = tasksByDate.get(dateStr) || []
    const score = calculateDayScore(
      daysTasks, 
      difficulties, 
      settings.fatigueIncrement || 0.10, 
      settings.fatigueCap || 3.0
    )

    return {
      date: dateStr,
      score,
      count: daysTasks.length,
      tasks: daysTasks
    }
  }, [selectedDate, tasksByDate, difficulties, settings])

  // Weekly Review Data - OPTIMIZED: Use pre-grouped tasks
  const weeklyData = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: settings.weekStartsOn || 1 })
    const end = endOfWeek(selectedDate, { weekStartsOn: settings.weekStartsOn || 1 })
    const days = eachDayOfInterval({ start, end })

    const chartData = days.map(day => {
      const dateStr = formatDate(day)
      const daysTasks = tasksByDate.get(dateStr) || []
      const score = calculateDayScore(
        daysTasks,
        difficulties,
        settings.fatigueIncrement || 0.10,
        settings.fatigueCap || 3.0
      )

      return {
        date: dateStr,
        dayName: format(day, 'EEE'),
        score,
        count: daysTasks.length
      }
    })

    const totalScore = chartData.reduce((sum, d) => sum + d.score, 0)
    const totalCount = chartData.reduce((sum, d) => sum + d.count, 0)
    const bestDay = chartData.reduce((best, d) => d.score > best.score ? d : best, chartData[0])

    return {
      chartData,
      totalScore,
      totalCount,
      bestDay
    }
  }, [selectedDate, tasksByDate, difficulties, settings])

  // Heatmap Data - OPTIMIZED: Use pre-grouped tasks (O(n) instead of O(n*m))
  const heatmapData = useMemo(() => {
    const start = startOfYear(new Date(heatmapYear, 0, 1))
    const end = endOfYear(new Date(heatmapYear, 0, 1))
    const days = eachDayOfInterval({ start, end })

    return days.map(day => {
      const dateStr = formatDate(day)
      const daysTasks = tasksByDate.get(dateStr) || []
      
      let value = 0
      if (settings.heatmapMode === 'count') {
        value = daysTasks.length
      } else {
        value = calculateDayScore(
          daysTasks,
          difficulties,
          settings.fatigueIncrement || 0.10,
          settings.fatigueCap || 3.0
        )
      }

      return {
        date: dateStr,
        day,
        value,
        tasks: daysTasks  // Include tasks for dominant color calculation
      }
    })
  }, [heatmapYear, tasksByDate, difficulties, settings])

  const getColorIntensity = (value, maxValue) => {
    if (value === 0) return 'var(--bg-tertiary)'
    const ratio = Math.min(value / maxValue, 1)
    if (ratio > 0.75) return '#22c55e'
    if (ratio > 0.5) return '#4ade80'
    if (ratio > 0.25) return '#86efac'
    return '#bbf7d0'
  }

  const maxHeatmapValue = Math.max(...heatmapData.map(d => d.value), 1)
  
  // State for task detail popup
  const [selectedTask, setSelectedTask] = useState(null)
  
  // State for streamgraph range toggle
  const [streamRange, setStreamRange] = useState('week')

  return (
    <div className="reviews-container">
      <div className="reviews-header">
        <h2>Reviews</h2>
        <div className="review-tabs">
          <button 
            className={`tab ${reviewType === 'daily' ? 'active' : ''}`}
            onClick={() => setReviewType('daily')}
          >
            Daily
          </button>
          <button 
            className={`tab ${reviewType === 'weekly' ? 'active' : ''}`}
            onClick={() => setReviewType('weekly')}
          >
            Flow State
          </button>
          <button 
            className={`tab ${reviewType === 'heatmap' ? 'active' : ''}`}
            onClick={() => setReviewType('heatmap')}
          >
            Heatmap
          </button>
        </div>
      </div>

      <div className="review-content scrollable">
        {reviewType === 'daily' && (
          <div className="daily-review">
            <div className="date-selector">
              <input
                type="date"
                value={formatDate(selectedDate)}
                onChange={(e) => setSelectedDate(parseDate(e.target.value))}
              />
            </div>

            <div className="daily-summary">
              <div className="summary-card">
                <div className="summary-value">{dailyData.score.toFixed(1)}</div>
                <div className="summary-label">Productivity Score</div>
              </div>
              <div className="summary-card">
                <div className="summary-value">{dailyData.count}</div>
                <div className="summary-label">Tasks Completed</div>
              </div>
            </div>

            <div className="completed-tasks-list">
              {dailyData.tasks.length === 0 ? (
                <p className="empty-state">No tasks completed on this date</p>
              ) : (
                dailyData.tasks.map(task => {
                  const difficulty = difficulties.find(d => d.id === task.completion.difficultyId)
                  const category = categories.find(c => c.id === task.completion.categoryId)
                  
                  return (
                    <div 
                      key={task.id} 
                      className="completed-task-item"
                      style={{ cursor: 'pointer', transition: 'all var(--transition-fast)' }}
                      onClick={() => setSelectedTask(task)}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-tertiary)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                    >
                      <div className="task-info">
                        <div className="task-text">{task.text}</div>
                        <div className="task-meta">
                          {difficulty && (
                            <span 
                              className="difficulty-badge"
                              style={{ backgroundColor: difficulty.color }}
                            >
                              {difficulty.label}
                            </span>
                          )}
                          {category && (
                            <span 
                              className="category-badge"
                              style={{ backgroundColor: category.color }}
                            >
                              {category.name}
                            </span>
                          )}
                        </div>
                      </div>
                      {task.completion.note && (
                        <div className="task-note">{task.completion.note}</div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {reviewType === 'weekly' && (
          <div className="weekly-review">
            <div className="date-selector">
              <input
                type="date"
                value={formatDate(selectedDate)}
                onChange={(e) => setSelectedDate(parseDate(e.target.value))}
              />
            </div>

            <div className="weekly-summary">
              <div className="summary-card">
                <div className="summary-value">{weeklyData.totalScore.toFixed(1)}</div>
                <div className="summary-label">Total Score</div>
              </div>
              <div className="summary-card">
                <div className="summary-value">{weeklyData.totalCount}</div>
                <div className="summary-label">Tasks Completed</div>
              </div>
              <div className="summary-card">
                <div className="summary-value">{weeklyData.bestDay?.score.toFixed(1) || 0}</div>
                <div className="summary-label">Best Day ({weeklyData.bestDay?.dayName || '-'})</div>
              </div>
            </div>

            {/* Streamgraph Range Toggle */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              {['week', 'month', 'all'].map(r => (
                <button
                  key={r}
                  className={`tab ${streamRange === r ? 'active' : ''}`}
                  onClick={() => setStreamRange(r)}
                  style={{
                    padding: '6px 12px',
                    background: streamRange === r ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-md)',
                    color: streamRange === r ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '13px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'all var(--transition-fast)'
                  }}
                >
                  {r.charAt(0).toUpperCase() + r.slice(1)}
                </button>
              ))}
            </div>

            {/* Chrono-Stream River Chart */}
            <ChronoStream
              tasks={completedTasks}
              categories={categories}
              difficulties={difficulties}
              range={streamRange}
              flowStateColor={settings.flowStateColor}
            />
          </div>
        )}

        {reviewType === 'heatmap' && (
          <div className="heatmap-review">
            <div className="heatmap-header">
              <button onClick={() => setHeatmapYear(heatmapYear - 1)}>←</button>
              <span>{heatmapYear}</span>
              <button onClick={() => setHeatmapYear(heatmapYear + 1)}>→</button>
            </div>

            {/* GitHub-style Flat Heatmap */}
            <HeatmapGrid heatmapData={heatmapData} categories={categories} />
          </div>
        )}
      </div>

      {/* Task Detail Popup */}
      {selectedTask && (
        <TaskDetailPopup
          task={selectedTask}
          difficulty={difficulties.find(d => d.id === selectedTask.completion.difficultyId)}
          category={categories.find(c => c.id === selectedTask.completion.categoryId)}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  )
}

export default Reviews
