# Joomla Web Services API: OpenAPI specification

[![Latest release](https://img.shields.io/github/v/release/joomla-projects/API-Endpoints?sort=semver&label=latest%20release)](https://github.com/joomla-projects/API-Endpoints/releases/latest)
[![CI](https://github.com/joomla-projects/API-Endpoints/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/joomla-projects/API-Endpoints/actions/workflows/ci.yml)

An [OpenAPI 3.1](https://learn.openapis.org/) specification of the core
[Web Services API](https://manual.joomla.org/docs/next/web-services-api/) of Joomla: all routes of the core web
services plugins, with authentication, parameters, request and response schemas, and examples.

The specification is one file: [`src/joomla-ws-api.json`](src/joomla-ws-api.json).

## Get the latest specification

| What | URL |
| --- | --- |
| Latest release (web page) | https://github.com/joomla-projects/API-Endpoints/releases/latest |
| Latest release (JSON, for tools and agents) | https://api.github.com/repos/joomla-projects/API-Endpoints/releases/latest |
| A specific release | `https://github.com/joomla-projects/API-Endpoints/releases/download/<version>/joomla-ws-api-<version>.json`, for instance [6.2.0](https://github.com/joomla-projects/API-Endpoints/releases/download/6.2.0/joomla-ws-api-6.2.0.json) |
| Not yet released (`main`) | https://raw.githubusercontent.com/joomla-projects/API-Endpoints/main/src/joomla-ws-api.json |

Each release has these files, with its version in the name: `joomla-ws-api-<version>.json`, the same spec in
YAML (`.yaml`), readable documentation (`.html`, Redoc) and checksums (`.sha256`).

For AI agents and other tools: the JSON of the latest release has the version in `tag_name`, and the download
URL of each file in `assets[].browser_download_url`. For instance:

```bash
curl -s https://api.github.com/repos/joomla-projects/API-Endpoints/releases/latest \
  | jq -r '.assets[] | select(.name | endswith(".json")) | .browser_download_url'
```

## Versions

A release has the version of the Joomla minor version it describes: release **6.2**.x is the API of
Joomla **6.2**. Patch releases (6.2.1, 6.2.2, ...) improve the description of the same API. When Joomla's web
services change in a new minor version, the specification gets a release with that minor version.
The version is in `info.version` of the spec, in the release tag and in the names of the release files; the
source file in this repository is always `src/joomla-ws-api.json`.
See [CHANGELOG.md](CHANGELOG.md).

## Documentation

The [Web Services API documentation](https://manual.joomla.org/docs/next/web-services-api/) in the Joomla
Manual is generated from this specification, with an
[OpenAPI reference](https://manual.joomla.org/docs/next/web-services-api/openapi/) and code samples for each
component.

## Bruno collection

The [`bruno`](https://github.com/joomla-projects/API-Endpoints/tree/bruno) branch has a
[Bruno](https://www.usebruno.com) collection of the Joomla 6 API endpoints, made by René Kreijveld
([@renekreijveld](https://github.com/renekreijveld)). It is not yet up to date with this specification.

## Credits

The specification was made by Sergey Tolkachyov ([@sergeytolkachyov](https://github.com/sergeytolkachyov)) for the Joomla Manual
([joomla/Manual#724](https://github.com/joomla/Manual/pull/724)), derived from the Joomla source code: the routes
from the web services plugins, request bodies from the form XML files and responses from the API views. The
`x-source` property of each operation lists the source files.
It was improved in [HermanPeeren/Joomla-OpenAPI](https://github.com/HermanPeeren/Joomla-OpenAPI) with the
summaries and tags of an earlier hand-made specification, and responses captured from a Joomla 6.2.0 test site.
That repository has the history of these changes and the tools that made them.

## Contributing

Change `src/joomla-ws-api.json` in a pull request; you can do that in GitHub's web editor. Every pull request
is checked automatically, and the results show up in the pull request. A pull request can be merged when the
checks pass.

To run the checks on your own computer before you open the pull request, you need Node.js 22 or later:

```bash
npm ci
npm run format
npm run check
npm run build
```

`npm run format` writes the spec in the fixed format (2 spaces). `npm run check` runs these checks:

- **Format**: the JSON is formatted, so a diff only shows real changes.
- **OpenAPI schema**: valid against the official OpenAPI 3.1 JSON Schema.
- **Redocly lint**: the `recommended-strict` rules and more, all as errors, and examples must match their schemas.
  Known exceptions are listed in [`.redocly.lint-ignore.yaml`](.redocly.lint-ignore.yaml).
- **Quality and completeness**: summaries, descriptions, tags, `x-source`, path parameters, error responses,
  schemas and examples of each operation. The CI job summary shows how complete the spec is.
- **Version**: `CHANGELOG.md` has a section for `info.version`, and the version does not go down.

CI also runs these checks:

- **Routes**: the spec is compared with the routes in the web services plugins of the latest Joomla release of
  the same minor version. A route missing in the spec, an operation that Joomla does not have, or an `x-source`
  file that does not exist makes CI fail. Run it locally with `npm run routes -- <path to joomla-cms>`.
- **API changes**: in a pull request, [oasdiff](https://github.com/oasdiff/oasdiff) shows what changed in the API.
  A breaking change within the same minor version fails, unless the pull request has the label
  `accepted-breaking-change` (for instance for a correction that makes the spec match Joomla).
- **Joomla development branches**: once a week, the spec is compared with the routes in Joomla's development
  branches, to see early when Joomla's web services change.

## Releasing

1. In a pull request, set `info.version` in `src/joomla-ws-api.json` and add a section to `CHANGELOG.md`.
2. After the merge, tag the merged `main` with the version and push the tag to joomla-projects/API-Endpoints
   (if you work from a fork, that is your `upstream` remote):
   ```bash
   git switch main
   git pull upstream main
   git tag -a 6.2.1 -m "Joomla Web Services API 6.2.1"
   git push upstream 6.2.1
   ```

The release workflow runs all checks, builds the release files and creates the GitHub release. The highest
version becomes the latest release; a patch release for an older minor version, such as 6.1.4 after 6.2.0,
does not.

## License

GNU General Public License version 3, see [LICENSE](LICENSE).
