#!/usr/bin/env node
/**
 * Session Tracker - Unified Entry Point
 *
 * Detects hook event type from arguments or stdin and routes
 * to appropriate handler (start.js or end.js).
 *
 * Usage:
 *   node main.js start   - Run start handler
 *   node main.js end     - Run end handler
 */

const action = process.argv[2];

switch (action) {
  case 'start':
    require('./start');
    break;
  case 'end':
    require('./end');
    break;
  default:
    console.error('Usage: session-tracker/main.js <start|end>');
    process.exit(1);
}
