#!/usr/bin/env node
/**
 * Session Summary Generator
 *
 * Generates human-readable Markdown summaries from session JSON data.
 * Uses template format forked from everything-claude-code style.
 * Creates editable templates for Claude to fill in session reflections.
 */

/**
 * Calculate duration in minutes between two ISO timestamps
 */
function calculateDurationMinutes(startISO, endISO) {
  if (!startISO || !endISO) return null;
  const durationMs = new Date(endISO) - new Date(startISO);
  return Math.round(durationMs / 60000);
}

/**
 * Format ISO timestamp to time-only string (HH:MM)
 */
function formatTime(isoString) {
  if (!isoString) return 'unknown';
  return isoString.split('T')[1].substring(0, 5);
}

/**
 * Format ISO timestamp to date string (YYYY-MM-DD)
 */
function formatDate(isoString) {
  if (!isoString) return 'unknown';
  return isoString.split('T')[0];
}

/**
 * Generate Markdown summary from session data
 * Uses new template format with editable sections
 *
 * @param {Object} session - Session data object
 * @param {string} session.sessionId - Unique session identifier
 * @param {string} session.project - Project name
 * @param {string} session.date - Session date (YYYY-MM-DD)
 * @param {string} session.started - ISO timestamp of session start
 * @param {string} session.lastUpdated - ISO timestamp of last update
 * @param {number} session.toolCalls - Number of tool calls
 * @param {string[]} session.filesModified - List of modified files
 * @param {string[]} session.compactions - List of compaction timestamps
 * @returns {string} Markdown summary
 */
function generateMarkdownSummary(session) {
  const lines = [];

  // Header
  const dateDisplay = session.date || formatDate(session.started);
  lines.push(`# Session: ${dateDisplay}`);
  lines.push(`**Project:** ${session.project}`);
  if (session.sessionId) {
    lines.push(`**Session ID:** ${session.sessionId}`);
  }
  lines.push(`**Started:** ${formatTime(session.started)}`);
  lines.push(`**Last Updated:** ${formatTime(session.lastUpdated)}`);
  lines.push('');
  lines.push('---');
  lines.push('');

  // Current State section (placeholder for Claude to fill)
  lines.push('## Current State');
  lines.push('');

  // Metrics summary
  const duration = calculateDurationMinutes(session.started, session.lastUpdated);
  if (duration !== null && duration > 0) {
    lines.push(`Duration: ~${duration} minutes`);
  }
  lines.push(`Tool calls: ${session.toolCalls || 0}`);
  const compactionCount = (session.compactions || []).length;
  if (compactionCount > 0) {
    lines.push(`Compactions: ${compactionCount}`);
  }
  lines.push('');

  // Editable sections (placeholders)
  lines.push('### Completed');
  lines.push('- [ ]');
  lines.push('');

  lines.push('### In Progress');
  lines.push('- [ ]');
  lines.push('');

  lines.push('### Notes for Next Session');
  lines.push('-');
  lines.push('');

  // Context to Load section
  lines.push('### Context to Load');
  lines.push('```');
  if (session.filesModified?.length > 0) {
    lines.push(session.filesModified.join('\n'));
  }
  lines.push('```');

  // Compaction Timeline (if any)
  if (session.compactions && session.compactions.length > 0) {
    lines.push('');
    lines.push('### Compaction Timeline');
    for (let i = 0; i < session.compactions.length; i++) {
      lines.push(`${i + 1}. ${formatTime(session.compactions[i])} - Compaction`);
    }
  }

  return lines.join('\n');
}

// Export for use by end.js
module.exports = {
  generateMarkdownSummary,
  calculateDurationMinutes,
  formatTime,
  formatDate,
};
