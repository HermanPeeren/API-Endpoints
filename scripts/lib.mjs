// Shared helpers for the check scripts.

import fs from 'node:fs';

export const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

export function loadSpec(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** All operations as {path, method, operation, pathItem}. */
export function* operations(spec) {
  for (const [p, item] of Object.entries(spec.paths ?? {})) {
    for (const method of METHODS) {
      if (item[method]) yield { path: p, method, operation: item[method], pathItem: item };
    }
  }
}

/** Follows a local $ref such as "#/components/responses/NotFound". */
export function deref(spec, obj) {
  let seen = 0;
  while (obj && typeof obj.$ref === 'string' && obj.$ref.startsWith('#/') && seen++ < 20) {
    obj = obj.$ref
      .slice(2)
      .split('/')
      .map((s) => s.replace(/~1/g, '/').replace(/~0/g, '~'))
      .reduce((o, k) => o?.[k], spec);
  }
  return obj;
}

/**
 * Prints errors and warnings (as GitHub annotations on CI), writes a summary to the job summary
 * and sets the exit code: 1 when there are errors.
 */
export function report({ title, summary = [], errors = [], warnings = [], details = '' }) {
  const ci = !!process.env.GITHUB_ACTIONS;
  console.log(`\n== ${title} ==`);
  for (const line of summary) console.log(line);
  for (const w of warnings) console.log(ci ? `::warning title=${title}::${w}` : `warning: ${w}`);
  for (const e of errors) console.log(ci ? `::error title=${title}::${e}` : `error: ${e}`);
  console.log(`${errors.length} errors, ${warnings.length} warnings`);

  if (process.env.GITHUB_STEP_SUMMARY) {
    const list = (items, max = 50) =>
      items.slice(0, max).map((i) => `- ${i}`).join('\n') + (items.length > max ? `\n- ... and ${items.length - max} more` : '');
    let md = `## ${title}\n\n${summary.map((s) => `- ${s}`).join('\n')}\n\n`;
    if (details) md += `${details}\n\n`;
    md += errors.length ? `### ❌ ${errors.length} errors\n\n${list(errors)}\n\n` : '✅ No errors\n\n';
    if (warnings.length) md += `<details><summary>⚠️ ${warnings.length} warnings</summary>\n\n${list(warnings, 200)}\n\n</details>\n\n`;
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
  }
  if (errors.length) process.exitCode = 1;
}
