#!/usr/bin/env node
// Generates the PhpStorm HTTP Client collection in dist/phpstorm/ from the spec: one .http file per tag, with a
// request for each operation, and the files of scripts/phpstorm/ (README and environment files). The request
// bodies are the examples of the spec. The collection is not committed to main: the release has it as a zip file,
// and the phpstorm branch has the collection of the latest main.
//
// Usage: node scripts/generate-phpstorm.mjs [spec.json]   (default: src/joomla-ws-api.json)

import fs from 'node:fs';
import path from 'node:path';
import { deref, loadSpec, METHODS } from './lib.mjs';

const OUT = 'dist/phpstorm';
const STATIC = 'scripts/phpstorm';
const specFile = process.argv[2] ?? 'src/joomla-ws-api.json';

// Name of the {id} variable, by the last word of the tag
const ID_NAMES = {
  Categories: 'category_id',
  Clients: 'client_id',
  Form: 'contact_id',
  Fields: 'field_id',
  Groups: 'group_id',
  Levels: 'level_id',
  Items: 'menu_item_id',
  Styles: 'template_style_id',
  Content: 'language_id',
  Overrides: 'override_key',
  Requests: 'request_id',
  Consents: 'consent_id',
  Adapters: 'adapter_id',
  Newsfeeds: 'feed_id',
  Articles: 'article_id',
};

// Default values of the path variables
const DEFAULTS = {
  adapter_id: 'local-images',
  override_key: 'COM_EXAMPLE_KEY',
  lang_code: 'en-GB',
  component_name: 'com_content',
  path: 'local-images:/joomla_black.png',
};

/** "Banners Categories" -> "category_id". Content history uses the ID of the item it belongs to. */
function idName(tag) {
  const words = tag.split(' ');
  const last = words.at(-1);
  if (last === 'History') return words.at(-3).replace(/s$/, '').toLowerCase() + '_id';
  return ID_NAMES[last] ?? last.replace(/s$/, '').toLowerCase() + '_id';
}

const firstSentence = (text) => text.trim().split(/(?<=\.)\s/)[0];

function bodyExample(content) {
  const media = content['application/json'] ?? Object.values(content)[0];
  if ('example' in media) return media.example;
  if (media.examples) return deref(spec, Object.values(media.examples)[0]).value;
  return {};
}

const spec = loadSpec(specFile);
const files = new Map();

// The operations in the order of the spec (operations() of lib.mjs sorts the methods)
const ordered = Object.entries(spec.paths).flatMap(([route, pathItem]) =>
  Object.keys(pathItem)
    .filter((method) => METHODS.includes(method))
    .map((method) => ({ route, method, operation: pathItem[method], pathItem })),
);

for (const { route, method, operation, pathItem } of ordered) {
  const tag = operation.tags[0];
  const parameters = [...(pathItem.parameters ?? []), ...(operation.parameters ?? [])].map((p) => deref(spec, p));
  const variables = {};
  const notes = [];
  let url = route;
  for (const p of parameters.filter((p) => p.in === 'path')) {
    let name = p.name;
    if (name === 'id') name = (p.description ?? '').includes('ID of the version') ? 'version_id' : idName(tag);
    url = url.replace(`{${p.name}}`, `{{${name}}}`);
    variables[name] = p.example ?? DEFAULTS[name] ?? 1;
    if (p.description) notes.push(`{{${name}}}: ${firstSentence(p.description)}`);
  }
  const security = operation.security ?? spec.security ?? [];
  const requestBody = deref(spec, operation.requestBody);
  if (!files.has(tag)) files.set(tag, []);
  files.get(tag).push({
    summary: operation.summary,
    method: method.toUpperCase(),
    url: `{{base_url}}${url}`,
    variables,
    notes: [...new Set(notes)],
    query: parameters.filter((p) => p.in === 'query').map((p) => p.name),
    updateToken: security.some((s) => 'JUpdateToken' in s),
    body: requestBody ? bodyExample(requestBody.content) : null,
  });
}

/** The contents of the .http file of one tag. */
function render(tag, requests) {
  const lines = [
    `# ${tag}`,
    '#',
    `# Generated from the OpenAPI spec of the Joomla Web Services API ${spec.info.version}.`,
    '# Set base_url and api_key in http-client.env.json and http-client.private.env.json.',
    '',
  ];
  const variables = {};
  for (const r of requests) {
    for (const [name, value] of Object.entries(r.variables)) variables[name] ??= value;
  }
  for (const [name, value] of Object.entries(variables)) lines.push(`@${name} = ${value}`);
  if (Object.keys(variables).length) lines.push('');

  for (const r of requests) {
    lines.push(`### ${r.summary}`, `# @name ${r.summary}`);
    for (const note of r.notes) lines.push(`# ${note}`);
    if (r.query.length) lines.push(`# Optional query parameters: ${r.query.join(', ')}`);
    lines.push(`${r.method} ${r.url}`);
    lines.push(r.updateToken ? 'X-JUpdate-Token: {{update_token}}' : 'X-Joomla-Token: {{api_key}}');
    lines.push('Accept: application/vnd.api+json');
    if (r.body !== null) lines.push('Content-Type: application/json', '', JSON.stringify(r.body, null, 2));
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

/** "Banners Categories" -> "banners-categories.http" */
const fileName = (tag) => `${tag.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.http`;

const requests = [...files.values()].reduce((n, r) => n + r.length, 0);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
fs.cpSync(STATIC, OUT, { recursive: true });
for (const [tag, tagRequests] of files) fs.writeFileSync(path.join(OUT, fileName(tag)), render(tag, tagRequests));
console.log(`${OUT}: ${files.size} files, ${requests} requests`);
