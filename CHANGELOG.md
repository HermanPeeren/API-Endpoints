# Changelog

Each release describes the core Web Services API of one Joomla minor version: release 6.2.x is for
Joomla 6.2. A patch release (6.2.1, 6.2.2, ...) improves the description of the same API.

## 6.2.2

Response attributes now match what the API views of Joomla render (checked against joomla-cms 6.2.0 and
`6.3-dev`, whose API code is the same):

- `id` added to the attributes of 104 responses (GET, POST and PATCH on 64 paths). It was missing in 68
  responses with `additionalProperties: false`, so a real response did not validate against the spec.
- `created_by`, `modified_by`, `tags` and (contacts) `user_id` added as attributes of articles, contacts and
  newsfeeds. Joomla renders them as attributes as well as relationships.
- `urls` removed from the attributes of the article list: the list query does not select it.
- `articletext`: the request bodies of articles say that it has no effect on update, and that `introtext` and
  `fulltext` win over it on create.
- The `tags` of contacts and newsfeeds describe a bug in Joomla: with more than one tag, a title can be paired
  with the wrong tag ID (the same bug was fixed for articles in Joomla 4.4.0).

## 6.2.1

The specification is the same as in 6.2.0; only `info.version` changed.

- New release file `joomla-ws-api-6.2.1-phpstorm.zip`: a collection for the HTTP Client of PhpStorm and other
  JetBrains IDEs, with a request for each operation, generated from the specification.
- The [`phpstorm`](https://github.com/joomla-projects/API-Endpoints/tree/phpstorm) branch has the collection of the
  newest specification in `main`.

## 6.2.0

First release in this repository: the specification that is published in the
[Joomla Manual](https://manual.joomla.org/docs/next/web-services-api/openapi/) as `joomla-6.2.0.json`
([joomla/Manual#724](https://github.com/joomla/Manual/pull/724)).

- 235 operations on 110 paths: all routes of the core web services plugins of Joomla 6.2.0.
- The title is now "Joomla 6.2 Core Web Services API", without the patch version.
- The responses of each operation are in numerical order (200, 204, 400, ..., 500).
