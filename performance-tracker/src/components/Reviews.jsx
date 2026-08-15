import { useState, useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { format, startOfWeek, endOfWeek, eachDayOfInterval, getYear, startOfYear, endOfYear } from 'date-fns'
import { calculateDayScore, parseDate, formatDate, groupTasksByDate } from '../utils/helpers'

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
        value
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
            Weekly
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
                    <div key={task.id} className="completed-task-item">
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

            <div className="weekly-chart">
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={weeklyData.chartData}>
                  <XAxis dataKey="dayName" />
                  <YAxis />
                  <Tooltip 
                    formatter={(value) => [`${value.toFixed(1)}`, 'Score']}
                    labelFormatter={(label) => `Day: ${label}`}
                  />
                  {weeklyData.chartData.map((entry, index) => (
                    <Cell 
                      key={index} 
                      fill={entry.score > 0 ? '#60a5fa' : 'var(--bg-tertiary)'}
                      onClick={() => {
                        setSelectedDate(parseDate(entry.date));
                        setReviewType('daily');
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                  ))}
                  <Bar dataKey="score" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {reviewType === 'heatmap' && (
          <div className="heatmap-review">
            <div className="heatmap-header">
              <button onClick={() => setHeatmapYear(heatmapYear - 1)}>←</button>
              <span>{heatmapYear}</span>
              <button onClick={() => setHeatmapYear(heatmapYear + 1)}>→</button>
            </div>

            <div className="heatmap-grid">
              {heatmapData.map((cell, index) => (
                <div
                  key={index}
                  className="heatmap-cell"
                  style={{
                    backgroundColor: getColorIntensity(cell.value, maxHeatmapValue)
                  }}
                  title={`${cell.date}: Score ${cell.value.toFixed(1)}`}
                  onClick={() => {
                    setSelectedDate(parseDate(cell.date));
                    setReviewType('daily');
                  }}
                />
              ))}
            </div>

            <div className="heatmap-legend">
              <span>Less</span>
              <div className="legend-gradient">
                <div style={{ backgroundColor: 'var(--bg-tertiary)' }}></div>
                <div style={{ backgroundColor: '#bbf7d0' }}></div>
                <div style={{ backgroundColor: '#86efac' }}></div>
                <div style={{ backgroundColor: '#4ade80' }}></div>
                <div style={{ backgroundColor: '#22c55e' }}></div>
              </div>
              <span>More</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default Reviews
