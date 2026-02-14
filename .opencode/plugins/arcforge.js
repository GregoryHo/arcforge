/**
 * arcforge plugin for OpenCode.ai
 *
 * Uses experimental.chat.system.transform for reliable context injection.
 * Skills are discovered natively via symlink — no custom tools needed.
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Extract YAML frontmatter from a skill file.
 * Only needs to parse arc-using for bootstrap injection.
 */
function extractFrontmatter(content) {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let name = '';
  let description = '';

  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) break;
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      const match = line.match(/^(\w+):\s*(.*)$/);
      if (match) {
        const [, key, value] = match;
        if (key === 'name') name = value.trim();
        if (key === 'description') description = value.trim();
      }
    }
  }

  return { name, description };
}

/**
 * Strip YAML frontmatter, returning just the content.
 */
function stripFrontmatter(content) {
  const lines = content.split('\n');
  let inFrontmatter = false;
  let frontmatterEnded = false;
  const contentLines = [];

  for (const line of lines) {
    if (line.trim() === '---') {
      if (inFrontmatter) { frontmatterEnded = true; continue; }
      inFrontmatter = true;
      continue;
    }
    if (frontmatterEnded || !inFrontmatter) {
      contentLines.push(line);
    }
  }

  return contentLines.join('\n').trim();
}

function getBootstrapContent() {
  const usingPath = path.resolve(__dirname, '../../skills/arc-using/SKILL.md');
  if (!fs.existsSync(usingPath)) return null;

  const fullContent = fs.readFileSync(usingPath, 'utf8');
  const content = stripFrontmatter(fullContent);

  return `<EXTREMELY_IMPORTANT>
You have arcforge skills.

${content}
</EXTREMELY_IMPORTANT>`;
}

export default {
  name: 'arcforge',
  version: '1.1.2',

  'experimental.chat.system.transform': async (_input, output) => {
    const bootstrap = getBootstrapContent();
    if (bootstrap) {
      (output.system ||= []).push(bootstrap);
    }
  }
};
