#!/usr/bin/env node
// Validates the spec against the official OpenAPI 3.1 JSON Schema, independently of Redocly.
//
// Usage: node scripts/validate-schema.mjs <spec.json>

import { Validator } from '@seriousme/openapi-schema-validator';
import { loadSpec, report } from './lib.mjs';

const specFile = process.argv[2];
if (!specFile) {
  console.error('Usage: node scripts/validate-schema.mjs <spec.json>');
  process.exit(2);
}

const validator = new Validator();
const result = await validator.validate(loadSpec(specFile));
const errors = result.valid
  ? []
  : (Array.isArray(result.errors) ? result.errors : [result.errors]).map((e) =>
      typeof e === 'string' ? e : `${e.instancePath || '/'}: ${e.message}${e.params ? ' ' + JSON.stringify(e.params) : ''}`,
    );

report({
  title: 'OpenAPI schema validation',
  summary: [`OpenAPI version: ${validator.version ?? 'unknown'}`, `Valid: ${result.valid ? 'yes' : 'no'}`],
  errors,
});
