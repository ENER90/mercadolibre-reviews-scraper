# Mercado Libre Reviews & Preguntas Scraper

Saca las opiniones y las preguntas de cualquier producto de Mercado Libre en Chile, Argentina, México, Colombia, Perú y Uruguay, y te las deja en una tabla lista para Excel, CSV, JSON o Google Sheets. Lo hice porque necesitaba leer lo que decían los compradores de varios productos sin copiar opiniones a mano.

Si prefieres verlo funcionando antes de probarlo, grabé un tutorial corto en video:

https://www.youtube.com/watch?v=gTivXLYODZY

No guarda nombres ni apodos de quienes opinan o preguntan.

![Formulario de entrada con la URL de un producto](https://raw.githubusercontent.com/ENER90/mercadolibre-reviews-scraper/main/docs/screenshots/01-input.png)

## Qué datos obtienes

| Campo | Ejemplo real | Para qué sirve |
|---|---|---|
| `rating` | `5` | Estrellas de 1 a 5 |
| `text` | "Bien producto. Bajos de buena calidad. Sonido agradable…" | El comentario completo |
| `date` | `2024-11-18T16:46:25Z` | Cuándo se escribió |
| `likes` | `7` | Cuánta gente lo marcó como útil |
| `photoCount` | `3` | Cuántas fotos subió el comprador |
| `title` / `objectId` | "audifonos bluetooth in ear tws buds10 master g" / `MLC37981310` | De qué producto es |
| `country` / `siteId` | `Chile` / `MLC` | De qué país |

Si activas las preguntas, cada una sale en su propia fila con `question`, `answer`, `questionDate`, `answerDate` y `status`.

![Tabla de opiniones reales](https://raw.githubusercontent.com/ENER90/mercadolibre-reviews-scraper/main/docs/screenshots/02-output-table.png)

## Cuánto cuesta

Pagas US$1 por cada 1.000 resultados. Cada opinión o pregunta cuenta como un resultado. Si un producto no tiene opiniones no se cobra nada.

| Ejemplo | Resultados | Costo |
|---|---|---|
| 1 producto con 100 opiniones | 100 | US$0,10 |
| 20 productos × 50 opiniones | 1.000 | US$1,00 |
| 100 productos × (100 opiniones + 20 preguntas) | 12.000 | US$12,00 |

Con el plan gratis de Apify (US$5 de crédito al mes) te alcanza para unas 5.000 opiniones al mes. Si activas el análisis con IA se suman US$0,20 por cada 1.000 opiniones analizadas, y los tokens los paga tu propia key.

Como referencia, una ejecución real con 20 opiniones y el análisis con IA activado tardó 74 segundos.

## Cómo usarlo

1. Crea una cuenta gratis en Apify y abre este actor.
2. En **Product / listing URLs** pega la URL del producto. Sirve la de catálogo (`…/p/MLC37981310`) o la de la publicación (`articulo.mercadolibre.cl/MLC-…`). Si tienes IDs sueltos, ponlos en **Item / product IDs**.
3. En **Max reviews per product** elige cuántas opiniones quieres por producto. Empieza con 20 para probar.
4. Si los IDs son números sin prefijo, elige el país en **Default country (site)**.
5. Aprieta **Start**. Cuando termine, los resultados aparecen en la pestaña **Output**, y desde ahí los bajas como Excel o CSV.
6. Opcional: marca **Include questions & answers** para traer también las preguntas. Para eso necesitas tu propia app gratuita de Mercado Libre (Client ID y Secret).

## Ejemplo de entrada

```json
{
  "startUrls": [{ "url": "https://www.mercadolibre.cl/audifonos-bluetooth-in-ear-tws-buds10-master-g/p/MLC37981310" }],
  "country": "MLC",
  "maxReviews": 20,
  "includeQuestions": false
}
```

## Ejemplo de salida

```json
{
  "type": "review",
  "siteId": "MLC",
  "country": "Chile",
  "objectId": "MLC37981310",
  "isCatalogProduct": true,
  "title": "audifonos bluetooth in ear tws buds10 master g",
  "rating": 5,
  "text": "Bien producto. Bajos de buena calidad. Sonido agradable…",
  "date": "2024-11-18T16:46:25Z",
  "likes": 7,
  "photoCount": 3
}
```

## Resumen con IA (opcional)

Si no quieres leer 500 opiniones, activa **AI insights per product** y pega tu key de Gemini (es gratis en aistudio.google.com) o de OpenAI en **AI API key**. Al final te agrega una fila por producto con el porcentaje de opiniones positivas, los pros y contras que más se repiten, lo que piden los clientes, citas textuales y un resumen. El idioma lo eliges en **AI output language**.

![Resumen con IA de un producto](https://raw.githubusercontent.com/ENER90/mercadolibre-reviews-scraper/main/docs/screenshots/03-output-json.png)

## Para qué lo uso

- Antes de traer un producto para vender, reviso de qué se quejan los compradores de la competencia.
- Si ya vendo algo, sigo las opiniones para ver si un lote salió malo.
- Comparo dos o tres modelos parecidos según lo que dice la gente y no según la ficha.
- Junto las preguntas frecuentes para mejorar la descripción de mi publicación.

## Integraciones

- **Google Sheets, Make, Zapier y n8n:** usa la app oficial de Apify con "Run Actor" (`ener90/mercadolibre-reviews-questions`) y después "Get dataset items".
- **API:** un POST devuelve los resultados directo:

```bash
curl -X POST "https://api.apify.com/v2/acts/ener90~mercadolibre-reviews-questions/run-sync-get-dataset-items?token=TU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"startUrls":[{"url":"https://www.mercadolibre.cl/.../p/MLC37981310"}],"maxReviews":20}'
```

```python
from apify_client import ApifyClient
client = ApifyClient("TU_TOKEN")
run = client.actor("ener90/mercadolibre-reviews-questions").call(run_input={"itemIds": ["MLC37981310"], "maxReviews": 20})
for item in client.dataset(run["defaultDatasetId"]).iterate_items():
    print(item["rating"], item.get("text"))
```

- **Agentes de IA:** agrégalo a tu servidor [Apify MCP](https://mcp.apify.com) (Claude, ChatGPT, Cursor) y pídele "analiza las opiniones de este producto de Mercado Libre".

## Limitaciones

- Las URLs de tipo `/up/MLCU…` no tienen opiniones públicas. Abre la publicación y copia su URL (`…/MLC-123456789-…`) o la de catálogo (`…/p/MLC123`).
- Las preguntas salen de la API oficial de Mercado Libre, así que piden tu propia app (Client ID y Secret, o un access token). Las opiniones no piden nada.
- En productos de catálogo, las preguntas se traen de hasta **Max listings per catalog product** publicaciones, porque cada vendedor tiene las suyas.

## Preguntas frecuentes

**¿Necesito cuenta de Mercado Libre?** Para las opiniones no. Para las preguntas necesitas una app gratuita en developers.mercadolibre.com.

**¿Qué pasa si una URL está mala?** La ejecución no se cae: esa URL sale como una fila `type: "error"` que explica qué pasó, y el resto sigue. Esa fila cuenta como un resultado (US$0,001).

**¿Puedo correrlo todos los días?** Sí. Guarda el input como Task y ponle un Schedule.

**¿Es legal?** Solo saca datos públicos y no guarda datos personales. Revisa igual los términos de Mercado Libre y las leyes de tu país para tu caso.

## Otros actores míos

- [Mercado Libre Price Tracker](https://apify.com/ener90/mercadolibre-seller-price-monitor): avisa cuando cambian los precios de una tienda oficial.
- [Chile Real Estate](https://apify.com/ener90/chile-real-estate-scraper): propiedades de Portal Inmobiliario y TocToc.
- [AI Review Insights](https://apify.com/ener90/ai-review-insights): resume opiniones de cualquier fuente con IA.

In English: this Actor scrapes Mercado Libre product reviews (rating, text, date, likes, photo count) and, optionally, questions and answers, for Chile, Argentina, Mexico, Colombia, Peru and Uruguay. Paste a product URL, set **Max reviews per product** and hit Start. It costs US$1 per 1,000 results, and the optional AI summary adds US$0.20 per 1,000 reviews analyzed, using your own Gemini or OpenAI key. The input and output examples above use the same field names.
