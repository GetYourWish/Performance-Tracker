import { useMemo, useState } from 'react'
import { format } from 'date-fns'

export default function HeatmapSkyline({ heatmapData, categories }) {
  const [hoveredCell, setHoveredCell] = useState(null)
  
  // Calculate dominant color for each day based on most frequent category
  const heatmapWithColors = useMemo(() => {
    return heatmapData.map(cell => {
      if (cell.value === 0 || !cell.tasks || cell.tasks.length === 0) {
        return { ...cell, dominantColor: 'var(--bg-tertiary)' }
      }
      
      // Count tasks per category
      const categoryCount = new Map()
      cell.tasks.forEach(task => {
        const catId = task.completion?.categoryId
        if (catId) {
          categoryCount.set(catId, (categoryCount.get(catId) || 0) + 1)
        }
      })
      
      // Find the category with most tasks
      let maxCount = 0
      let dominantCatId = null
      categoryCount.forEach((count, catId) => {
        if (count > maxCount) {
          maxCount = count
          dominantCatId = catId
        }
      })
      
      const dominantCategory = categories.find(c => c.id === dominantCatId)
      const dominantColor = dominantCategory ? dominantCategory.color : 'var(--bg-tertiary)'
      
      return { ...cell, dominantColor }
    })
  }, [heatmapData, categories])
  
  // Group days into weeks for grid layout
  const weeks = useMemo(() => {
    const result = []
    let currentWeek = []
    
    heatmapWithColors.forEach((cell, index) => {
      const dayOfWeek = cell.day.getDay()
      // Adjust for week starting on Monday (1) vs Sunday (0)
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      
      if (adjustedDay === 0 && currentWeek.length > 0) {
        result.push(currentWeek)
        currentWeek = []
      }
      currentWeek.push({ ...cell, index })
      
      if (index === heatmapWithColors.length - 1) {
        result.push(currentWeek)
      }
    })
    
    return result
  }, [heatmapWithColors])
  
  const handleCellHover = (cell, event) => {
    const rect = event.currentTarget.getBoundingClientRect()
    setHoveredCell({
      cell,
      x: rect.left + rect.width / 2,
      y: rect.top
    })
  }
  
  const handleCellLeave = () => {
    setHoveredCell(null)
  }
  
  return (
    <div className="heatmap-skyline-container" style={{ position: 'relative' }}>
      {/* 3D Container */}
      <div
        className="skyline-3d-container"
        style={{
          transform: 'perspective(1200px) rotateX(55deg) rotateZ(45deg)',
          transformStyle: 'preserve-3d',
          width: '100%',
          height: '400px',
          overflow: 'visible',
          position: 'relative',
          margin: '40px 0',
          padding: '20px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)'
        }}
      >
        <div
          className="skyline-grid"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '4px',
            transformStyle: 'preserve-3d',
            maxWidth: '100%',
            margin: '0 auto'
          }}
        >
          {heatmapWithColors.map((cell, index) => {
            // Clamp bar height: 1 point = 10px, max 150px, fallback 4px if value is 0
            const barHeight = cell.value === 0 ? 4 : Math.min((cell.value * 10), 150)
            
            return (
              <div
                key={index}
                className="skyline-bar-wrapper"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  width: '12px',
                  height: '160px',
                  position: 'relative'
                }}
                onMouseEnter={(e) => handleCellHover(cell, e)}
                onMouseLeave={handleCellLeave}
              >
                {/* 3D Bar with extrusion effect */}
                <div
                  className="skyline-bar"
                  style={{
                    width: '100%',
                    height: `${barHeight}px`,
                    backgroundColor: cell.dominantColor,
                    borderRadius: '2px 2px 0 0',
                    transition: 'height 0.5s ease, background-color 0.5s ease',
                    transformStyle: 'preserve-3d',
                    transform: 'translateZ(0)',
                    boxShadow: cell.value > 0 
                      ? `0 0 8px ${cell.dominantColor}50, inset 0 1px 0 rgba(255,255,255,0.3), 
                         2px 2px 4px rgba(0,0,0,0.3)`
                      : 'none',
                    position: 'relative'
                  }}
                >
                  {/* Front face highlight for 3D effect */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      height: '3px',
                      background: 'rgba(0,0,0,0.2)',
                      borderRadius: '0 0 2px 2px'
                    }}
                  />
                  {/* Top face highlight */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      height: '2px',
                      background: 'rgba(255,255,255,0.3)',
                      borderRadius: '2px 2px 0 0'
                    }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
      
      {/* Month labels */}
      <div
        className="skyline-months"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 20px',
          marginTop: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}
      >
        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
          <span key={month}>{month}</span>
        ))}
      </div>
      
      {/* 2D Tooltip Overlay */}
      {hoveredCell && hoveredCell.cell.value > 0 && (
        <div
          className="skyline-tooltip"
          style={{
            position: 'fixed',
            left: hoveredCell.x,
            top: hoveredCell.y - 10,
            transform: 'translate(-50%, -100%)',
            background: 'var(--glass-bg)',
            backdropFilter: 'blur(var(--glass-blur)) saturate(1.2)',
            border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            minWidth: '150px',
            boxShadow: 'var(--shadow-lg)',
            zIndex: 1000,
            pointerEvents: 'none'
          }}
        >
          <div style={{ 
            fontWeight: 600, 
            marginBottom: '4px',
            color: 'var(--text-primary)',
            fontSize: '12px'
          }}>
            {format(hoveredCell.cell.day, 'EEE, MMM d, yyyy')}
          </div>
          <div style={{ 
            fontSize: '11px', 
            color: 'var(--text-secondary)'
          }}>
            Score: {hoveredCell.cell.value.toFixed(1)}
          </div>
          {hoveredCell.cell.tasks && hoveredCell.cell.tasks.length > 0 && (
            <div style={{ 
              fontSize: '11px', 
              color: 'var(--text-muted)',
              marginTop: '4px'
            }}>
              {hoveredCell.cell.tasks.length} task{hoveredCell.cell.tasks.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
