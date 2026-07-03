# Login local de beta

Esta versión usa un login simple cargado desde `data/users.json`. Es suficiente para pruebas controladas, pero no es seguridad real de producción porque las credenciales están en el frontend.

## Usuarios de prueba

- `macarriazo`: sin límite semanal.
- `jlpinter`: 5 búsquedas por semana.

## Dónde se guarda el contador

El contador se guarda en el navegador, en `localStorage`, clave:

```text
lexradar.quota.v1
```

## Cómo resetear el contador

Opción rápida desde navegador:

1. F12 → Application / Aplicación.
2. Local Storage.
3. Buscar la clave `lexradar.quota.v1`.
4. Borrarla.
5. Recargar la página.

También puedes ejecutar en consola:

```js
localStorage.removeItem('lexradar.quota.v1')
```

El usuario `macarriazo` tiene además un botón **Reset contador** en la caja de cuenta.

## Producción

Antes de abrir la beta a más gente, esta lógica debe moverse al Worker con D1 para que nadie pueda saltarse la cuota.
