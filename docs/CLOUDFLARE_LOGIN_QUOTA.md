# LexRadar v0.6 · Login y límite de 2 búsquedas/semana

## Qué incluye

- Endpoint `GET /me` para mostrar usuario y cuota.
- Endpoint `POST /search` con límite real de **2 búsquedas por usuario y semana**.
- Persistencia en Cloudflare D1.
- Preparado para Cloudflare Access / Zero Trust.

## Pasos en Cloudflare

### 1. Crear D1

Cloudflare → Workers & Pages → D1 → Create database

Nombre sugerido:

```text
lexradar-db
```

### 2. Vincular D1 al Worker

Worker `lexradar-api` → Settings → Bindings → Add binding → D1 database

- Variable name: `DB`
- Database: `lexradar-db`

### 3. Mantener el secreto de Apify

Ya creado:

```text
APIFY_TOKEN
```

### 4. Pegar código del Worker

Copia el contenido de:

```text
worker/worker.js
```

en el editor del Worker y pulsa Deploy.

### 5. Login real

Para login real, configura Cloudflare Access cuando tengas el dominio:

- Proteger `lexradar.es/app/*` o todo `lexradar.es`
- Proteger `api.lexradar.es/*` si pones el Worker en un subdominio API
- Permitir solo emails autorizados

El Worker leerá el usuario desde:

```text
Cf-Access-Authenticated-User-Email
```

Mientras no esté Access configurado, usará:

```text
dev@lexradar.local
```

y el límite será global para esa cuenta de prueba.
