import { useState } from 'react'
import { getCurrentDate } from '../utils/helpers'

function CompletionPopup({ task, difficulties, onConfirm, onCancel }) {
  const [selectedDifficulty, setSelectedDifficulty] = useState(null)
  const [date, setDate] = useState(getCurrentDate())
  const [note, setNote] = useState('')

  const activeDifficulties = difficulties.filter(d => d.active !== false)

  const handleConfirm = () => {
    if (!selectedDifficulty) return

    onConfirm({
      taskId: task.id,
      difficultyId: selectedDifficulty,
      date,
      note
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && selectedDifficulty) {
      handleConfirm()
    } else if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    <div className="popup-overlay" onKeyDown={handleKeyDown}>
      <div className="completion-popup">
        <h3>Complete Task</h3>
        
        <div className="task-text">{task.text}</div>

        <div className="form-group">
          <label>Difficulty</label>
          <div className="difficulty-selector">
            {activeDifficulties.map(difficulty => (
              <button
                key={difficulty.id}
                className={`difficulty-chip ${selectedDifficulty === difficulty.id ? 'selected' : ''}`}
                style={{ 
                  backgroundColor: selectedDifficulty === difficulty.id ? difficulty.color : 'transparent',
                  color: selectedDifficulty === difficulty.id ? '#fff' : difficulty.color,
                  borderColor: difficulty.color
                }}
                onClick={() => setSelectedDifficulty(difficulty.id)}
              >
                {difficulty.label} ({difficulty.score})
              </button>
            ))}
          </div>
        </div>

        <div className="form-group">
          <label>Date Completed</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="date-input"
          />
        </div>

        <div className="form-group">
          <label>Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add a short note..."
            rows={2}
            className="note-input"
          />
        </div>

        <div className="popup-actions">
          <button 
            className="btn-cancel"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="btn-confirm"
            onClick={handleConfirm}
            disabled={!selectedDifficulty}
          >
            Complete
          </button>
        </div>
      </div>
    </div>
  )
}

export default CompletionPopup
