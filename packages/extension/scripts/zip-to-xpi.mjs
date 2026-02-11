#!/usr/bin/env node
/**
 * zip-to-xpi.mjs
 *
 * Converts a WXT-produced Firefox .zip artifact into a .xpi file.
 * XPI is simply a renamed ZIP — Firefox treats them identically — but
 * having an explicit .xpi makes the artifact self-documenting for
 * operators and CI pipelines.
 *
 * Usage: node ./scripts/zip-to-xpi.mjs
 *
 * Expects WXT zip output in .output/ (run `wxt zip -b firefox` first).
 * Selects the *-firefox.zip file, ignores *-sources.zip.
 * Writes the .xpi alongside the original zip in .output/.
 */

import { copyFileSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const outputDir = join(__dirname, '..', '.output');

// Find the Firefox zip artifact (not the sources zip)
let files;
try {
  files = readdirSync(outputDir);
} catch (err) {
  console.error(
    `Error: .output/ directory not found at ${outputDir}\n` +
      'Run "wxt zip -b firefox" first to produce the zip artifact.',
  );
  process.exit(1);
}

const firefoxZip = files.find(
  (f) => f.endsWith('-firefox.zip') && !f.includes('-sources'),
);

if (!firefoxZip) {
  console.error(
    'Error: No *-firefox.zip artifact found in .output/\n' +
      `Files present: ${files.join(', ') || '(none)'}\n` +
      'Run "wxt zip -b firefox" first to produce the zip artifact.',
  );
  process.exit(1);
}

// Derive .xpi name: replace -firefox.zip with -firefox.xpi
const xpiName = firefoxZip.replace(/\.zip$/, '.xpi');
const srcPath = join(outputDir, firefoxZip);
const destPath = join(outputDir, xpiName);

copyFileSync(srcPath, destPath);

console.log(`XPI created: ${destPath}`);
console.log(`  Source: ${basename(firefoxZip)}`);
console.log(`  Output: ${basename(xpiName)}`);
