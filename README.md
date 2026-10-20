# Mercado Libre Reviews & Questions Scraper

[![Apify Store](https://img.shields.io/badge/Apify%20Store-live-0F62FE?logo=apify&logoColor=white)](https://apify.com/ener90/mercadolibre-reviews-questions)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Crawlee](https://img.shields.io/badge/Crawlee-3-FF4785)
![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

Extracts product reviews (stars, text, date, photos) and answered Q&A from Mercado Libre in 6 LATAM countries, without storing any reviewer identity.

▶️ **Run it on the Apify Store:** https://apify.com/ener90/mercadolibre-reviews-questions

## Tech stack
TypeScript, Node.js 20, Crawlee (BasicCrawler), Apify SDK, Vitest.

## Architecture
```
src/
  parsers.ts   # pure, unit-tested parsing/transform logic (no I/O)
  main.ts      # Actor entry: input validation, crawling, retries, output
.actor/        # Apify Actor config: input/output/dataset schemas, Dockerfile, Store README
tests/         # Vitest unit tests + real HTML/JSON fixtures
```
- `parsers.ts`: URL/ID parsing (catalog `/p/` vs listing), review/Q&A JSON parsers that drop personal fields.
- `main.ts`: Crawlee `BasicCrawler` hitting Mercado Libre's public review JSON endpoint with pagination and retries; optional official OAuth (client_credentials) API for questions, with automatic fallback.

Design principles: **reliability first** (session rotation, retries, block detection, clear error messages), **privacy by default** (no personal data is collected), **low cost** (small memory footprint, resource blocking, pay-per-event pricing).

## Run locally
```bash
npm install
npm test            # 18 unit tests (Vitest)
npm run build
# put an input in storage/key_value_stores/default/INPUT.json, then:
npm start           # or: apify run
```
Deploy: `apify login && apify push`.

## Input / output
See [`.actor/input_schema.json`](.actor/input_schema.json), [`.actor/dataset_schema.json`](.actor/dataset_schema.json) and the full user docs in [`.actor/STORE_README.md`](.actor/STORE_README.md) (English & Spanish).

## Legal & privacy
Collects only publicly available data and deliberately drops personal identifiers. Users are responsible for complying with the target site's terms and applicable law.

## License
MIT © René Del Valle Rodríguez
