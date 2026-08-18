import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { format, eachDayOfInterval, subDays } from 'date-fns'
import { formatDate, parseDate } from '../utils/helpers'

export default function ChronoStream({ tasks, categories, difficulties, range, flowStateColor = '#8b5cf6', onDayClick }) {
  // Determine date range based on prop
  const dateRange = useMemo(() => {
    const today = new Date()
    if (range === 'week') {
      return { start: subDays(today, 6), end: today }
    } else if (range === 'month') {
      return { start: subDays(today, 29), end: today }
    } else if (range === 'all') {
      const dates = tasks.map(t => t.completion?.completedDate).filter(Boolean).sort()
      if (dates.length === 0) return { start: today, end: today }
      return { start: new Date(dates[0]), end: today }
    }
    return { start: subDays(today, 6), end: today }
  }, [range, tasks])
  
  // Transform data for Recharts area chart - single score per day
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
    
    return days.map(day => {
      const dayStr = formatDate(day)
      const daysTasks = tasks.filter(t => t.completion?.completedDate === dayStr)
      
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
      
      return {
        date: dayStr,
        dayName: format(day, 'EEE'),
        fullDate: format(day, 'MMM d'),
        score,
        count: daysTasks.length
      }
    })
  }, [tasks, difficulties, dateRange])
  
  // Filter out future dates and ensure we stop at today
  const filteredData = useMemo(() => {
    const today = new Date()
    today.setHours(23, 59, 59, 999)
    return chartData.filter(d => new Date(d.date) <= today)
  }, [chartData])
  
  // Custom tooltip for dark theme
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dayData = filteredData.find(d => d.date === label || d.dayName === label)
      
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
            Total Score: {dayData?.score.toFixed(1) || 0}
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
  
  return (
    <div className="chrono-stream-container" style={{ position: 'relative' }}>
      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={filteredData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            dataKey="dayName" 
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            type="category"
          />
          <YAxis 
            hide
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="score"
            stroke={chartColor}
            fill={chartColor}
            fillOpacity={0.4}
            dot={(props) => {
              const { cx, cy, payload } = props;
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={payload.count > 0 ? 4 : 2}
                  fill={chartColor}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth={1}
                  style={{ cursor: payload.count > 0 ? 'pointer' : 'default' }}
                  onClick={() => {
                    if (payload.count > 0 && onDayClick) {
                      const clickedDate = parseDate(payload.date);
                      const dayTasks = tasks.filter(t => t.completion?.completedDate === payload.date);
                      onDayClick(clickedDate, dayTasks);
                    }
                  }}
                />
              );
            }}
            activeDot={{ 
              r: 6,
              onClick: (e) => {
                const payload = e.payload;
                if (payload.count > 0 && onDayClick) {
                  const clickedDate = parseDate(payload.date);
                  const dayTasks = tasks.filter(t => t.completion?.completedDate === payload.date);
                  onDayClick(clickedDate, dayTasks);
                }
              }
            }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
