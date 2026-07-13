# Guía: desplegar Blocker X en Northflank

Este proyecto tiene dos partes separadas y necesitan **dos servicios** en Northflank:

1. **API Server** (`artifacts/api-server`) — backend Express + Postgres. Ejecuta el panel, la gestión de bots y sus procesos.
2. **Web (blockerx)** (`artifacts/blockerx`) — frontend Vite/React que habla con el API Server.

> Importante: los bots de Discord (procesos Python/Node que Blocker X arranca) corren **dentro del proceso del API Server** (child processes). Northflank debe darle al servicio del API Server suficiente CPU/RAM para correr tanto el panel como los bots de tus usuarios, y el servicio no debe reiniciarse constantemente (los bots en memoria se pierden en cada reinicio, aunque al arrancar se resetea el estado en la base de datos para evitar inconsistencias).

## 1. Servicio: API Server

- **Tipo:** Combined/Deployment service (Node.js).
- **Build:**
  - Root/context: raíz del monorepo (necesita acceso a `lib/*` vía pnpm workspaces).
  - Comando de build: `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build`
  - Comando de start: `pnpm --filter @workspace/api-server run start`
- **Puerto:** Northflank asigna el puerto vía la variable `PORT` — el server ya lee `process.env.PORT`, no hay que tocar código.
- **Health check:** cualquier ruta bajo `/api` que responda 200 con sesión anónima (o agrega un endpoint `/api/health` simple si Northflank lo requiere).

### Variables de entorno (API Server)

| Variable | Para qué sirve |
|---|---|
| `NEON_DATABASE_URL` | Conexión a tu base de datos Postgres (Neon). Copia el mismo valor que usas aquí en Replit, o crea una base nueva en Neon para producción. |
| `SESSION_SECRET` | Firma las cookies de sesión. Usa un valor largo y aleatorio distinto al de desarrollo. |
| `DISCORD_CLIENT_ID` | OAuth de Discord para login/gestión de bots. |
| `DISCORD_CLIENT_SECRET` | Secreto OAuth de Discord — nunca lo publiques en el frontend. |
| `CF_R2_ACCOUNT_ID` | Cuenta de Cloudflare R2 (almacenamiento de archivos de los bots). |
| `CF_R2_ACCESS_KEY_ID` | Access key de R2. |
| `CF_R2_SECRET_ACCESS_KEY` | Secret key de R2. |
| `CF_R2_BUCKET_NAME` | Nombre del bucket de R2. |
| `GROQ_API_KEY` | Usado por las funciones de IA del panel (si aplica). |
| `NODE_ENV` | Ponlo en `production`. |
| `PORT` | Northflank la inyecta automáticamente — no la definas a mano. |

Si vas a usar una base de datos distinta a la de Replit para producción, crea el proyecto en Neon (o Northflank Postgres addon) y actualiza `NEON_DATABASE_URL`. Al arrancar, el server ejecuta migraciones/ajustes de esquema automáticamente (`runStartupMigrations`), pero necesitas correr `pnpm --filter @workspace/db run push` una vez contra la base nueva para crear todas las tablas base.

## 2. Servicio: Web (blockerx)

- **Tipo:** Static site (recomendado) o servicio Node sirviendo `vite preview`.
- **Build:**
  - Comando de build: `pnpm install --frozen-lockfile && pnpm --filter @workspace/blockerx run build`
  - Carpeta de salida: `artifacts/blockerx/dist/public`
  - Comando de start (si usas servicio Node en vez de static hosting): `pnpm --filter @workspace/blockerx run serve`

### Variables de entorno (Web)

| Variable | Para qué sirve |
|---|---|
| `VITE_API_URL` | URL pública del servicio API Server en Northflank (ej. `https://api-xxxxx.northflank.app`). Como el frontend y el backend son servicios separados (dominios distintos), el frontend necesita esta variable para saber a dónde mandar sus requests — sin ella, intentará llamar a rutas relativas `/api/...` en su propio dominio y fallarán. |
| `BASE_PATH` | Déjalo en `/` para un despliegue standalone (no hace falta el prefijo de artifact que usa Replit). |
| `PORT` | Northflank la inyecta automáticamente. |

Estas dos variables son **de build**, no solo de runtime — Vite las incrusta en el bundle al momento de compilar. Si las cambias después, tienes que volver a correr el build (Northflank hace esto automáticamente en cada deploy si están configuradas como build args/env vars del servicio).

## 3. CORS

El API Server ya tiene CORS configurado para aceptar cualquier origen con `credentials: true` (`cors({ origin: true, credentials: true })`), así que no necesitas tocar código para que el frontend en un dominio distinto pueda autenticarse — las cookies de sesión funcionan igual siempre que ambos servicios usen HTTPS (Northflank lo da por defecto).

## 4. Discord OAuth callback

Si usas login con Discord, actualiza la "Redirect URI" en el Discord Developer Portal para que apunte al dominio de tu API Server en Northflank (ej. `https://api-xxxxx.northflank.app/api/auth/discord/callback`), además de mantener la de Replit si sigues usando ambos entornos.

## 5. Archivos de Render que puedes ignorar

Este repo trae restos de un intento anterior de deploy en Render (`render.yaml`, `RENDER_DEPLOYMENT.md`, `Procfile` si existen). No son necesarios para Northflank — Northflank usa su propio sistema de build a partir de los comandos que configures en su dashboard, no lee esos archivos. Puedes dejarlos o borrarlos, no afectan el despliegue.

## Checklist rápido

- [ ] Crear servicio API Server con las 9 variables de la tabla de arriba.
- [ ] Correr `pnpm --filter @workspace/db run push` contra la base de producción una vez, para crear las tablas.
- [ ] Crear servicio Web con `VITE_API_URL` apuntando al dominio del API Server.
- [ ] Actualizar el redirect URI de Discord OAuth.
- [ ] Verificar que `/api/webhooks/events` responda 200 desde el dominio del API Server (confirma que el backend está vivo).
- [ ] Abrir el dominio del Web y confirmar que el login y el listado de bots cargan sin errores de CORS en la consola.
