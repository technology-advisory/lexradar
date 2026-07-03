# TJUE + IA sin IA

## Fuentes

La versión v1.0 permite consultar:

- CENDOJ
- TJUE
- CENDOJ + TJUE

## Búsqueda con IA sin IA

No llama a OpenAI, Claude ni ningún LLM.

El modo funciona así:

1. Detecta intención por reglas.
2. Genera consultas jurídicas internas.
3. Lanza búsquedas en CENDOJ/TJUE.
4. Deduplica resultados.
5. Ordena por fecha.
6. Genera tabla comparativa/cronología.

## Ejemplo recomendado

```text
Busca las sentencias clave del TJUE sobre el inicio del plazo de prescripción y compáralas con los últimos fallos del Tribunal Supremo español.
```

Selecciona fuente: `CENDOJ + TJUE`.
Modo: `Búsqueda con IA (sin IA / beta)`.
