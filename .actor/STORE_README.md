# Mercado Libre Reviews & Preguntas Scraper – Opiniones API

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Crawlee](https://img.shields.io/badge/Crawlee-3.13+-FF4785?logo=apify&logoColor=white)](https://crawlee.dev/)
[![Apify](https://img.shields.io/badge/Apify-3.2+-0F62FE?logo=apify&logoColor=white)](https://apify.com/)
[![Vitest](https://img.shields.io/badge/Vitest-2.1+-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Hice este actor porque necesitaba sacar las opiniones de productos de Mercado Libre sin copiarlas a mano. Le pasas URLs o IDs de productos y te devuelve cada opinión (estrellas, texto, fecha, fotos, likes) y, si quieres, las preguntas con sus respuestas. Funciona en Chile, Argentina, México, Colombia, Perú y Uruguay, y no guarda nombres ni apodos de compradores.

## Precio y costos

Pagas por resultado: **US$1 por cada 1.000 resultados** (cada opinión o pregunta cuenta como un resultado).

| Ejemplo | Resultados | Costo aprox. |
|---|---|---|
| 1 producto con 100 opiniones | 100 | US$0,10 |
| 20 productos × 50 opiniones | 1.000 | US$1,00 |
| 100 productos × (100 opiniones + 20 preguntas) | 12.000 | US$12,00 |

Con `maxReviews` y `maxQuestions` controlas cuánto gastas.

## Países disponibles

| Código | País | Dominio |
|---|---|---|
| MLC | Chile | mercadolibre.cl |
| MLA | Argentina | mercadolibre.com.ar |
| MLM | México | mercadolibre.com.mx |
| MCO | Colombia | mercadolibre.com.co |
| MLU | Uruguay | mercadolibre.com.uy |
| MPE | Perú | mercadolibre.com.pe |

## Integraciones

- **n8n / Make / Zapier:** usa el nodo o la app oficial de Apify → *Run Actor* con `ener90/mercadolibre-reviews-questions` y luego *Get dataset items*.
- **API:** `POST https://api.apify.com/v2/acts/ener90~mercadolibre-reviews-questions/run-sync-get-dataset-items?token=<TU_TOKEN>` con el input en JSON.
- **Agentes de IA (MCP):** agrega el actor a tu servidor [Apify MCP](https://mcp.apify.com) (Claude, ChatGPT, Cursor…) y pídele "analiza las opiniones de este producto de Mercado Libre".
- **Exportar:** JSON, CSV, Excel o XML directo desde el dataset.

## Análisis con IA (opcional)

Activa **AI insights** y pega tu propia key de **Gemini** (tiene plan gratis en [aistudio.google.com](https://aistudio.google.com/apikey)) o de **OpenAI**. Al terminar, el actor agrega una fila por producto con el **% de sentimiento, los pros y contras principales, las quejas que se repiten, lo que piden los clientes, citas destacadas y un resumen ejecutivo**: sirve para no leer mil opiniones una por una.

**Precio del add-on: US$0,0002 por opinión analizada (US$0,20 por 1.000), evento `review-analyzed`, vigente desde el 20 oct 2026. Solo se cobra si activas el análisis con IA.** La fila `ai-insight` cuenta además como un resultado normal. Los tokens de IA los cobra tu propio proveedor. Viene desactivado por defecto.

## Preguntas frecuentes

- **¿Necesito cuenta de Mercado Libre?** Para las opiniones, no. Para las preguntas necesitas tu propia app gratuita de Mercado Libre (Client ID y Secret).
- **¿Guarda datos personales?** No. No guarda nombres ni apodos de quienes opinan o preguntan.
- **¿Funciona con URLs de catálogo (/p/) y de publicación?** Sí, con ambas, y también con IDs sueltos (MLC123…).
- **¿Qué pasa si un producto no tiene opiniones?** La ejecución termina bien, lo informa en el log y no se cobra nada.
- **¿Es legal?** Solo extrae datos públicos y sin datos personales. Revisa los términos de Mercado Libre y las leyes de tu país según tu caso de uso.

### Descripción

Actor de Apify que extrae **opiniones de productos** y, opcionalmente, **preguntas y respuestas** de Mercado Libre para Chile (MLC), Argentina (MLA), México (MLM), Colombia (MCO), Uruguay (MLU) y Perú (MPE).

**Privacidad:** Este scraper **no almacena datos personales** (nombres, apodos o identificadores de usuarios que opinan o preguntan).

### Características

- Extracción de opiniones desde el endpoint JSON público de Mercado Libre
- Soporte multi-país (CL, AR, MX, CO, UY, PE)
- Paginación automática con reintentos (hasta 4 intentos)
- Extracción opcional de preguntas y respuestas (API oficial, con tu Client ID/Secret)
- Compatible con proxies de Apify (recomendado: RESIDENTIAL para evitar bloqueos)
- No guarda datos de identidad

### Stack Tecnológico

- **Runtime:** Node.js 20+
- **Lenguaje:** TypeScript 5.6+
- **Framework de scraping:** Crawlee 3.13+
- **Plataforma:** Apify 3.2+
- **Testing:** Vitest 2.1+

### Arquitectura

```
src/
├── main.ts          # Orquestador principal con BasicCrawler de Crawlee
└── parsers.ts       # Parsers de URLs, opiniones y preguntas
tests/
├── parsers.test.ts  # Tests unitarios
└── fixtures/        # Fixtures JSON reales de Mercado Libre
.actor/
├── actor.json       # Configuración del Actor
├── input_schema.json # Esquema de entrada
└── dataset_schema.json # Esquema de salida
```

**Flujo:**
1. El usuario provee URLs de productos/publicaciones o IDs numéricos
2. El parser identifica el tipo (producto de catálogo `/p/MLC123` o publicación `MLC-123..._JM`)
3. BasicCrawler extrae opiniones del endpoint público `/noindex/catalog/reviews/{id}/search` (20 por página)
4. Opcionalmente, extrae preguntas desde la API oficial `api.mercadolibre.com/questions/search` (requiere token OAuth)
5. Cada opinión o pregunta se guarda como una fila en el dataset de Apify

### Entrada (Input)

```json
{
  "startUrls": [
    { "url": "https://www.mercadolibre.cl/.../p/MLC37981310" },
    { "url": "https://articulo.mercadolibre.cl/MLC-467281714-..._JM" }
  ],
  "itemIds": ["MLC467281714", "MLA41149389"],
  "country": "MLC",
  "maxReviews": 100,
  "includeQuestions": false,
  "maxQuestions": 50,
  "maxListingsPerProduct": 3,
  "mlClientId": "TU_CLIENT_ID",
  "mlClientSecret": "TU_SECRET_KEY",
  "proxyConfiguration": { "useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"] }
}
```

**Parámetros:**
- `startUrls`: URLs de productos o publicaciones
- `itemIds`: IDs numéricos (se asume `country` si no tienen prefijo)
- `country`: Código del país por defecto (`MLC`, `MLA`, `MLM`, `MCO`, `MLU`, `MPE`)
- `maxReviews`: Máximo de opiniones por producto (por defecto: 100)
- `includeQuestions`: `true` para extraer preguntas (requiere `mlClientId` + `mlClientSecret`)
- `maxQuestions`: Máximo de preguntas por publicación (por defecto: 50)
- `maxListingsPerProduct`: para productos de catálogo, cuántas publicaciones encontradas en sus opiniones se consultan (por defecto: 3)
- `mlClientId` / `mlClientSecret`: Client ID y Secret Key de tu app de Mercado Libre. El secreto es un input secreto (cifrado y nunca impreso en el log). El Actor obtiene el token solo, vía OAuth `client_credentials`
- `mlAccessToken`: alternativa, un token OAuth ya generado (caduca a las 6 h)
- `proxyConfiguration`: Configuración de proxy de Apify (recomendado: RESIDENTIAL)

### Salida (Output)

**Una fila por opinión:**
```json
{
  "type": "review",
  "siteId": "MLC",
  "country": "Chile",
  "objectId": "MLC37981310",
  "isCatalogProduct": true,
  "title": "Notebook HP 15.6 pulgadas",
  "reviewId": 123456789,
  "rating": 5,
  "text": "Excelente producto, muy rápido",
  "date": "2024-01-15T10:30:00.000Z",
  "relativeDate": "hace 2 meses",
  "likes": 3,
  "photoCount": 2,
  "variant": null
}
```

**Una fila por pregunta:**
```json
{
  "type": "question",
  "siteId": "MLC",
  "country": "Chile",
  "objectId": "MLC467281714",
  "itemId": "MLC467281714",
  "questionId": 987654321,
  "question": "¿Tiene garantía?",
  "questionDate": "2024-01-10T14:20:00.000Z",
  "status": "ANSWERED",
  "answer": "Sí, 12 meses de garantía oficial",
  "answerDate": "2024-01-11T09:15:00.000Z"
}
```

### Nota sobre Preguntas

Las preguntas salen de la **API oficial** `api.mercadolibre.com/questions/search` (paginada con `limit`/`offset`). Los endpoints web anónimos devuelven 403 o piden verificación de cuenta. Las preguntas pertenecen a **publicaciones individuales** (`MLC-123..._JM`). Si entregas un producto de catálogo (`/p/MLC123`), el Actor detecta las publicaciones que aparecen en sus opiniones y consulta sus preguntas (hasta `maxListingsPerProduct`).

Con credenciales, el Actor prueba primero la API oficial de opiniones (`/reviews/item/{id}`). Si tu app no tiene acceso (hoy responde 403 para apps normales), usa automáticamente el endpoint público.

#### Cómo crear tu propia app de Mercado Libre (gratis)
1. Entra a [developers.mercadolibre.com](https://developers.mercadolibre.com/), elige tu país, inicia sesión y ve a **Mis aplicaciones → Crear nueva aplicación**.
2. Completa nombre, descripción y una *Redirect URI* con https (por ejemplo, la URL de tu GitHub). En **Permisos** basta con lectura de **Comunicaciones pre y post venta**. En flujos OAuth, marca **Client credentials** (y **Refresh token**).
3. Guarda la app. Copia el **Client ID** y el **Secret Key** (menú ⋮ → Editar) en `mlClientId` y `mlClientSecret`.

### Cómo Ejecutar Localmente

```bash
# Instalar dependencias
npm install

# Ejecutar tests
npm test

# Compilar TypeScript
npm run build

# Ejecutar localmente (requiere INPUT.json en storage/key_value_stores/default/)
npm start

# O ejecutar con Apify CLI
apify run
```

**Estructura de `storage/key_value_stores/default/INPUT.json`:**
```json
{
  "startUrls": [{ "url": "https://www.mercadolibre.cl/.../p/MLC37981310" }],
  "maxReviews": 50
}
```

### CI/CD

Este proyecto incluye un workflow de GitHub Actions que ejecuta:
- `npm ci` (instalación de dependencias)
- `npm run build` (compilación de TypeScript)
- `npm test` (tests unitarios con Vitest)

El CI se ejecuta en Node.js 20 en cada push y pull request.

### Privacidad

**Este scraper NO almacena:**
- Nombres de usuarios
- Apodos (nicknames)
- IDs de usuarios
- Correos electrónicos
- Números de teléfono
- Ningún dato de identidad personal

El código filtra explícitamente estos campos para cumplir con las mejores prácticas de privacidad.

### Licencia

[MIT License](LICENSE) - René Del Valle Rodríguez

## Más scrapers de ener90

- [Mercado Libre Price Tracker](https://apify.com/ener90/mercadolibre-seller-price-monitor) – monitor de precios de tiendas oficiales de Mercado Libre
- [TrustRadius Reviews Scraper](https://apify.com/ener90/software-reviews-scraper) – reseñas de software B2B de TrustRadius
- [Walmart Reviews Scraper](https://apify.com/ener90/walmart-products-reviews) – reseñas y productos de Walmart
- [Product Hunt Scraper](https://apify.com/ener90/product-hunt-launches) – lanzamientos diarios de Product Hunt
- Chile Real Estate Scraper (Portal Inmobiliario + TocToc) (`ener90/chile-real-estate-scraper`, próximamente) – propiedades en venta y arriendo en Chile
- AI Review Insights (`ener90/ai-review-insights`, próximamente) – análisis de reseñas con IA

Si necesitas otro sitio o algo a medida, escríbeme en la pestaña **Issues** (soporte en español).

## API e integraciones: inicio rápido

**cURL (síncrono, devuelve los resultados)**
```bash
curl -X POST "https://api.apify.com/v2/acts/ener90~mercadolibre-reviews-questions/run-sync-get-dataset-items?token=TU_TOKEN_APIFY" \
  -H "Content-Type: application/json" -d '{"startUrls":[{"url":"https://www.mercadolibre.cl/.../p/MLC123"}],"maxReviews":100}'
```

**Node.js**
```js
import { ApifyClient } from 'apify-client';
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('ener90/mercadolibre-reviews-questions').call({"startUrls":[{"url":"https://www.mercadolibre.cl/.../p/MLC123"}],"maxReviews":100});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

**Python**
```python
from apify_client import ApifyClient
client = ApifyClient("TU_TOKEN_APIFY")
run = client.actor("ener90/mercadolibre-reviews-questions").call(run_input={"startUrls":[{"url":"https://www.mercadolibre.cl/.../p/MLC123"}],"maxReviews":100})
items = client.dataset(run["defaultDatasetId"]).list_items().items
```

- **Google Sheets:** agrega la integración *Google Sheets* a una Task guardada, o usa `=IMPORTDATA("https://api.apify.com/v2/datasets/<DATASET_ID>/items?format=csv&clean=1")`.
- **n8n / Make / Zapier:** nodo o app oficial de Apify: *Run Actor* (`ener90/mercadolibre-reviews-questions`) → *Get dataset items*.
- **Webhooks:** en una Task, agrega la integración *Run succeeded* → tu URL (recibe el `defaultDatasetId`).
- **Agentes de IA (MCP):** `https://mcp.apify.com?actors=ener90/mercadolibre-reviews-questions` funciona en Claude, ChatGPT, Cursor o cualquier cliente MCP.
- **Plan gratis:** funciona en el plan gratuito de Apify; se cobra por resultado (ver Precio). Parte con límites bajos para probar.

## Historial de cambios
- 0.1 (2026-10-19): primera versión pública; esquema de salida, README con precios, países y preguntas frecuentes; menos memoria por defecto (512 MB).

¿Problemas o ideas? Abre un issue en la pestaña **Issues**; suelo responder en el día.

In English:

Scrape Mercado Libre **reviews** (stars, text, date, photos, likes) and **questions & answers** for any product or listing in Chile, Argentina, Mexico, Colombia, Peru and Uruguay. Export to **Excel, CSV or JSON** or use the API. No buyer personal data is stored.

### Pricing & cost examples

Pay per result: **US$1 per 1,000 results** (each review or question is one result).

| Example | Results | Approx. cost |
|---|---|---|
| 1 product, 100 reviews | 100 | US$0.10 |
| 20 products × 50 reviews | 1,000 | US$1.00 |
| 100 products × (100 reviews + 20 questions) | 12,000 | US$12.00 |

Use `maxReviews` / `maxQuestions` to cap spend.

### Supported countries

MLC Chile (mercadolibre.cl), MLA Argentina (mercadolibre.com.ar), MLM Mexico (mercadolibre.com.mx), MCO Colombia (mercadolibre.com.co), MLU Uruguay (mercadolibre.com.uy), MPE Peru (mercadolibre.com.pe).

### Integrations

- **n8n / Make / Zapier:** use the official Apify node/app → *Run Actor* (`ener90/mercadolibre-reviews-questions`) → *Get dataset items*.
- **API:** `POST https://api.apify.com/v2/acts/ener90~mercadolibre-reviews-questions/run-sync-get-dataset-items?token=<YOUR_TOKEN>` with the JSON input.
- **AI agents (MCP):** add it to the [Apify MCP](https://mcp.apify.com) server and ask your agent to analyse a product's reviews.
- **Export:** JSON, CSV, Excel, XML from the dataset.

### AI insights (optional)

Turn on **AI insights** and paste your own **Gemini** key (free tier at [aistudio.google.com](https://aistudio.google.com/apikey)) or your **OpenAI** key. After scraping, the Actor adds one row per product with **sentiment %, top pros and cons, recurring complaints, feature requests, notable quotes and an executive summary**. **AI add-on price: US$0.0002 per review analyzed (US$0.20 per 1,000), event `review-analyzed`, effective 20 Oct 2026. Only charged when AI insights are on.** The `ai-insight` row itself also counts as one normal result. The AI tokens are billed by your own provider. It's off by default.

### FAQ

- **Do I need a Mercado Libre account?** Not for reviews; questions need your own free ML app credentials.
- **Does it store personal data?** No reviewer or asker identity is stored.
- **Catalog and listing URLs?** Yes, both, plus raw IDs.
- **No reviews?** The run succeeds and logs it; nothing is charged.
- **Is it legal?** Only public, non-personal data is collected; check ML's terms and local law for your use case.

### Description

Apify Actor that scrapes **product reviews** and optionally **questions & answers** from Mercado Libre for Chile (MLC), Argentina (MLA), Mexico (MLM), Colombia (MCO), Uruguay (MLU), and Peru (MPE).

**Privacy:** This scraper **does not store personal data** (names, nicknames, or user identifiers of reviewers or askers).

### Features

- Review extraction from Mercado Libre's public JSON endpoint
- Multi-country support (CL, AR, MX, CO, UY, PE)
- Automatic pagination with retry logic (up to 4 attempts)
- Optional Q&A extraction (official API, with your Client ID/Secret)
- Apify proxy support (recommended: RESIDENTIAL to avoid blocks)
- No identity data stored

### Tech Stack

- **Runtime:** Node.js 20+
- **Language:** TypeScript 5.6+
- **Scraping framework:** Crawlee 3.13+
- **Platform:** Apify 3.2+
- **Testing:** Vitest 2.1+

### Architecture

```
src/
├── main.ts          # Main orchestrator with Crawlee's BasicCrawler
└── parsers.ts       # URL, review, and question parsers
tests/
├── parsers.test.ts  # Unit tests
└── fixtures/        # Real JSON fixtures from Mercado Libre
.actor/
├── actor.json       # Actor configuration
├── input_schema.json # Input schema
└── dataset_schema.json # Output schema
```

**Flow:**
1. User provides product/listing URLs or numeric IDs
2. Parser identifies type (catalog product `/p/MLC123` or listing `MLC-123..._JM`)
3. BasicCrawler extracts reviews from public endpoint `/noindex/catalog/reviews/{id}/search` (20 per page)
4. Optionally extracts questions from official API `api.mercadolibre.com/questions/search` (requires OAuth token)
5. Each review or question is saved as a row in Apify's dataset

### Input

```json
{
  "startUrls": [
    { "url": "https://www.mercadolibre.cl/.../p/MLC37981310" },
    { "url": "https://articulo.mercadolibre.cl/MLC-467281714-..._JM" }
  ],
  "itemIds": ["MLC467281714", "MLA41149389"],
  "country": "MLC",
  "maxReviews": 100,
  "includeQuestions": false,
  "maxQuestions": 50,
  "maxListingsPerProduct": 3,
  "mlClientId": "YOUR_CLIENT_ID",
  "mlClientSecret": "YOUR_SECRET_KEY",
  "proxyConfiguration": { "useApifyProxy": true, "apifyProxyGroups": ["RESIDENTIAL"] }
}
```

**Parameters:**
- `startUrls`: Product or listing URLs
- `itemIds`: Numeric IDs (assumes `country` if no prefix)
- `country`: Default country code (`MLC`, `MLA`, `MLM`, `MCO`, `MLU`, `MPE`)
- `maxReviews`: Maximum reviews per product (default: 100)
- `includeQuestions`: `true` to extract questions (requires `mlClientId` + `mlClientSecret`)
- `maxQuestions`: Maximum questions per listing (default: 50)
- `maxListingsPerProduct`: for catalog products, how many seller listings found in the reviews are queried for questions (default: 3)
- `mlClientId` / `mlClientSecret`: Client ID and Secret Key of your Mercado Libre app. The secret is a secret input (encrypted, never logged). The Actor gets the token itself via OAuth `client_credentials`
- `mlAccessToken`: alternative, a ready OAuth token (expires after 6 h)
- `proxyConfiguration`: Apify proxy config (recommended: RESIDENTIAL)

### Output

**One row per review:**
```json
{
  "type": "review",
  "siteId": "MLC",
  "country": "Chile",
  "objectId": "MLC37981310",
  "isCatalogProduct": true,
  "title": "HP 15.6 inch Notebook",
  "reviewId": 123456789,
  "rating": 5,
  "text": "Excellent product, very fast",
  "date": "2024-01-15T10:30:00.000Z",
  "relativeDate": "2 months ago",
  "likes": 3,
  "photoCount": 2,
  "variant": null
}
```

**One row per question:**
```json
{
  "type": "question",
  "siteId": "MLC",
  "country": "Chile",
  "objectId": "MLC467281714",
  "itemId": "MLC467281714",
  "questionId": 987654321,
  "question": "Does it have warranty?",
  "questionDate": "2024-01-10T14:20:00.000Z",
  "status": "ANSWERED",
  "answer": "Yes, 12 months official warranty",
  "answerDate": "2024-01-11T09:15:00.000Z"
}
```

### Note on Questions

Questions come from the **official API** `api.mercadolibre.com/questions/search` (paginated with `limit`/`offset`), because anonymous web endpoints return 403 or account verification. Questions belong to **individual listings** (`MLC-123..._JM`). For catalog products (`/p/MLC123`), the Actor detects the seller listings referenced in the product's reviews and fetches their questions (up to `maxListingsPerProduct`).

With credentials, the Actor first tries the official reviews API (`/reviews/item/{id}`). If your app isn't authorized (it currently returns 403 for regular apps), it falls back to the public endpoint automatically.

#### How to create your own Mercado Libre app (free)
1. Go to [developers.mercadolibre.com](https://developers.mercadolibre.com/), pick your country, sign in and open **My applications → Create new application**.
2. Fill in a name, a description and an https *Redirect URI* (for example, your GitHub URL). Under **Permissions**, read access to **pre/post-sale communications** is enough. Under OAuth flows, enable **Client credentials** (and **Refresh token**).
3. Save it. Copy the **Client ID** and **Secret Key** (⋮ menu → Edit) into `mlClientId` and `mlClientSecret`.

### How to Run Locally

```bash
# Install dependencies
npm install

# Run tests
npm test

# Compile TypeScript
npm run build

# Run locally (requires INPUT.json in storage/key_value_stores/default/)
npm start

# Or run with Apify CLI
apify run
```

**`storage/key_value_stores/default/INPUT.json` structure:**
```json
{
  "startUrls": [{ "url": "https://www.mercadolibre.cl/.../p/MLC37981310" }],
  "maxReviews": 50
}
```

### CI/CD

This project includes a GitHub Actions workflow that runs:
- `npm ci` (dependency installation)
- `npm run build` (TypeScript compilation)
- `npm test` (unit tests with Vitest)

CI runs on Node.js 20 on every push and pull request.

### Privacy

**This scraper DOES NOT store:**
- User names
- Nicknames
- User IDs
- Email addresses
- Phone numbers
- Any personal identity data

The code explicitly filters these fields to comply with privacy best practices.

### License

[MIT License](LICENSE) - René Del Valle Rodríguez

### More scrapers by ener90

- [Mercado Libre Price Tracker](https://apify.com/ener90/mercadolibre-seller-price-monitor) – Mercado Libre official-store price monitor
- [TrustRadius Reviews Scraper](https://apify.com/ener90/software-reviews-scraper) – B2B software reviews
- [Walmart Reviews Scraper](https://apify.com/ener90/walmart-products-reviews) – Walmart reviews and products
- [Product Hunt Scraper](https://apify.com/ener90/product-hunt-launches) – daily Product Hunt launches
- Chile Real Estate Scraper (`ener90/chile-real-estate-scraper`, coming soon)
- AI Review Insights (`ener90/ai-review-insights`, coming soon)

Need a custom scraper or a different site? Open an issue in the **Issues** tab.

### API & integrations quick start

**cURL (sync, returns items)**
```bash
curl -X POST "https://api.apify.com/v2/acts/ener90~mercadolibre-reviews-questions/run-sync-get-dataset-items?token=YOUR_APIFY_TOKEN" \
  -H "Content-Type: application/json" -d '{"startUrls":[{"url":"https://www.mercadolibre.cl/.../p/MLC123"}],"maxReviews":100}'
```

**Node.js**
```js
import { ApifyClient } from 'apify-client';
const client = new ApifyClient({ token: process.env.APIFY_TOKEN });
const run = await client.actor('ener90/mercadolibre-reviews-questions').call({"startUrls":[{"url":"https://www.mercadolibre.cl/.../p/MLC123"}],"maxReviews":100});
const { items } = await client.dataset(run.defaultDatasetId).listItems();
```

**Python**
```python
from apify_client import ApifyClient
client = ApifyClient("YOUR_APIFY_TOKEN")
run = client.actor("ener90/mercadolibre-reviews-questions").call(run_input={"startUrls":[{"url":"https://www.mercadolibre.cl/.../p/MLC123"}],"maxReviews":100})
items = client.dataset(run["defaultDatasetId"]).list_items().items
```

- **Google Sheets:** add the *Google Sheets* integration to a saved Task, or use `=IMPORTDATA("https://api.apify.com/v2/datasets/<DATASET_ID>/items?format=csv&clean=1")`.
- **n8n / Make / Zapier:** use the official Apify node or app: *Run Actor* (`ener90/mercadolibre-reviews-questions`) → *Get dataset items*.
- **Webhooks:** on a Task, add an integration *Run succeeded* → your URL (gets `defaultDatasetId`).
- **AI agents (MCP):** `https://mcp.apify.com?actors=ener90/mercadolibre-reviews-questions` works in Claude, ChatGPT, Cursor or any MCP client.
- **Free plan:** works on Apify's free tier; usage is billed per result (see Pricing). Start with small limits to try it out.

### Changelog
- 0.1 (2026-10-19): first public release; output schema, README with pricing, countries, FAQ; lower default memory (512 MB).

Issues or ideas? Open an issue in the **Issues** tab and I usually reply within a day.
