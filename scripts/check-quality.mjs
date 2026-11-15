#!/usr/bin/env node
// Checks the completeness and consistency of the spec, beyond what an OpenAPI validator checks.
//
// Usage: node scripts/check-quality.mjs <spec.json>
//
// Errors make the check fail. Warnings and the numbers in the summary show where the spec can still
// be improved; they do not fail the check.

import { loadSpec, operations, deref, report } from './lib.mjs';

const specFile = process.argv[2];
if (!specFile) {
  console.error('Usage: node scripts/check-quality.mjs <spec.json>');
  process.exit(2);
}

const spec = loadSpec(specFile);
const errors = [];
const warnings = [];
// x-support values: source-derived = derived from the Joomla source code;
// registered-unimplemented = Joomla registers the route, but its controller task does not work.
const X_SUPPORT = ['source-derived', 'registered-unimplemented'];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// --- info ---------------------------------------------------------------------------------------

if (!/^3\.1\.\d+$/.test(spec.openapi ?? '')) err(`openapi must be 3.1.x, is ${spec.openapi}`);

const version = spec.info?.version ?? '';
const vm = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
if (!vm) {
  err(`info.version must be MAJOR.MINOR.PATCH, is "${version}"`);
} else {
  const minor = `${vm[1]}.${vm[2]}`;
  const title = spec.info.title ?? '';
  if (!new RegExp(`\\bJoomla ${minor.replace('.', '\\.')}\\b`).test(title)) {
    err(`info.title must name the Joomla version "Joomla ${minor}", is "${title}"`);
  }
  if (title.includes(version)) err(`info.title must not contain the patch version ${version}: it changes with every release`);
}
if (!spec.info?.description) err('info.description is missing');
if (!spec.info?.license?.identifier && !spec.info?.license?.url) err('info.license needs an identifier or url');

// --- tags ---------------------------------------------------------------------------------------

const definedTags = new Map((spec.tags ?? []).map((t) => [t.name, t]));
const usedTags = new Set();
for (const t of spec.tags ?? []) if (!t.description) err(`Tag "${t.name}" has no description`);

const groupOfTag = new Map();
for (const g of spec['x-tagGroups'] ?? []) {
  for (const t of g.tags ?? []) {
    if (!definedTags.has(t)) err(`x-tagGroups "${g.name}" lists tag "${t}", which is not defined in tags`);
    if (groupOfTag.has(t)) err(`Tag "${t}" is in x-tagGroups "${groupOfTag.get(t)}" and "${g.name}"`);
    groupOfTag.set(t, g.name);
  }
}
if (spec['x-tagGroups']) {
  for (const t of definedTags.keys()) if (!groupOfTag.has(t)) err(`Tag "${t}" is not in any x-tagGroups group`);
}

// --- operations ---------------------------------------------------------------------------------

const ids = new Map();
const summaries = new Map();
const stats = {
  operations: 0,
  withRequestBody: 0,
  requestExamples: 0,
  responseBodies: 0,
  responseExamples: 0,
  capturedExamples: 0,
  bySupport: {},
  requestProps: 0,
  requestPropsDescribed: 0,
};

const hasExample = (media) => media && (media.example !== undefined || Object.keys(media.examples ?? {}).length > 0);

function countRequestProps(schema, seen = new Set()) {
  schema = deref(spec, schema);
  if (!schema || typeof schema !== 'object' || seen.has(schema)) return;
  seen.add(schema);
  for (const prop of Object.values(schema.properties ?? {})) {
    stats.requestProps++;
    const p = deref(spec, prop);
    if (prop.description || p?.description || p?.title) stats.requestPropsDescribed++;
  }
  for (const k of ['allOf', 'oneOf', 'anyOf']) for (const s of schema[k] ?? []) countRequestProps(s, seen);
}

for (const { path, method, operation: op, pathItem } of operations(spec)) {
  stats.operations++;
  const where = `${method.toUpperCase()} ${path}`;

  if (!op.operationId) err(`${where}: no operationId`);
  else {
    if (!/^[A-Za-z0-9_]+$/.test(op.operationId)) err(`${where}: operationId "${op.operationId}" may only contain letters, digits and _`);
    if (ids.has(op.operationId)) err(`${where}: operationId "${op.operationId}" is also used by ${ids.get(op.operationId)}`);
    ids.set(op.operationId, where);
  }

  if (!op.summary) err(`${where}: no summary`);
  else if (summaries.has(op.summary)) warn(`${where}: summary "${op.summary}" is also used by ${summaries.get(op.summary)}`);
  else summaries.set(op.summary, where);

  if (!op.description || op.description.trim().length < 20) err(`${where}: no description, or shorter than 20 characters`);

  if (!Array.isArray(op.tags) || op.tags.length !== 1) err(`${where}: must have exactly one tag`);
  for (const t of op.tags ?? []) {
    usedTags.add(t);
    if (!definedTags.has(t)) err(`${where}: tag "${t}" is not defined in tags`);
  }

  if (!Array.isArray(op['x-source']) || op['x-source'].length === 0) err(`${where}: x-source must list the Joomla source files`);
  if (!op['x-support']) err(`${where}: no x-support`);
  else if (!X_SUPPORT.includes(op['x-support'])) err(`${where}: x-support "${op['x-support']}" is not one of ${X_SUPPORT.join(', ')}`);
  else stats.bySupport[op['x-support']] = (stats.bySupport[op['x-support']] ?? 0) + 1;

  // Parameters
  const params = [...(pathItem.parameters ?? []), ...(op.parameters ?? [])].map((p) => deref(spec, p));
  for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])) {
    const p = params.find((x) => x?.in === 'path' && x.name === name);
    if (!p) err(`${where}: path parameter {${name}} is not described`);
    else if (p.required !== true) err(`${where}: path parameter {${name}} must be required`);
  }
  for (const p of params) {
    if (!p) continue;
    if (!p.schema && !p.content) err(`${where}: parameter "${p.name}" has no schema`);
    if (!p.description) warn(`${where}: parameter "${p.name}" has no description`);
  }

  // Request body
  if (op.requestBody) {
    stats.withRequestBody++;
    const rb = deref(spec, op.requestBody);
    const media = Object.entries(rb?.content ?? {});
    if (media.length === 0) err(`${where}: requestBody has no content`);
    let example = false;
    for (const [type, m] of media) {
      if (!m.schema) err(`${where}: requestBody ${type} has no schema`);
      else countRequestProps(m.schema);
      if (hasExample(m)) example = true;
    }
    if (example) stats.requestExamples++;
    else if (media.length) warn(`${where}: requestBody has no example`);
  }

  // Responses
  const codes = Object.keys(op.responses ?? {});
  const unimplemented = op['x-support'] === 'registered-unimplemented';
  if (!unimplemented && !codes.some((c) => /^2\d\d$/.test(c))) err(`${where}: no 2xx response`);
  if (unimplemented && !/not implemented/i.test(op.summary ?? '')) err(`${where}: x-support is registered-unimplemented, so the summary must say "(not implemented)"`);
  const isPublic = Array.isArray(op.security) && op.security.length === 0;
  if (!isPublic) {
    for (const c of ['401', '403']) if (!codes.includes(c)) err(`${where}: no ${c} response`);
  }
  for (const [code, r] of Object.entries(op.responses ?? {})) {
    const resp = deref(spec, r);
    if (!resp?.description) err(`${where}: response ${code} has no description`);
    if (!/^2\d\d$/.test(code)) continue;
    for (const [type, m] of Object.entries(resp?.content ?? {})) {
      stats.responseBodies++;
      if (!m.schema) err(`${where}: response ${code} ${type} has no schema`);
      if (hasExample(m)) {
        stats.responseExamples++;
        if (m.examples?.captured) stats.capturedExamples++;
      } else {
        warn(`${where}: response ${code} ${type} has no example`);
      }
    }
  }
}

for (const t of definedTags.keys()) if (!usedTags.has(t)) err(`Tag "${t}" is defined but not used by any operation`);

// --- summary ------------------------------------------------------------------------------------

const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(1)}%` : 'n/a');
report({
  title: 'Quality and completeness',
  summary: [
    `Spec version: ${version}`,
    `Paths: ${Object.keys(spec.paths ?? {}).length}, operations: ${stats.operations}, tags: ${definedTags.size}`,
    `x-support: ${Object.entries(stats.bySupport).map(([k, v]) => `${k} ${v}`).join(', ')}`,
    `Request bodies with an example: ${stats.requestExamples} of ${stats.withRequestBody} (${pct(stats.requestExamples, stats.withRequestBody)})`,
    `Request body properties with a description: ${stats.requestPropsDescribed} of ${stats.requestProps} (${pct(stats.requestPropsDescribed, stats.requestProps)})`,
    `Success response bodies with an example: ${stats.responseExamples} of ${stats.responseBodies} (${pct(stats.responseExamples, stats.responseBodies)})`,
    `... of which captured from a Joomla test site: ${stats.capturedExamples} (${pct(stats.capturedExamples, stats.responseBodies)})`,
  ],
  errors,
  warnings,
});
