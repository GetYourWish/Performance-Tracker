// defaults.js — the canonical default data structure.
// Documented in packages/core/SCHEMA.md; every client creates files exactly
// like this one.
const { generateId } = require('./ids')

// Create default data structure
function createDefaultData() {
  return {
    schemaVersion: 1,
    meta: {
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    settings: {
      theme: 'system',
      weekStartsOn: 1, // Monday
      heatmapMode: 'score',
      fatigueIncrement: 0.10,
      fatigueCap: 3.0
    },
    difficulties: [
      { id: generateId(), label: 'Easy', score: 1, color: '#4ade80', order: 0, active: true },
      { id: generateId(), label: 'Medium', score: 2, color: '#fbbf24', order: 1, active: true },
      { id: generateId(), label: 'Hard', score: 3, color: '#f87171', order: 2, active: true },
      { id: generateId(), label: 'Very Hard', score: 5, color: '#dc2626', order: 3, active: true }
    ],
    categories: [],
    markers: [],
    board: [],
    tasks: []
  }
}

module.exports = { createDefaultData }
