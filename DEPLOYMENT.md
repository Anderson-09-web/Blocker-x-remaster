# Guía: desplegar Blocker X (Netlify + Render)

Northflank ahora pide tarjeta para verificar la cuenta, así que este proyecto se despliega con dos servicios **sin tarjeta**:

1. **Web (frontend)** → **Netlify** — sitio estático, se genera con `netlify.toml` en la raíz del repo.
2. **API Server (backend)** → **Render** (free tier, no pide tarjeta) — necesita un proceso corriendo todo el tiempo, algo que Netlify no puede darle (ver la sección "Por qué el backend no puede ir en Netlify" más abajo).

## Resumen rápido (comandos de build)

| Servicio | Dónde | Build | Start |
|---|---|---|---|
| Web | Netlify | `pnpm install --frozen-lockfile && pnpm --filter @workspace/blockerx run build` | Netlify sirve `artifacts/blockerx/dist/public` como sitio estático |
| API Server | Render | `pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build` | `node --enable-source-maps artifacts/api-server/dist/index.mjs` |

En los dos casos, el **contexto/root del build debe ser la raíz del repo** (no la carpeta del artifact), porque usan pnpm workspaces y necesitan acceso a `lib/*`.

## Por qué el backend no puede ir en Netlify (Netlify Functions)

Se evaluó convertir el API Server a Netlify Functions y **no es posible** sin rehacer la funcionalidad central de Blocker X. Los motivos concretos:

1. **Los bots corren como procesos hijos de larga duración dentro del propio servidor.** Cuando creas o inicias un bot, Blocker X hace `spawn()` de un proceso Python/Node y lo mantiene vivo en memoria mientras el bot está "encendido" — a veces por días. Una Netlify Function se ejecuta, responde, y se apaga (10 segundos por defecto, hasta 15 minutos como "background function" en el plan pago); no existe un modo de dejar un proceso corriendo indefinidamente.
2. **No hay servidor persistente que escuche un puerto.** El código actual hace `app.listen(port)` una sola vez al arrancar y se queda escuchando para siempre. Netlify no ejecuta "un servidor"; ejecuta funciones individuales bajo demanda (AWS Lambda por debajo), sin un puerto propio ni proceso continuo.
3. **El estado de los bots vive en memoria del proceso (`Map` de procesos activos), no solo en la base de datos.** Cada invocación de una Netlify Function es una instancia nueva y aislada — no comparte memoria con la invocación anterior ni con los procesos hijos que pudiera haber creado otra. Se perdería la referencia a los bots corriendo entre una petición y la siguiente.

En resumen: Netlify Functions sirve muy bien para lógica sin estado y de corta duración (ej. un endpoint que solo consulta la base de datos), pero Blocker X necesita un servidor que viva permanentemente para sostener los procesos de los bots. Por eso el backend se queda en un servicio tipo "web service" tradicional.

## 1. Frontend en Netlify

Ya está todo configurado en `netlify.toml` (raíz del repo):

- **Build command:** `pnpm install --frozen-lockfile && pnpm --filter @workspace/blockerx run build`
- **Publish directory:** `artifacts/blockerx/dist/public`
- **Redirects:** todas las rutas (`/*`) devuelven `index.html` con status 200, porque Blocker X es una SPA (usa `wouter` para el ruteo del lado del cliente) — sin esto, refrescar una página como `/dashboard/bots` daría 404.

### Pasos en Netlify

1. "Add new site" → "Import an existing project" → conecta el repo de GitHub.
2. Netlify detecta `netlify.toml` automáticamente (build command y publish directory ya quedan configurados).
3. Agrega esta variable de entorno en Site settings → Environment variables:

| Variable | Para qué |
|---|---|
| `VITE_API_URL` | URL pública de tu servicio de Render (ej. `https://blocker-x-api.onrender.com`). El frontend la necesita para saber a dónde mandar sus peticiones, ya que quedan en dominios distintos. |

> Importante: `VITE_API_URL` y `BASE_PATH` se usan **al momento del build** (Vite las incrusta en el bundle), no en runtime. Si cambias `VITE_API_URL` después de desplegar, tienes que volver a lanzar un deploy (Netlify lo hace solo si rehaces el build).

## 2. Backend en Render (free, sin tarjeta)

Render tiene un plan gratuito para "Web Services" que no pide tarjeta de crédito. Ya dejé un `render.yaml` en la raíz del repo con la configuración lista (Render lo detecta solo si usas "Blueprint").

### Pasos en Render

1. Entra a render.com, conecta tu cuenta de GitHub.
2. "New" → "Blueprint" → selecciona el repo. Render lee `render.yaml` y prepara el servicio `blocker-x-api` automáticamente.
   - Si prefieres configurarlo a mano en vez de con Blueprint: "New" → "Web Service", root del build = raíz del repo, build command y start command como en la tabla de arriba.
3. Completa las variables de entorno marcadas como "sync: false" en `render.yaml` (Render te las pedirá al crear el servicio):

| Variable | Para qué sirve |
|---|---|
| `NEON_DATABASE_URL` | Conexión a tu base de datos Postgres (Neon). Copia el mismo valor que usas aquí en Replit, o crea una base nueva para producción. |
| `SESSION_SECRET` | Firma las cookies de sesión — `render.yaml` ya pide a Render que genere un valor aleatorio automáticamente. |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | OAuth de Discord para login y gestión de bots. |
| `CF_R2_ACCOUNT_ID` / `CF_R2_ACCESS_KEY_ID` / `CF_R2_SECRET_ACCESS_KEY` / `CF_R2_BUCKET_NAME` | Cuenta y bucket de Cloudflare R2 (almacenamiento de archivos de los bots). |
| `GROQ_API_KEY` | Funciones de IA del panel (si aplica). |
| `PORT` | Render la inyecta automáticamente — no la definas a mano. |

4. Si usas una base de datos distinta a la de Replit para producción, corre una vez `pnpm --filter @workspace/db run push` contra la base nueva para crear todas las tablas. El server también aplica migraciones menores automáticamente al arrancar.

### Limitación del plan gratuito de Render

El plan free de Render **apaga el servicio tras ~15 minutos sin recibir tráfico HTTP** y tarda unos segundos en "despertar" con la siguiente petición. Como los bots de Discord corren como procesos dentro de ese mismo servicio, si el servicio se apaga por inactividad, los bots también se detienen hasta que llegue una nueva petición HTTP y el servicio despierte de nuevo. Para producción real (bots que deben estar encendidos 24/7) esto es una limitación real; las opciones para evitarlo son:
- Un "ping" externo periódico (cron gratuito, ej. UptimeRobot) que golpee `/api/healthz` cada 10 minutos para mantenerlo despierto — funciona, pero no está garantizado al 100% por las políticas de Render.
- Subir al plan pago de Render (a partir de unos $7/mes) para un servicio que nunca se apaga.

## 3. CORS

El API Server ya tiene CORS configurado para aceptar cualquier origen con `credentials: true` (`cors({ origin: true, credentials: true })`), así que no hace falta tocar código para que el frontend en Netlify (dominio distinto) pueda autenticarse — las cookies de sesión funcionan igual siempre que ambos servicios usen HTTPS (Netlify y Render lo dan por defecto).

## 4. Discord OAuth callback

Si usas login con Discord, actualiza la "Redirect URI" en el Discord Developer Portal para que apunte al dominio de tu API Server en Render (ej. `https://blocker-x-api.onrender.com/api/auth/discord/callback`), además de mantener la de Replit si sigues usando ambos entornos.

## Checklist rápido

- [ ] Conectar el repo en Netlify — build y publish directory ya quedan listos vía `netlify.toml`.
- [ ] Agregar `VITE_API_URL` en Netlify apuntando al dominio de Render.
- [ ] Crear el Blueprint en Render con `render.yaml` y completar las variables marcadas como "sync: false".
- [ ] Correr `pnpm --filter @workspace/db run push` contra la base de producción una vez, para crear las tablas.
- [ ] Actualizar el redirect URI de Discord OAuth al dominio de Render.
- [ ] Verificar que `https://<tu-api>.onrender.com/api/healthz` responda 200.
- [ ] Abrir el sitio de Netlify y confirmar que el login y el listado de bots cargan sin errores de CORS en la consola.
- [ ] (Opcional) Configurar un ping periódico a `/api/healthz` para reducir el "sleep" del plan free de Render.
