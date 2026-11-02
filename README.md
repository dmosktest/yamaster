# yamaster

Logical YAML comparison by keys and values (not a line-by-line text diff).

**Version:** `1.1.3`  
**Live:** https://yamaster.dmosk.net

## Stack

| Layer | Choice |
|-------|--------|
| UI | Vite + TypeScript (vanilla), PWA |
| Compare core | Shared module `shared/yaml-diff.mjs` (browser + API) |
| API | Node (`api/server.mjs`) — `POST /api/compare`, `GET /api/health` |

## Features

- Two YAML inputs: paste text and/or upload files
- Logical diff with nested paths (`a.b.c`); arrays compared by index
- Diff and unified views with real YAML formatting (not `JSON.stringify` escapes)
- Client-side compare by default (works offline after PWA install); API available for the same algorithm
- Multilingual UI and SEO body (benefits, how-to, tips, uses, FAQ) with JSON-LD `WebApplication` + `FAQPage`
- Locale paths, hreflang, `robots.txt`, `sitemap.xml`

## Languages and URLs

- Locale paths: `/ru/`, `/en/`, `/zh/`, `/es/`, `/hi/`, `/ar/`, `/bn/`, `/pt/`, `/fr/`, `/de/`, `/ja/`, `/id/`, `/pa/`, `/jv/`, `/te/`, `/tr/`, `/ko/`, `/mr/`, `/vi/`, `/ta/`, `/it/`, `/fa/`, `/tlh/`
- Language switcher uses local Twemoji flag PNGs; `ar` / `fa` use `dir="rtl"`
- Self-canonical URLs and full hreflang; `x-default` → `/en/`
- Build writes `dist/{lang}/`

## Local development

```bash
npm install
npm run dev
```

Optional API:

```bash
cd api
npm install
npm start
```
