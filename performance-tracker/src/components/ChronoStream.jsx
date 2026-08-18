import { useMemo, useState, useRef } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts'
import { format, eachDayOfInterval, subDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays, isAfter, isBefore, isEqual } from 'date-fns'
import { formatDate, parseDate } from '../utils/helpers'

export default function ChronoStream({ tasks, categories, difficulties, range, flowStateColor = '#8b5cf6', onDayClick, weekStartsOn = 1, isExporting = false, chartRef }) {
  const [hoverDay, setHoverDay] = useState(null)
  
  // Helper to check if a date is in the future
  const isFutureDate = (date) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return isAfter(date, today)
  }
  
  // Get today's date at midnight for comparisons
  const getTodayMidnight = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return today
  }
  
  // Determine date range based on prop
  const dateRange = useMemo(() => {
    const today = getTodayMidnight()
    
    if (range === 'week') {
      // Weekly: Monday to Sunday of current week
      const start = startOfWeek(today, { weekStartsOn: weekStartsOn || 1 })
      const end = endOfWeek(today, { weekStartsOn: weekStartsOn || 1 })
      return { start, end, type: 'week' }
    } else if (range === 'month') {
      // Monthly: First to last day of current month
      const start = startOfMonth(today)
      const end = endOfMonth(today)
      return { start, end, type: 'month' }
    } else if (range === 'all') {
      // All: From first logged task to last logged task only
      const dates = tasks.map(t => t.completion?.completedDate).filter(Boolean).sort()
      if (dates.length === 0) {
        return { start: today, end: today, type: 'all' }
      }
      const startDate = parseDate(dates[0])
      const endDate = parseDate(dates[dates.length - 1])
      return { start: startDate, end: endDate, type: 'all' }
    }
    // Default: last 7 days
    return { start: subDays(today, 6), end: today, type: 'default' }
  }, [range, tasks, weekStartsOn])
  
  // Transform data for Recharts area chart - single score per day
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
    const today = getTodayMidnight()
    
    return days.map(day => {
      const dayStr = formatDate(day)
      const daysTasks = tasks.filter(t => t.completion?.completedDate === dayStr)
      
      // Check if this day is in the future
      const dayMidnight = new Date(day)
      dayMidnight.setHours(0, 0, 0, 0)
      const isFuture = isAfter(dayMidnight, today)
      
      // For 'week' and 'month' views: future days get null score
      // For 'all' view: we don't have future days since range ends at last logged task
      if ((dateRange.type === 'week' || dateRange.type === 'month') && isFuture) {
        return {
          date: dayStr,
          dayName: format(day, 'EEE'),
          fullDate: format(day, 'MMM d'),
          score: null,
          count: 0,
          isFuture: true
        }
      }
      
      // Calculate total score for the day using the same logic as calculateDayScore
      let score = 0
      let fatigueMultiplier = 1
      const sortedTasks = [...daysTasks].sort((a, b) => {
        const aDiff = difficulties.find(d => d.id === a.completion?.difficultyId)?.score || 0
        const bDiff = difficulties.find(d => d.id === b.completion?.difficultyId)?.score || 0
        return bDiff - aDiff
      })
      
      sortedTasks.forEach((task, index) => {
        const difficulty = difficulties.find(d => d.id === task.completion?.difficultyId)
        const baseScore = difficulty?.score || 0
        score += baseScore * fatigueMultiplier
        fatigueMultiplier += 0.10 // Default fatigue increment
        if (fatigueMultiplier > 3.0) fatigueMultiplier = 3.0 // Default fatigue cap
      })
      
      // For past/current days with no data, score stays 0 (already initialized)
      
      return {
        date: dayStr,
        dayName: format(day, 'EEE'),
        fullDate: format(day, 'MMM d'),
        score,
        count: daysTasks.length,
        isFuture: false
      }
    })
  }, [tasks, difficulties, dateRange])
  
  // Use chartData directly - it already handles future dates with null scores
  const filteredData = chartData
  
  // Custom tooltip for dark theme
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dayData = filteredData.find(d => d.date === label || d.dayName === label)
      
      // Don't show tooltip for future days with null score
      if (dayData?.score === null) {
        return null
      }
      
      return (
        <div style={{
          background: 'var(--glass-bg)',
          backdropFilter: 'blur(var(--glass-blur)) saturate(1.2)',
          border: '1px solid var(--glass-border)',
          borderRadius: 'var(--radius-md)',
          padding: '12px',
          minWidth: '150px',
          boxShadow: 'var(--shadow-lg)'
        }}>
          <div style={{ 
            fontWeight: 600, 
            marginBottom: '8px',
            color: 'var(--text-primary)',
            fontSize: '13px'
          }}>
            {dayData?.fullDate || label}
          </div>
          <div style={{ 
            fontSize: '12px', 
            color: 'var(--text-secondary)',
            marginBottom: '4px'
          }}>
            Total Score: {(dayData?.score ?? 0).toFixed(1)}
          </div>
          <div style={{ 
            fontSize: '11px', 
            color: 'var(--text-primary)'
          }}>
            Tasks Completed: {dayData?.count || 0}
          </div>
        </div>
      )
    }
    return null
  }
  
  const chartColor = flowStateColor || '#8b5cf6'
  
  // Custom dot renderer for reliable click handling
  const renderDot = (props) => {
    const { cx, cy, payload, isActive } = props
    
    // Don't render dot if no tasks completed this day or if it's a future day
    if (!payload || payload.count === 0 || payload.isFuture) {
      return null
    }
    
    const radius = isActive ? 8 : 6
    
    return (
      <circle
        cx={cx}
        cy={cy}
        r={radius}
        fill={chartColor}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          if (onDayClick && payload) {
            onDayClick(
              parseDate(payload.date),
              tasks.filter(t => t.completion?.completedDate === payload.date)
            )
          }
        }}
      />
    )
  }
  
  // Export layout component
  const renderExportLayout = () => (
    <div ref={chartRef} style={{
      background: '#1a1a2e',
      padding: '30px',
      borderRadius: '16px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <h3 style={{ 
        color: '#fff', 
        margin: '0 0 20px 0', 
        fontSize: '20px',
        fontWeight: 600
      }}>
        Weekly Flow State Overview
      </h3>
      
      {/* Chart with labels */}
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart 
          data={filteredData}
          margin={{ top: 10, right: 40, left: 0, bottom: 10 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            dataKey="dayName" 
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            type="category"
          />
          <YAxis hide domain={[0, 'auto']} />
          <Area
            type="monotone"
            dataKey="score"
            stroke={chartColor}
            fill={chartColor}
            fillOpacity={0.4}
            connectNulls={false}
          >
            <LabelList 
              dataKey="score" 
              position="top" 
              fill="#fff" 
              fontSize={12}
              formatter={(value) => value != null ? value.toFixed(1) : ''}
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
      
      {/* Summary Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '12px',
        marginTop: '24px'
      }}>
        {filteredData.map((day) => (
          <div key={day.date} style={{
            background: 'rgba(255,255,255,0.05)',
            borderRadius: '8px',
            padding: '12px 8px',
            textAlign: 'center',
            border: '1px solid rgba(255,255,255,0.1)'
          }}>
            <div style={{
              fontSize: '11px',
              color: 'rgba(255,255,255,0.6)',
              marginBottom: '4px'
            }}>
              {day.dayName}
            </div>
            <div style={{
              fontSize: '12px',
              color: '#fff',
              fontWeight: 500,
              marginBottom: '4px'
            }}>
              {day.fullDate}
            </div>
            <div style={{
              fontSize: '18px',
              color: chartColor,
              fontWeight: 700,
              marginBottom: '4px'
            }}>
              {day.score != null ? day.score.toFixed(1) : '--'}
            </div>
            <div style={{
              fontSize: '10px',
              color: 'rgba(255,255,255,0.5)'
            }}>
              {day.count} task{day.count !== 1 ? 's' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // Normal view layout
  const renderNormalView = () => (
    <div className="chrono-stream-container" style={{ position: 'relative', cursor: hoverDay ? 'pointer' : 'default' }}>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart 
          data={filteredData}
          margin={{ top: 10, right: 40, left: 0, bottom: 10 }}
          onMouseMove={(state) => {
            const point = state?.activePayload?.[0]?.payload
            setHoverDay(point && point.count > 0 && !point.isFuture ? point : null)
          }}
          onMouseLeave={() => setHoverDay(null)}
          onClick={(state) => {
            const point = state?.activePayload?.[0]?.payload
            if (point && point.count > 0 && !point.isFuture && onDayClick) {
              onDayClick(
                parseDate(point.date),
                tasks.filter(t => t.completion?.completedDate === point.date)
              )
            }
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            dataKey="dayName" 
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            type="category"
          />
          <YAxis hide domain={[0, 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="score"
            stroke={chartColor}
            fill={chartColor}
            fillOpacity={0.4}
            dot={renderDot}
            activeDot={renderDot}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )

  if (filteredData.length === 0) {
    return (
      <div className="chrono-stream" style={{ 
        background: 'var(--bg-secondary)', 
        borderRadius: 'var(--radius-lg)',
        padding: '40px',
        textAlign: 'center',
        color: 'var(--text-muted)'
      }}>
        No data for this range
      </div>
    )
  }

  return isExporting ? renderExportLayout() : renderNormalView()
}
