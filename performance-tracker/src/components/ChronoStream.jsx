import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { stack, stackOffsetWiggle, stackOrderInsideOut, area, curveCatmullRom } from 'd3-shape'
import { format, eachDayOfInterval, startOfDay, endOfDay, subDays } from 'date-fns'
import { formatDate } from '../utils/helpers'

export default function ChronoStream({ tasks, categories, difficulties, range }) {
  const [hoveredX, setHoveredX] = useState(null)
  
  // Determine date range based on prop
  const dateRange = useMemo(() => {
    const today = new Date()
    if (range === 'week') {
      return { start: subDays(today, 6), end: today }
    } else if (range === 'month') {
      return { start: subDays(today, 29), end: today }
    } else if (range === 'all') {
      // Find the earliest task date
      const dates = tasks.map(t => t.completion?.completedDate).filter(Boolean).sort()
      if (dates.length === 0) return { start: today, end: today }
      return { start: new Date(dates[0]), end: today }
    }
    return { start: subDays(today, 6), end: today }
  }, [range, tasks])
  
  // Bin tasks by day and category
  const binnedData = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end })
    const categoryIds = categories.filter(c => c.active !== false).map(c => c.id)
    
    // Initialize data structure for each day
    const dataByDay = days.map(day => {
      const dayStr = formatDate(day)
      const entry = { date: dayStr, day }
      categoryIds.forEach(catId => { entry[catId] = 0 })
      return entry
    })
    
    // Count tasks per day per category
    tasks.forEach(task => {
      if (!task.completion || !task.completion.completedDate) return
      const taskDate = task.completion.completedDate
      const catId = task.completion.categoryId
      if (!catId || !categoryIds.includes(catId)) return
      
      const dayEntry = dataByDay.find(d => d.date === taskDate)
      if (dayEntry) {
        dayEntry[catId] += 1
      }
    })
    
    return dataByDay
  }, [tasks, categories, dateRange])
  
  // Generate streamgraph using D3
  const { series, xScale, paths } = useMemo(() => {
    const categoryIds = categories.filter(c => c.active !== false).map(c => c.id)
    const categoryMap = new Map(categories.map(c => [c.id, c]))
    
    if (binnedData.length === 0 || categoryIds.length === 0) {
      return { series: [], xScale: () => 0, paths: [] }
    }
    
    // Create stack generator with wiggle offset for flowing effect
    const stackGen = stack()
      .keys(categoryIds)
      .offset(stackOffsetWiggle)
      .order(stackOrderInsideOut)
    
    const stackedData = stackGen(binnedData)
    
    // X scale: map day index to 0-100 SVG coordinate space
    const numDays = binnedData.length
    const xScaleFn = (dayIndex) => (dayIndex / Math.max(numDays - 1, 1)) * 100
    
    // Area generator with smooth curves
    const areaGen = area()
      .x((d, i) => xScaleFn(i))
      .y0(d => d[0])
      .y1(d => d[1])
      .curve(curveCatmullRom.alpha(0.5))
    
    // Generate path strings for each category layer
    const pathData = stackedData.map((layer, idx) => {
      const catId = layer.key
      const category = categoryMap.get(catId)
      const pathD = areaGen(layer)
      return {
        key: catId,
        color: category?.color || '#888',
        name: category?.name || 'Unknown',
        pathD,
        values: layer.map(d => ({ y0: d[0], y1: d[1] }))
      }
    })
    
    return { series: stackedData, xScale: xScaleFn, paths: pathData }
  }, [binnedData, categories])
  
  // Handle mouse movement for tooltip
  const handleMouseMove = (e) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = e.clientX - rect.left
    const normalizedX = x / rect.width
    setHoveredX(normalizedX)
  }
  
  const handleMouseLeave = () => {
    setHoveredX(null)
  }
  
  // Calculate tooltip data
  const tooltipData = useMemo(() => {
    if (hoveredX === null || binnedData.length === 0) return null
    
    const numDays = binnedData.length
    const dayIndex = Math.min(
      Math.max(Math.round(hoveredX * (numDays - 1)), 0),
      numDays - 1
    )
    const dayData = binnedData[dayIndex]
    if (!dayData) return null
    
    // Get tasks for this day
    const dayStr = dayData.date
    const daysTasks = tasks.filter(t => 
      t.completion?.completedDate === dayStr
    )
    
    return {
      date: dayData.day,
      dateStr: dayStr,
      tasks: daysTasks,
      xPercent: hoveredX * 100
    }
  }, [hoveredX, binnedData, tasks])
  
  if (paths.length === 0) {
    return (
      <div className="chrono-stream" style={{ 
        background: 'var(--bg-secondary)', 
        borderRadius: 'var(--radius-lg)',
        padding: '40px',
        textAlign: 'center',
        color: 'var(--text-muted)'
      }}>
        No completed tasks in this time range
      </div>
    )
  }
  
  return (
    <div className="chrono-stream-container" style={{ position: 'relative' }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="chrono-stream"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{
          width: '100%',
          height: '200px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          cursor: 'crosshair'
        }}
      >
        {paths.map((pathData) => (
          <motion.path
            key={pathData.key}
            d={pathData.pathD}
            fill={pathData.color}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.7 }}
            transition={{ duration: 0.5 }}
            style={{
              mixBlendMode: 'screen'
            }}
          />
        ))}
      </svg>
      
      {/* Tooltip */}
      {tooltipData && (
        <div
          className="chrono-stream-tooltip"
          style={{
            position: 'absolute',
            left: `${tooltipData.xPercent}%`,
            top: '10px',
            transform: 'translateX(-50%)',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur)) saturate(1.2)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            padding: '12px',
            minWidth: '180px',
            maxWidth: '250px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 100,
            pointerEvents: 'none'
          }}
        >
          <div style={{ 
            fontWeight: 600, 
            marginBottom: '8px',
            color: 'var(--text-primary)',
            fontSize: '13px'
          }}>
            {format(tooltipData.date, 'EEE, MMM d')}
          </div>
          <div style={{ 
            fontSize: '12px', 
            color: 'var(--text-secondary)',
            marginBottom: '4px'
          }}>
            {tooltipData.tasks.length} task{tooltipData.tasks.length !== 1 ? 's' : ''} completed
          </div>
          {tooltipData.tasks.slice(0, 3).map(task => {
            const category = categories.find(c => c.id === task.completion?.categoryId)
            return (
              <div 
                key={task.id}
                style={{
                  fontSize: '11px',
                  color: 'var(--text-primary)',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                {category && (
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: category.color,
                      flexShrink: 0
                    }}
                  />
                )}
                {task.text}
              </div>
            )
          })}
          {tooltipData.tasks.length > 3 && (
            <div style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              marginTop: '4px'
            }}>
              +{tooltipData.tasks.length - 3} more
            </div>
          )}
        </div>
      )}
    </div>
  )
}
