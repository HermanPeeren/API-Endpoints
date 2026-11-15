#!/usr/bin/env node
// Builds the release files in dist/:
//   joomla-ws-api.json   the spec, unchanged
//   joomla-ws-api.yaml   the same spec in YAML
//   index.html           readable documentation (Redoc)
//   SHA256SUMS           checksums of the files above
//
// Usage: node scripts/build.mjs [--tag <tag>]
//   --tag: fail unless the tag equals info.version of the spec (used by the release workflow).

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { loadSpec } from './lib.mjs';

const SRC = 'src/joomla-ws-api.json';
const DIST = 'dist';
const args = process.argv.slice(2);
const tagIndex = args.indexOf('--tag');
const tag = tagIndex >= 0 ? args[tagIndex + 1] : null;

const version = loadSpec(SRC).info.version;
if (tag !== null && tag !== version) {
  console.error(`Tag "${tag}" does not match info.version "${version}" in ${SRC}.`);
  process.exit(1);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST);

const redocly = (...a) => {
  console.log(`redocly ${a.join(' ')}`);
  execFileSync(process.execPath, [path.join('node_modules', '@redocly', 'cli', 'bin', 'cli.js'), ...a], { stdio: 'inherit' });
};

// The spec is one self-contained file: the release JSON is the source file as it is.
fs.copyFileSync(SRC, `${DIST}/joomla-ws-api.json`);
redocly('bundle', SRC, '--output', `${DIST}/joomla-ws-api.yaml`);
redocly('build-docs', SRC, '--output', `${DIST}/index.html`, '--title', `Joomla ${version} Web Services API`);

const files = ['joomla-ws-api.json', 'joomla-ws-api.yaml', 'index.html'];
const sums = files.map((f) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, f))).digest('hex')}  ${f}`);
fs.writeFileSync(`${DIST}/SHA256SUMS`, sums.join('\n') + '\n');

console.log(`\nBuilt Joomla Web Services API ${version} in ${DIST}/:`);
for (const f of [...files, 'SHA256SUMS']) console.log(`  ${f}  ${(fs.statSync(path.join(DIST, f)).size / 1024).toFixed(0)} KB`);
