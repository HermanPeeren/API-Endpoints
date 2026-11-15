#!/usr/bin/env node
// Compares the routes in the spec with the routes that Joomla's web services plugins register.
//
// Usage: node scripts/check-routes.mjs <spec.json> <joomla-cms checkout>
//
// The routes are read from plugins/webservices/*/src/Extension/*.php: every createCRUDRoutes() call
// (five routes) and every `new Route([...], 'v1/...')`. Errors:
//   - a route in Joomla that is missing in the spec (the spec is incomplete);
//   - an operation in the spec that Joomla does not have (the spec describes a route that does not exist);
//   - a file in an x-source list that does not exist in Joomla.

import fs from 'node:fs';
import path from 'node:path';
import { loadSpec, operations, report } from './lib.mjs';

const [specFile, joomlaDir] = process.argv.slice(2);
if (!specFile || !joomlaDir) {
  console.error('Usage: node scripts/check-routes.mjs <spec.json> <joomla-cms checkout>');
  process.exit(2);
}

const spec = loadSpec(specFile);
const pluginsDir = path.join(joomlaDir, 'plugins', 'webservices');
if (!fs.existsSync(pluginsDir)) {
  console.error(`No plugins/webservices folder in ${joomlaDir}`);
  process.exit(2);
}

/**
 * "v1/content/articles/:id" -> "/v1/content/articles/{}": parameter names do not matter for matching,
 * and a trailing slash is ignored (Joomla's media folder route "files/:path/" is "files/{path}" in the spec).
 */
const normalise = (p) =>
  ('/' + p.replace(/^\//, '').replace(/\/$/, '')).replace(/:[A-Za-z0-9_]+|\{[^}]+\}/g, '{}');

const CRUD = [['GET', ''], ['GET', '/:id'], ['POST', ''], ['PATCH', '/:id'], ['DELETE', '/:id']];

/**
 * Evaluates a PHP string expression such as 'v1/a/' . $item->lang_code or $baseName . '/:id'.
 * A known variable gets its value, any other variable or property a route parameter (":dyn").
 * Returns null for anything else (a function call, for instance).
 */
function evaluate(expr, vars) {
  let out = '';
  for (const part of expr.split(/\s*\.\s*(?=(?:[^']*'[^']*')*[^']*$)/)) {
    const p = part.trim();
    let m;
    if ((m = p.match(/^'([^']*)'$/))) out += m[1];
    else if ((m = p.match(/^\$([A-Za-z_]\w*)$/)) && vars.has(m[1])) out += vars.get(m[1]);
    else if (/^\$[A-Za-z_]\w*(->\w+)*$/.test(p)) out += ':dyn';
    else return null;
  }
  return out;
}

/** The first argument of a call; `rest` starts right after the opening parenthesis. */
const firstArgs = (rest, n) => {
  const args = [];
  let depth = 0, quote = false, cur = '';
  for (const ch of rest) {
    if (quote) { cur += ch; if (ch === "'") quote = false; continue; }
    if (ch === "'") { quote = true; cur += ch; continue; }
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) { if (depth === 0) { args.push(cur.trim()); break; } depth--; }
    if (ch === ',' && depth === 0) { args.push(cur.trim()); cur = ''; if (args.length === n) break; continue; }
    cur += ch;
  }
  return args;
};

const joomlaRoutes = new Map(); // "GET /v1/..." -> plugin file
const unparsed = [];

for (const plugin of fs.readdirSync(pluginsDir).sort()) {
  const extDir = path.join(pluginsDir, plugin, 'src', 'Extension');
  if (!fs.existsSync(extDir)) continue;
  for (const file of fs.readdirSync(extDir).filter((f) => f.endsWith('.php'))) {
    const rel = `plugins/webservices/${plugin}/src/Extension/${file}`;
    const php = fs.readFileSync(path.join(extDir, file), 'utf8');
    const add = (method, p) => joomlaRoutes.set(`${method} ${normalise(p)}`, rel);

    // Split into functions; each has its own variables.
    const fns = [...php.matchAll(/function\s+(\w+)\s*\(([^)]*)\)/g)].map((m, i, all) => ({
      name: m[1],
      params: [...m[2].matchAll(/\$(\w+)/g)].map((x) => x[1]),
      body: php.slice(m.index, all[i + 1]?.index ?? php.length),
    }));

    // Helper functions that take the base name as a parameter, such as Media::createMediaCRUDRoutes().
    const helpers = new Map();
    for (const fn of fns) {
      if (!fn.params.includes('baseName')) continue;
      const routes = [];
      for (const m of fn.body.matchAll(/new Route\(/g)) {
        const [methods, p] = firstArgs(fn.body.slice(m.index + 10), 2);
        routes.push([methods, p]);
      }
      helpers.set(fn.name, { index: fn.params.indexOf('baseName'), routes });
    }

    for (const fn of fns) {
      if (helpers.has(fn.name)) continue;
      // Walk through assignments, CRUD calls, helper calls and routes in source order.
      const vars = new Map();
      const events = [
        ...[...fn.body.matchAll(/\$(\w+)\s*=\s*([^;]+);/g)].map((m) => ({ at: m.index, kind: 'var', m })),
        ...[...fn.body.matchAll(/createCRUDRoutes\(/g)].map((m) => ({ at: m.index, kind: 'crud', m })),
        ...[...fn.body.matchAll(/new Route\(/g)].map((m) => ({ at: m.index, kind: 'route', m })),
        ...[...fn.body.matchAll(/\$this->(\w+)\(/g)]
          .filter((m) => helpers.has(m[1]))
          .map((m) => ({ at: m.index, kind: 'helper', m })),
      ].sort((a, b) => a.at - b.at);

      for (const { kind, m } of events) {
        const rest = fn.body.slice(m.index + m[0].length);
        if (kind === 'var') {
          const v = evaluate(m[2], vars);
          if (v !== null) vars.set(m[1], v);
        } else if (kind === 'crud') {
          const [base] = firstArgs(rest, 1);
          const b = evaluate(base, vars);
          if (b === null) unparsed.push(`${rel}: createCRUDRoutes(${base}, ...)`);
          else for (const [method, suffix] of CRUD) add(method, b + suffix);
        } else if (kind === 'helper') {
          const h = helpers.get(m[1]);
          const arg = firstArgs(rest, h.index + 1)[h.index];
          const base = arg === undefined ? null : evaluate(arg, vars);
          if (base === null) { unparsed.push(`${rel}: ${m[1]}(..., ${arg}, ...)`); continue; }
          const hv = new Map([['baseName', base]]);
          for (const [methods, p] of h.routes) {
            const pv = evaluate(p, hv);
            const ms = [...methods.matchAll(/'([A-Z]+)'/g)].map((x) => x[1]);
            if (pv === null || ms.length === 0) unparsed.push(`${rel}: ${m[1]}: new Route(${methods}, ${p}, ...)`);
            else for (const method of ms) add(method, pv);
          }
        } else {
          const [methods, p] = firstArgs(rest, 2);
          const ms = [...(methods ?? '').matchAll(/'([A-Z]+)'/g)].map((x) => x[1]);
          const pv = p === undefined ? null : evaluate(p, vars);
          if (pv === null || ms.length === 0) unparsed.push(`${rel}: new Route(${methods}, ${p}, ...)`);
          else for (const method of ms) add(method, pv);
        }
      }
    }
  }
}

const specRoutes = new Map();
for (const op of operations(spec)) specRoutes.set(`${op.method.toUpperCase()} ${normalise(op.path)}`, op);

const errors = [];
const warnings = unparsed.map((u) => `Route not read (not a literal string): ${u}`);

for (const [route, file] of joomlaRoutes) {
  if (!specRoutes.has(route)) errors.push(`Missing in the spec: ${route} (registered in ${file})`);
}
for (const [route, op] of specRoutes) {
  if (!joomlaRoutes.has(route)) errors.push(`Not a Joomla route: ${route} (operationId ${op.operation.operationId})`);
}

const missingSources = new Map();
for (const op of operations(spec)) {
  for (const src of op.operation['x-source'] ?? []) {
    if (!fs.existsSync(path.join(joomlaDir, src))) {
      if (!missingSources.has(src)) missingSources.set(src, []);
      missingSources.get(src).push(op.operation.operationId);
    }
  }
}
for (const [src, ids] of missingSources) {
  errors.push(`x-source file does not exist in Joomla: ${src} (${ids.length} operations, e.g. ${ids[0]})`);
}

const covered = [...joomlaRoutes.keys()].filter((r) => specRoutes.has(r)).length;
report({
  title: 'Route coverage',
  summary: [
    `Joomla routes: ${joomlaRoutes.size}, in the spec: ${covered} (${((100 * covered) / Math.max(joomlaRoutes.size, 1)).toFixed(1)}%)`,
    `Spec operations: ${specRoutes.size}`,
  ],
  errors,
  warnings,
});
