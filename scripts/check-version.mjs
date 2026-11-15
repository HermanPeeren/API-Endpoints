#!/usr/bin/env node
// Checks info.version of the spec against CHANGELOG.md and, in a pull request, against the base branch.
//
// Usage: node scripts/check-version.mjs <spec.json> <CHANGELOG.md> [<base spec.json>]
//
//   - CHANGELOG.md must have a "## <version>" section for the version in the spec;
//   - the version may not go down compared to the base branch;
//   - when the version changes, it is a new release: CHANGELOG.md must describe it.
// Prints "minor=<X.Y>", "version=<X.Y.Z>" and "same_minor=<true|false>" to $GITHUB_OUTPUT.

import fs from 'node:fs';
import { loadSpec, report } from './lib.mjs';

const [specFile, changelogFile, baseFile] = process.argv.slice(2);
if (!specFile || !changelogFile) {
  console.error('Usage: node scripts/check-version.mjs <spec.json> <CHANGELOG.md> [<base spec.json>]');
  process.exit(2);
}

const parse = (v) => (/^\d+\.\d+\.\d+$/.test(v ?? '') ? v.split('.').map(Number) : null);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

const errors = [];
const summary = [];
const version = loadSpec(specFile).info?.version;
const v = parse(version);
if (!v) errors.push(`info.version "${version}" is not MAJOR.MINOR.PATCH`);
summary.push(`Version: ${version}`);

const changelog = fs.readFileSync(changelogFile, 'utf8');
if (v && !new RegExp(`^## ${version.replace(/\./g, '\\.')}( |$)`, 'm').test(changelog)) {
  errors.push(`${changelogFile} has no "## ${version}" section`);
}

let sameMinor = true;
if (baseFile && fs.existsSync(baseFile) && v) {
  const baseVersion = loadSpec(baseFile).info?.version;
  const b = parse(baseVersion);
  summary.push(`Base branch version: ${baseVersion}`);
  if (b) {
    if (cmp(v, b) < 0) errors.push(`info.version ${version} is lower than ${baseVersion} on the base branch`);
    sameMinor = v[0] === b[0] && v[1] === b[1];
    if (!sameMinor) summary.push(`New Joomla minor version: ${b[0]}.${b[1]} -> ${v[0]}.${v[1]}`);
  }
}

if (process.env.GITHUB_OUTPUT && v) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nminor=${v[0]}.${v[1]}\nsame_minor=${sameMinor}\n`);
}

report({ title: 'Version', summary, errors });
