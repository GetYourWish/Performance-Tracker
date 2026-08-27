// @performance-tracker/core — the single source of truth for every business
// rule the desktop and Android apps must agree on: scoring, schema gate,
// validation/healing, category derivation, dates, defaults, IDs.
//
// PURITY CONTRACT: this package must stay pure JavaScript. No fs/path/os or
// any other Node builtin, no Electron, no React, no react-native. Runtime
// dependencies allowed: date-fns and uuid only. Enforced by eslint.config.js
// (no-restricted-imports / no-restricted-globals) and CI.
//
// Dates enter scoring/validation as arguments; no Date.now() in logic paths.

const { generateId } = require('./src/ids')
const { sanitizeInput } = require('./src/sanitize')
const {
  getCurrentDate,
  formatDate,
  parseDate,
  getStartOfWeek,
  getEndOfWeek,
  getWeekNumber,
  getDaysInMonth
} = require('./src/dates')
const {
  fatigueMultiplier,
  calculateTaskScoreBreakdown,
  calculateDayScore,
  groupTasksByDate
} = require('./src/scoring')
const { getTaskCategory } = require('./src/categories')
const { createDefaultData } = require('./src/defaults')
const { checkSchemaVersion, validateAndHealData } = require('./src/schema')

module.exports = {
  // ids
  generateId,
  // sanitize
  sanitizeInput,
  // dates
  getCurrentDate,
  formatDate,
  parseDate,
  getStartOfWeek,
  getEndOfWeek,
  getWeekNumber,
  getDaysInMonth,
  // scoring (canonical)
  fatigueMultiplier,
  calculateTaskScoreBreakdown,
  calculateDayScore,
  groupTasksByDate,
  // categories
  getTaskCategory,
  // defaults
  createDefaultData,
  // schema
  checkSchemaVersion,
  validateAndHealData
}
