#!/usr/bin/env node
// Builds the release files in dist/, with the version of the spec in each file name:
//   joomla-ws-api-<version>.json     the spec, unchanged
//   joomla-ws-api-<version>.yaml     the same spec in YAML
//   joomla-ws-api-<version>.html     readable documentation (Redoc)
//   joomla-ws-api-<version>-phpstorm.zip   the PhpStorm HTTP Client collection (scripts/generate-phpstorm.mjs)
//   joomla-ws-api-<version>.sha256   checksums of the files above
// The collection is also left unzipped in dist/phpstorm/.
//
// Usage: node scripts/build.mjs [--tag <tag>]
//   --tag: fail unless the tag equals info.version of the spec (used by the release workflow).

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
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

/**
 * Writes a zip file of the files in dir, in the folder root of the zip. Fixed dates, so a build is reproducible.
 * Only a flat folder: a subfolder is an error.
 */
function zip(dir, root, target) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const other = entries.filter((e) => !e.isFile()).map((e) => e.name);
  if (other.length) throw new Error(`zip: ${dir} may only contain files, not: ${other.join(', ')}`);
  const names = entries.map((e) => e.name).sort();
  const local = [];
  const central = [];
  let offset = 0;
  for (const name of names) {
    const data = fs.readFileSync(path.join(dir, name));
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    const fileName = Buffer.from(`${root}/${name}`);
    const crc = zlib.crc32(data);
    // version 2.0, flags (UTF-8 names), deflate, time 00:00, date 1980-01-01, crc, sizes, name length, extra length
    const fields = (b, at) => {
      b.writeUInt16LE(20, at);
      b.writeUInt16LE(0x0800, at + 2);
      b.writeUInt16LE(8, at + 4);
      b.writeUInt16LE(0, at + 6);
      b.writeUInt16LE(0x21, at + 8);
      b.writeUInt32LE(crc, at + 10);
      b.writeUInt32LE(deflated.length, at + 14);
      b.writeUInt32LE(data.length, at + 18);
      b.writeUInt16LE(fileName.length, at + 22);
    };
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    fields(header, 4);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    fields(entry, 6);
    entry.writeUInt32LE(offset, 42);
    local.push(header, fileName, deflated);
    central.push(entry, fileName);
    offset += header.length + fileName.length + deflated.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  fs.writeFileSync(target, Buffer.concat([...local, directory, end]));
}

const base = `joomla-ws-api-${version}`;
const files = [`${base}.json`, `${base}.yaml`, `${base}.html`, `${base}-phpstorm.zip`];

// The spec is one self-contained file: the release JSON is the source file as it is.
fs.copyFileSync(SRC, `${DIST}/${base}.json`);
redocly('bundle', SRC, '--output', `${DIST}/${base}.yaml`);
redocly('build-docs', SRC, '--output', `${DIST}/${base}.html`, '--title', `Joomla ${version} Web Services API`);
execFileSync(process.execPath, ['scripts/generate-phpstorm.mjs', SRC], { stdio: 'inherit' });
zip(`${DIST}/phpstorm`, `${base}-phpstorm`, `${DIST}/${base}-phpstorm.zip`);

const sums = files.map((f) => `${crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, f))).digest('hex')}  ${f}`);
fs.writeFileSync(`${DIST}/${base}.sha256`, sums.join('\n') + '\n');

console.log(`\nBuilt Joomla Web Services API ${version} in ${DIST}/:`);
for (const f of [...files, `${base}.sha256`]) console.log(`  ${f}  ${(fs.statSync(path.join(DIST, f)).size / 1024).toFixed(0)} KB`);
