# yamaster

Logical YAML comparison by keys and values (not a line-by-line text diff).

**Version:** `1.2.0`  
**License:** [MIT](LICENSE)  
**Site:** https://yamaster.dmosk.net/

## Features

- Logical diffs by key path; types matter (`"1"` ≠ `1`)
- Lists: by index, by element key (Kubernetes preset), or as unordered sets
- Ignore path rules (`status.**`, `**.managedFields`, …)
- Multi-document YAML (`---`), matched by `kind` + `metadata.name`
- Anchors, aliases, and merge keys are expanded by the parser before compare
- Runs locally in the browser (PWA / offline after first visit)
- Share encodes input into the URL fragment (`#…`) — YAML is not sent to the server
- Same core in the web UI, `POST /api/compare`, CLI, and GitHub Action

## CLI

```bash
npm install
node bin/yamaster.mjs left.yml right.yml --preset kubernetes
node bin/yamaster.mjs a.yml b.yml --ignore 'status.**' --json
```

Exit codes: `0` no diffs, `1` diffs found, `2` usage/parse error.

## GitHub Action

```yaml
- uses: dmosktest/yamaster@main
  with:
    left: before.yml
    right: after.yml
    preset: kubernetes
```

## Develop

```bash
npm install
npm run dev
npm test
npm run build
```

API (optional): `cd api && npm install && npm start`.

## Privacy

By default the UI compares in the browser. The share link keeps YAML in the URL fragment only. The optional HTTP API accepts YAML only when you call it explicitly.
