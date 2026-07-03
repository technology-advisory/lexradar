# LexRadar · Motor de investigación jurídica sin IA

## Qué hace

El modo investigación no usa IA. Funciona con reglas:

1. Interpreta la consulta de forma básica.
2. Genera hasta 3 búsquedas CENDOJ.
3. Lanza esas búsquedas desde el Worker.
4. Recupera resultados.
5. Deduplica por ECLI/ROJ/URL.
6. Ordena por fecha.
7. Genera una tabla técnica.

## Qué no hace todavía

- No redacta conclusiones doctrinales.
- No resume jurídicamente con LLM.
- No consulta TJUE hasta que se configure el actor correspondiente.

## Ejemplo

Consulta:

> Busca las sentencias clave del TJUE sobre el inicio del plazo de prescripción y compáralas con los últimos fallos del Tribunal Supremo español.

Plan generado para CENDOJ:

- gastos hipotecarios prescripción principio de efectividad
- dies a quo gastos hipotecarios prescripción consumidor
- gastos hipotecarios TJUE prescripción Tribunal Supremo

## TJUE

El Worker está preparado para añadir una variable:

`APIFY_TJUE_ACTOR_ID`

Cuando tengamos el actor exacto, se añade una rama europea paralela.
