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

// Module-level cache for the built bootstrap string. The system.transform hook
// fires on every request; the bootstrap text does not change during a process,
// so read + substitute once instead of re-reading the file each time.
// undefined = not yet loaded, null = source file missing.
let _bootstrapCache = undefined;

/**
 * Build the minimal arcforge bootstrap from the shared bootstrap.txt file.
 *
 * hooks/inject-skills/main.sh reads the SAME file for the Claude Code side, so
 * both platforms emit an identical minimal bootstrap. Here we substitute the
 * literal ${ARCFORGE_ROOT} placeholder with the resolved plugin root and wrap
 * it in the injection markers. Cached after the first call.
 */
function getBootstrapContent() {
  if (_bootstrapCache !== undefined) return _bootstrapCache;

  const bootstrapPath = path.resolve(__dirname, '../../hooks/inject-skills/bootstrap.txt');
  if (!fs.existsSync(bootstrapPath)) {
    _bootstrapCache = null;
    return null;
  }

  const arcforgeRoot = path.resolve(__dirname, '../..');
  const template = fs.readFileSync(bootstrapPath, 'utf8').trim();
  // split/join instead of String.replace so a path containing $&, $1, $$ etc.
  // is inserted literally (replace treats those as special in the replacement).
  const bootstrap = template.split('${ARCFORGE_ROOT}').join(arcforgeRoot);

  _bootstrapCache = `<EXTREMELY_IMPORTANT>
You have arcforge skills.

${bootstrap}
</EXTREMELY_IMPORTANT>`;

  return _bootstrapCache;
}

export default {
  name: 'arcforge',
  version: '4.0.1',

  'experimental.chat.system.transform': async (_input, output) => {
    const bootstrap = getBootstrapContent();
    if (bootstrap) {
      (output.system ||= []).push(bootstrap);
    }
  }
};
