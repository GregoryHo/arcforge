/**
 * shared.js - Helpers shared between cli.js and the cli/*-command.js handlers.
 */

// Format output based on --json flag
function output(data, asJson = false) {
  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
  } else {
    if (typeof data === 'string') {
      console.log(data);
    } else {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

module.exports = { output };
