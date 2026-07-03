# LexRadar API Contract

## POST /search

Request:

```json
{
  "source": "cendoj",
  "query": "gastos hipotecarios",
  "maxResults": 10
}
```

Response esperado:

```json
{
  "ok": true,
  "source": "CENDOJ",
  "count": 1,
  "results": [
    {
      "id": "...",
      "source": "CENDOJ",
      "date": "2026-06-18",
      "court": "Tribunal Supremo / Sala Civil",
      "jurisdiction": "Civil",
      "identifier": "ECLI... / STS...",
      "ecli": "ECLI...",
      "roj": "STS...",
      "title": "...",
      "summary": "...",
      "url": "https://..."
    }
  ]
}
```
