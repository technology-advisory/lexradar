# LexRadar v1.2

Motor de investigación jurídica sin IA para beta privada.

## Incluye

- Login local de prueba.
- Usuario `macarriazo` sin límite.
- Usuario `jlpinter` con 5 búsquedas/semana.
- Búsqueda simple en CENDOJ, TJUE o ambas fuentes.
- Investigación sin IA: varias búsquedas, deduplicación, cronología y tabla comparativa.
- Modo “Búsqueda con IA” sin IA real: simula una investigación asistida con reglas, sin consumir tokens.
- Exportación JSON y CSV.
- Sin exportación Excel por ahora.

## Reset del contador local

Consola del navegador:

```js
localStorage.removeItem('lexradar.quota.v1')
```

## Worker

Copia `worker/worker.js` en Cloudflare Worker y despliega.

Debe existir el secret:

```text
APIFY_TOKEN
```

D1 es opcional en esta versión. Si vinculas `DB`, el Worker también podrá llevar cuota del lado servidor.


## v1.2 Beta UX
- Hero más compacto.
- Modos renombrados: búsqueda directa, investigación jurídica e IA próximamente.
- Selector visual CENDOJ/TJUE/Ambas.
- Mensajes de error más claros.
- Footer de producto.


## v1.2

- Selector visual CENDOJ / TJUE / Ambas funcional.
- El frontend envía `source: cendoj`, `source: tjue` o `source: both` al Worker.
