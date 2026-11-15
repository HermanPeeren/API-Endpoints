#!/usr/bin/env node
// Writes the spec in one fixed format (2 spaces, UTF-8, newline at the end), so a pull request only
// shows real changes.
//
// Usage: node scripts/format.mjs [--check] [file ...]   (default: src/joomla-ws-api.json)
//   --check: do not write, but fail when a file is not formatted.

import fs from 'node:fs';

const args = process.argv.slice(2);
const check = args.includes('--check');
const files = args.filter((a) => a !== '--check');
if (files.length === 0) files.push('src/joomla-ws-api.json');

let failed = false;
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  let formatted;
  try {
    formatted = JSON.stringify(JSON.parse(raw), null, 2) + '\n';
  } catch (e) {
    console.error(`${file}: not valid JSON: ${e.message}`);
    failed = true;
    continue;
  }
  if (raw === formatted) {
    console.log(`${file}: formatted`);
  } else if (check) {
    console.error(`${file}: not formatted. Run "npm run format" and commit the result.`);
    failed = true;
  } else {
    fs.writeFileSync(file, formatted);
    console.log(`${file}: written`);
  }
}
if (failed) process.exitCode = 1;
