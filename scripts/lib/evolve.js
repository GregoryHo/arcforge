/**
 * Evolve — Type classification, name generation, templates, tracking
 *
 * Evolves instinct clusters into skills, commands, or agents.
 * Inspired by continuous-learning-v2's cmd_evolve().
 */

const fs = require('node:fs');
const path = require('node:path');

const { buildTriggerFingerprint } = require('./fingerprint');

// ─────────────────────────────────────────────
// Instinct Accessors
// ─────────────────────────────────────────────

/** Resolve trigger text from instinct (top-level or nested in frontmatter). */
function getTrigger(inst) {
  return inst.trigger || inst.frontmatter?.trigger || '';
}

/** Resolve confidence from instinct (top-level or nested in frontmatter). */
function getConfidence(inst) {
  return inst.confidence || inst.frontmatter?.confidence || 0;
}

// ─────────────────────────────────────────────
// Type Classification
// ─────────────────────────────────────────────

const COMMAND_DOMAINS = new Set(['workflow', 'automation']);

const BEHAVIORAL_KEYWORDS = new Set(['always', 'prefer', 'avoid', 'never', 'before']);
const ACTION_PREFIXES = ['when starting', 'when running', 'when creating', 'when i need'];

/**
 * Classify a cluster into skill, command, or agent.
 *
 * Primary rules (checked in order, first match wins):
 * 1. workflow/automation domain + avg confidence >= 0.7 → command
 * 2. size >= 3 + avg confidence >= 0.75 → agent
 * 3. Default → skill
 *
 * Tiebreaker: keyword ratio (behavioral vs action tokens).
 */
function classifyCluster(cluster) {
  const items = cluster.items || [];
  const domain = cluster.domain || '';
  const reasons = [];

  const avgConfidence =
    items.length > 0 ? items.reduce((sum, i) => sum + getConfidence(i), 0) / items.length : 0;

  // Primary rule 1: workflow/automation domain + high confidence → command
  if (COMMAND_DOMAINS.has(domain) && avgConfidence >= 0.7) {
    reasons.push(`Domain "${domain}" with avg confidence ${avgConfidence.toFixed(2)} >= 0.7`);
    return { type: 'command', confidence: avgConfidence, reasons };
  }

  // Primary rule 2: 3+ instincts + very high confidence → agent
  if (items.length >= 3 && avgConfidence >= 0.75) {
    reasons.push(
      `Cluster size ${items.length} >= 3 with avg confidence ${avgConfidence.toFixed(2)} >= 0.75`,
    );
    return { type: 'agent', confidence: avgConfidence, reasons };
  }

  // Tiebreaker: keyword ratio
  const allTriggers = items
    .map((i) => getTrigger(i))
    .join(' ')
    .toLowerCase();
  const tokens = allTriggers.split(/\s+/);

  let behavioralCount = 0;
  let actionCount = 0;

  for (const token of tokens) {
    if (BEHAVIORAL_KEYWORDS.has(token)) behavioralCount++;
  }

  for (const prefix of ACTION_PREFIXES) {
    const regex = new RegExp(prefix, 'gi');
    const matches = allTriggers.match(regex);
    if (matches) actionCount += matches.length;
  }

  if (actionCount > 0 && behavioralCount > 0) {
    if (behavioralCount > actionCount * 2) {
      reasons.push(
        `Keyword tiebreaker: ${behavioralCount} behavioral vs ${actionCount} action → skill`,
      );
      return { type: 'skill', confidence: avgConfidence, reasons };
    }
    if (actionCount > behavioralCount * 2) {
      reasons.push(
        `Keyword tiebreaker: ${actionCount} action vs ${behavioralCount} behavioral → command`,
      );
      return { type: 'command', confidence: avgConfidence, reasons };
    }
  }

  // Default → skill
  reasons.push('Default classification: skill');
  return { type: 'skill', confidence: avgConfidence, reasons };
}

// ─────────────────────────────────────────────
// Name Generation
// ─────────────────────────────────────────────

/**
 * Generate a name from a cluster's triggers.
 *
 * For single-instinct clusters: clean the trigger directly.
 * For multi-instinct clusters: use most common tokens via buildTriggerFingerprint.
 */
function generateName(cluster, type) {
  const items = cluster.items || [];
  let raw = '';

  if (items.length === 1) {
    raw = getTrigger(items[0]) || items[0].id || '';
  } else {
    // Collect all trigger tokens, find most frequent
    const tokenCounts = {};
    for (const item of items) {
      const fp = buildTriggerFingerprint(getTrigger(item));
      for (const token of fp) {
        tokenCounts[token] = (tokenCounts[token] || 0) + 1;
      }
    }

    // Sort by frequency descending, take top 3
    const sorted = Object.entries(tokenCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([token]) => token);

    raw = sorted.join(' ');
  }

  // Clean: strip leading "when ", sanitize to kebab-case
  let cleaned = raw
    .toLowerCase()
    .replace(/^when\s+/i, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  // Truncate to 30 chars (accounting for arc- prefix for skills)
  const maxLen = type === 'skill' ? 26 : 30; // arc- is 4 chars
  if (cleaned.length > maxLen) {
    cleaned = cleaned.substring(0, maxLen).replace(/-+$/, '');
  }

  if (!cleaned) {
    cleaned = (cluster.domain || 'evolved').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  return type === 'skill' ? `arc-${cleaned}` : cleaned;
}

// ─────────────────────────────────────────────
// Templates
// ─────────────────────────────────────────────

/**
 * Generate a skill SKILL.md from a cluster.
 */
function generateSkill(cluster, name) {
  const items = cluster.items || [];
  const domain = cluster.domain || 'uncategorized';
  const triggers = items.map(getTrigger).filter(Boolean);

  // Build description: "Use when <common prefix>. Covers: <unique suffixes>"
  const commonPrefix = triggers.length > 0 ? triggers[0].replace(/^when\s+/i, '') : domain;
  const uniqueSuffixes = triggers
    .slice(1)
    .map((t) => t.replace(/^when\s+/i, ''))
    .join(', ');

  let description = `Use when ${commonPrefix}`;
  if (uniqueSuffixes) {
    description += `. Covers: ${uniqueSuffixes}`;
  }
  if (description.length > 1024) {
    description = `${description.substring(0, 1021)}...`;
  }

  const triggerBullets = triggers.map((t) => `- ${t}`).join('\n');
  const instinctBodies = items
    .map((i) => i.body || '')
    .filter(Boolean)
    .join('\n\n---\n\n');
  const sourceList = items
    .map((i) => `- ${i.id} (${Math.round(getConfidence(i) * 100)}%)`)
    .join('\n');

  const content = `---
name: ${name}
description: "${description}"
---
<!-- Generated scaffold — refine before deployment -->

## Overview
Evolved from ${items.length} instincts in the ${domain} domain.

## When to Use
${triggerBullets}

## Key Patterns
${instinctBodies}

## Source Instincts
${sourceList}
`;

  return {
    path: `skills/${name}/SKILL.md`,
    content,
    type: 'skill',
  };
}

/**
 * Generate a command .md from a cluster.
 * Commands always produce a backing skill too (arcforge convention).
 */
function generateCommand(cluster, cmdName, skillName) {
  const domain = cluster.domain || 'uncategorized';
  const triggers = (cluster.items || []).map(getTrigger).filter(Boolean);

  const description =
    triggers.length > 0 ? triggers[0].replace(/^when\s+/i, '') : `${domain} automation`;

  const content = `---
description: "${description}"
disable-model-invocation: true
---
Invoke the ${skillName} skill and follow it exactly as presented to you
`;

  return {
    path: `commands/${cmdName}.md`,
    content,
    type: 'command',
  };
}

/**
 * Generate an agent .md from a cluster.
 */
function generateAgent(cluster, name) {
  const items = cluster.items || [];
  const domain = cluster.domain || 'uncategorized';
  const triggers = items.map(getTrigger).filter(Boolean);

  const description =
    triggers.length > 0
      ? triggers.map((t) => t.replace(/^when\s+/i, '')).join(', ')
      : `${domain} specialist`;

  // Derive workflow steps from instinct action sections
  const actions = items
    .map((i) => {
      const match = (i.body || '').match(/## Action\n+([\s\S]*?)(?=\n##|$)/);
      return match ? match[1].trim() : null;
    })
    .filter(Boolean);

  const workflowSteps =
    actions.length > 0
      ? actions.map((a, idx) => `${idx + 1}. ${a}`).join('\n')
      : '1. Analyze the task\n2. Execute the appropriate pattern\n3. Verify results';

  const content = `---
name: ${name}
description: "${description}"
model: inherit
---
<!-- Generated scaffold — refine before deployment -->

## Role
Specialized agent for the ${domain} domain.

## Workflow
${workflowSteps}

## Source Instincts
${items.map((i) => `- ${i.id}`).join('\n')}
`;

  return {
    path: `agents/${name}.md`,
    content,
    type: 'agent',
  };
}

// ─────────────────────────────────────────────
// Evolution Tracking
// ─────────────────────────────────────────────

/**
 * Record an evolution event to the JSONL log.
 */
function recordEvolution(entry, logPath) {
  const dir = path.dirname(logPath);
  fs.mkdirSync(dir, { recursive: true });

  const record = {
    ...entry,
    timestamp: new Date().toISOString(),
  };

  fs.appendFileSync(logPath, `${JSON.stringify(record)}\n`, 'utf-8');
}

/**
 * Read all evolution log entries.
 */
function readEvolutionLog(logPath) {
  if (!fs.existsSync(logPath)) return [];

  const content = fs.readFileSync(logPath, 'utf-8').trim();
  if (!content) return [];

  return content
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * Check if a set of instinct IDs has already been evolved.
 */
function isAlreadyEvolved(instinctIds, logPath) {
  const entries = readEvolutionLog(logPath);
  const idSet = new Set(instinctIds);

  return entries.some((entry) => {
    const entrySet = new Set(entry.instincts || []);
    if (entrySet.size !== idSet.size) return false;
    for (const id of idSet) {
      if (!entrySet.has(id)) return false;
    }
    return true;
  });
}

module.exports = {
  classifyCluster,
  generateName,
  generateSkill,
  generateCommand,
  generateAgent,
  recordEvolution,
  readEvolutionLog,
  isAlreadyEvolved,
};
