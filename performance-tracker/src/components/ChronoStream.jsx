import { useMemo, useState } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { format, eachDayOfInterval, subDays } from 'date-fns'
import { formatDate } from '../utils/helpers'

export default function ChronoStream({ tasks, categories, difficulties, range }) {
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
  
  // Transform data for Recharts stacked area chart
  const chartData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
    const activeCategories = categories.filter(c => c.active !== false)
    const categoryIds = activeCategories.map(c => c.id)
    
    return days.map(day => {
      const dayStr = formatDate(day)
      const entry = {
        date: dayStr,
        dayName: format(day, 'EEE'),
        fullDate: format(day, 'MMM d')
      }
      
      // Count tasks per category for this day
      activeCategories.forEach(cat => {
        const count = tasks.filter(t => 
          t.completion?.completedDate === dayStr && 
          t.completion?.categoryId === cat.id
        ).length
        entry[cat.name] = count
      })
      
      return entry
    })
  }, [tasks, categories, dateRange])
  
  const activeCategories = useMemo(() => 
    categories.filter(c => c.active !== false), 
    [categories]
  )
  
  // Custom tooltip for dark theme
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      const dayData = chartData.find(d => d.date === label || d.dayName === label)
      const totalTasks = activeCategories.reduce((sum, cat) => {
        return sum + (dayData?.[cat.name] || 0)
      }, 0)
      
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
            {totalTasks} task{totalTasks !== 1 ? 's' : ''} completed
          </div>
          {activeCategories.map(cat => {
            const count = dayData?.[cat.name] || 0
            if (count === 0) return null
            return (
              <div key={cat.id} style={{
                fontSize: '11px',
                color: 'var(--text-primary)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                marginTop: '4px'
              }}>
                <span style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor: cat.color
                }} />
                {cat.name}: {count}
              </div>
            )
          })}
        </div>
      )
    }
    return null
  }
  
  if (chartData.length === 0 || activeCategories.length === 0) {
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
        <AreaChart data={chartData}>
          <defs>
            {activeCategories.map(cat => (
              <linearGradient key={cat.id} id={`color-${cat.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={cat.color} stopOpacity={0.8}/>
                <stop offset="95%" stopColor={cat.color} stopOpacity={0.3}/>
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis 
            dataKey="dayName" 
            tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          />
          <YAxis 
            hide
          />
          <Tooltip content={<CustomTooltip />} />
          {activeCategories.map(cat => (
            <Area
              key={cat.id}
              type="monotone"
              dataKey={cat.name}
              stackId="1"
              stroke={cat.color}
              fill={cat.color}
              fillOpacity={0.6}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
