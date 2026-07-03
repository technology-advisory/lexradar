# LexRadar · Login y cuota semanal

## Objetivo

Proteger la beta privada y limitar el uso a **2 operaciones por usuario y semana**.

Una operación puede ser:

- `/search` → una búsqueda simple.
- `/research` → una investigación sin IA, que internamente puede lanzar varias búsquedas controladas.

## 1. Crear D1

En Cloudflare:

1. Workers & Pages.
2. D1 SQL Database.
3. Create database.
4. Nombre: `lexradar-db`.

## 2. Vincular D1 al Worker

En el Worker `lexradar-api`:

1. Settings.
2. Bindings.
3. Add binding.
4. Type: D1 database.
5. Variable name: `DB`.
6. Database: `lexradar-db`.
7. Save.

El Worker crea las tablas automáticamente en la primera llamada a `/me`, `/search` o `/research`.

## 3. Configurar Cloudflare Access

En Zero Trust:

1. Access → Applications.
2. Add an application.
3. Self-hosted.
4. Name: LexRadar.
5. Domain: `lexradar.es` o `technology-advisory.github.io` para pruebas.
6. Policy: Allow.
7. Emails: añade los correos de tus colegas.

Cloudflare Access enviará al Worker la cabecera:

`Cf-Access-Authenticated-User-Email`

Con ese email se calcula la cuota semanal.

## 4. Variables/secrets necesarios

En Worker → Settings → Variables and Secrets:

- `APIFY_TOKEN` como Secret.
- `DEV_USER_EMAIL` opcional para pruebas sin Access.

## 5. Comprobaciones

Abrir:

`https://lexradar-api.jolly-lab-c60a.workers.dev/me`

Debe devolver:

```json
{
  "ok": true,
  "user": { "email": "..." },
  "quota": { "limit": 2, "used": 0, "remaining": 2 }
}
```

## 6. Reset manual de cuota

Desde D1 puedes ejecutar:

```sql
DELETE FROM quotas WHERE user_email = 'correo@dominio.com';
```

O limpiar todas las cuotas:

```sql
DELETE FROM quotas;
```
