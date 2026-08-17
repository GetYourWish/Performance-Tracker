import { useMemo, useState } from 'react'
import { format } from 'date-fns'

export default function HeatmapGrid({ heatmapData, categories }) {
  const [hoveredCell, setHoveredCell] = useState(null)
  
  // GitHub-style color scale
  const getCellColor = (value) => {
    if (value === 0) return '#161b22'  // Empty cell (dark gray)
    if (value < 0.5) return '#0e4429'  // Lowest
    if (value < 1.5) return '#006d32'  // Low
    if (value < 2.5) return '#26a641'  // Medium
    return '#39d353'                   // High
  }
  
  // Group days into weeks for grid layout (7 rows x ~52 columns)
  const weeks = useMemo(() => {
    const result = []
    let currentWeek = []
    
    heatmapData.forEach((cell, index) => {
      const dayOfWeek = cell.day.getDay()
      // Adjust for week starting on Monday (1) vs Sunday (0)
      const adjustedDay = dayOfWeek === 0 ? 6 : dayOfWeek - 1
      
      if (adjustedDay === 0 && currentWeek.length > 0) {
        result.push(currentWeek)
        currentWeek = []
      }
      currentWeek.push(cell)
      
      if (index === heatmapData.length - 1) {
        result.push(currentWeek)
      }
    })
    
    return result
  }, [heatmapData])
  
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
    <div className="heatmap-grid-container" style={{ position: 'relative' }}>
      {/* Flat GitHub-style heatmap */}
      <div
        className="heatmap-flat-grid"
        style={{
          display: 'grid',
          gridTemplateRows: 'repeat(7, 1fr)',
          gridAutoFlow: 'column',
          gap: '3px',
          padding: '16px',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          width: 'fit-content',
          maxWidth: '100%'
        }}
      >
        {heatmapData.map((cell, index) => {
          const bgColor = getCellColor(cell.value)
          
          return (
            <div
              key={index}
              className="heatmap-cell"
              style={{
                width: '12px',
                height: '12px',
                borderRadius: '2px',
                backgroundColor: bgColor,
                cursor: 'pointer',
                transition: 'transform 0.1s ease'
              }}
              onMouseEnter={(e) => handleCellHover(cell, e)}
              onMouseLeave={handleCellLeave}
            />
          )
        })}
      </div>
      
      {/* Month labels */}
      <div
        className="heatmap-months"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '0 16px',
          marginTop: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}
      >
        {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(month => (
          <span key={month}>{month}</span>
        ))}
      </div>
      
      {/* Legend */}
      <div
        className="heatmap-legend"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '4px',
          padding: '0 16px',
          marginTop: '8px',
          fontSize: '11px',
          color: 'var(--text-muted)'
        }}
      >
        <span>Less</span>
        {[0, 0.5, 1.5, 2.5].map((threshold, i) => (
          <div
            key={i}
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '2px',
              backgroundColor: getCellColor(threshold)
            }}
          />
        ))}
        <span>More</span>
      </div>
      
      {/* Tooltip */}
      {hoveredCell && hoveredCell.cell.value > 0 && (
        <div
          className="heatmap-tooltip"
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
            {hoveredCell.cell.count || hoveredCell.cell.value} task{hoveredCell.cell.tasks?.length !== 1 ? 's' : ''} completed
          </div>
        </div>
      )}
      
      {/* Empty tooltip for zero-value cells */}
      {hoveredCell && hoveredCell.cell.value === 0 && (
        <div
          className="heatmap-tooltip"
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
            color: 'var(--text-muted)'
          }}>
            No tasks completed
          </div>
        </div>
      )}
    </div>
  )
}
