const UNITS = { s: 1000, m: 60 * 1000 };

function parseDuration(text) {
  const match = /^(\d+)([a-z])$/.exec(String(text).trim());
  if (!match) throw new Error(`bad duration: ${text}`);
  const unit = UNITS[match[2]];
  if (!unit) throw new Error(`unknown unit: ${match[2]}`);
  return Number(match[1]) * unit;
}

module.exports = { parseDuration };
