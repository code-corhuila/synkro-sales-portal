# synkro-sales-portal

> sales bounded context: web UI (remote)

Part of the **SynkroTech SAS Sales Management System** — organization `code-corhuila`.
Governance and documentation live in [`synkro-docs`](https://github.com/code-corhuila/synkro-docs).

## HU-VEN-11 — historial real

Remoto React de SynkroTech para [la historia #241](https://github.com/code-corhuila/synkro-docs/issues/241). Node 22, React 19, TypeScript estricto, Vite y `@originjs/vite-plugin-federation`, siguiendo Products/develop. El lockfile fija React/React DOM 19.3.0, igual que los lockfiles actuales de Products y el host; todos declaran `^19.2.8`.

```sh
npm ci
npm run lint
npm run build
npm run test -- --coverage
npm run check:compiled
npm run preview
```

Preview sirve `http://localhost:5176/assets/remoteEntry.js`. El host monta `salesPortal/App` en `/sales`. El HTML independiente solo informa cómo abrir el portal; no monta otro router, navegación, fuentes, sesión ni cliente HTTP. Para federation se usa build + preview, no el servidor dev de Vite.

El remoto consume `shell/apiClient` y `shell/session` desde el entry del host (por defecto `http://localhost:5173/assets/remoteEntry.js`). Comparte React/React DOM. La configuración comprobada de Products (`target: esnext`, sin module preload/CSS split/minificación) preserva la sustitución de placeholders CSS. `check:compiled` verifica entry estable, exportación de App, placeholders resueltos y ausencia de transporte propio, URLs API absolutas o credenciales.

Solo solicita `GET /api/v1/sales` con `page=1`, `limit=20` y opcionalmente `from`, `to`, `customerId`. Las fechas se envían como días UTC inclusivos sin conversión local. El formulario valida calendario, orden del rango y UUID completo, asocia errores a campos y enfoca el primer inválido. Aplicar/limpiar filtros vuelve a la página 1. La paginación usa todos los campos de `meta`, rechaza páginas inválidas y corrige páginas desaparecidas tras una recarga.

Cada cambio cancela la petición anterior y descarta respuestas tardías. Loading mantiene encabezado y filtros con filas skeleton; error muestra copia española y traceId; empty permite limpiar o recargar; data usa solo la respuesta del servidor. Retry conserva página y filtros aplicados. `401` deja sesión/redirección al host; `403` muestra acceso denegado sin retry automático ni datos alternativos. La identidad compartida solo determina el texto introductorio. El servidor aplica el scope de ADMIN/SALESPERSON y el host bloquea INVENTORY: no hay filtros de propiedad ni filtrado de autorización en memoria.

Fechas: `es-CO`, `America/Bogota`. Total autoritativo: COP con dos decimales mediante división/resto BigInt, sin sumar líneas ni hacer cálculos financieros flotantes. El host deserializa int64 como number; la precisión perdida fuera de `Number.MAX_SAFE_INTEGER` no puede recuperarse. En esos casos se muestra «Importe fuera del rango seguro». Admitir exactamente todo int64 requiere una futura decisión del contrato compartido; aquí no se cambia el transporte.

El historial muestra el UUID completo del cliente, sin N+1; el nombre se resuelve solo en el detalle (HU-VEN-12). `Ver` abre `/sales/{id}`.

CSS Modules consumen los tokens del host en ambos temas. No hay `:root`, colores ni fuentes globales propios. Véanse [paridad visual](docs/visual-parity.md) y [verificación y bloqueo del host](docs/verification.md).

Vitest, Testing Library, user-event, jsdom y V8 usan aliases a dobles de shell. Los datos simulados aparecen solo en tests. Las pruebas unitarias no hacen HTTP ni requieren backend/bases de datos. El mínimo de statements es 70% global y 70% para Sales; todos los módulos de producción participan.

## HU-VEN-12 — registro por saga y detalle compuesto

Extiende `/sales` (sin ruta de registro aparte) y añade `/sales/{id}`; referencia `Refs code-corhuila/synkro-docs#246`. Contratos: `synkro-workflow.yaml` 2.1.0, `synkro-sales-api.yaml` 2.1.0, `synkro-customers-api.yaml` 2.0.0, `synkro-products-api.yaml` (docs/main).

**Formulario «Nueva venta».** Cliente por documento exacto (`GET /api/v1/customers?identityDocument=`, único filtro documentado; solo clientes activos son seleccionables) y productos por nombre (`GET /api/v1/products?name=&active=true&limit=10`). No se precarga ningún catálogo. De 1 a 100 líneas, cantidades enteras positivas, un producto una sola vez, errores junto al campo, «Limpiar», total estimado rotulado «referencial» (precio de catálogo × cantidad con enteros exactos; nunca autoritativo). Sin llamadas al backend si la validación cliente falla.

**Registro.** Solo `POST /api/v1/sagas/register-sale` con `{ customerId, lines: [{ productId, quantity }] }` (lista blanca en `workflowApi.ts`) y `GET /api/v1/sagas/{id}`, mediante `shell/apiClient`. Nunca se envían `createdBy`, precios, subtotales, totales, `saleId` ni credenciales SERVICE, y el navegador no llama a `POST /sales`.

**Idempotencia.** Una clave `crypto.randomUUID()` por intención (cliente + conjunto de líneas, independiente del orden). Un fallo de red/timeout/5xx conserva la clave: reintentar la misma solicitud la reutiliza, sin reintentos automáticos. Cambiar cliente, producto o cantidad crea una intención y clave nuevas. Si ya se conoce la saga se observa; no se envía otro POST. Un resultado `COMPENSATED` cierra la intención: repetirla es una intención nueva.

**Estados de la saga** (`sagaMachine.ts`, `useRegisterSale.ts`): `RUNNING` → «Procesando venta…» con sondeo acotado (1 s, 2 s, 3 s, luego 5 s; máximo 120 s; se cancela al desmontar o sustituir). `COMPLETED` exige `saleId`, confirma «Venta registrada», lee el total autoritativo con `GET /sales/{saleId}`, recarga el historial en la página 1 y limpia el formulario. `COMPENSATED` muestra el texto aprobado (paso en español, sin enum), conserva el formulario. `FAILED` es un aviso de atención con el ID de la saga; no afirma reversión ni invita a reintentar como venta nueva. Agotar el tiempo o perder la consulta deja la saga *sin resolver* (ni éxito ni fracaso) con «Consultar estado».

**Detalle.** `GET /sales/{id}` es autoritativo; luego un `GET /customers/{id}` y un `GET /products/{id}` por producto distinto, con concurrencia máxima 4. Si faltan, se muestra el identificador almacenado y un aviso con «Reintentar información»; los precios y totales son siempre los congelados de Sales. `404` → «Venta no encontrada»; `403` → `/sales` (reemplazando la entrada del historial) con aviso en español; otros errores → alerta con «Reintentar».

**Navegación.** `src/navigation.ts` sigue el patrón de Products (`pushState` + `popstate`). Como `/sales` y `/sales/{id}` son una sola ruta del host (`/sales/*`), el host no vuelve a renderizar el remoto al pasar de una a otra; `App` se suscribe a `popstate` por sí misma (hallazgo de la verificación en navegador; el aviso del 403 viaja en el estado de la entrada del historial, no en la URL ni en el almacenamiento).

Evidencia, brechas de contrato y dependencias reales pendientes: [verificación HU-VEN-12](docs/verification-hu-ven-12.md). La paridad visual está en [docs/visual-parity.md](docs/visual-parity.md).

## Contenedor y CI

```sh
docker build -f deploy/Dockerfile -t synkro-sales-portal:local .
docker run --rm -e HOST_ORIGIN=http://localhost:5173 synkro-sales-portal:local nginx -t
docker compose --env-file .env -f deploy/compose.yml up --build
```

Copiar `.env.example` a `.env` para configurar el entry del host (build) y su origen CORS (runtime). No se configura gateway ni credenciales. El build usa Node 22 + npm ci; Compose expone 80 solo en platform y no publica puertos; el host sirve /remotes/sales/. Nginx envsubst solo sustituye HOST_ORIGIN. Entry con `Cache-Control: no-store`; chunks con hash y caché immutable. Compose cubre únicamente este portal.

CI conserva los archivos comunes y verifica lint, build, cobertura, bundle, imagen y Nginx. Corre para PR dirigidos a develop/qa/main y push en esas ramas, sin trigger permanente para esta feature.

## Branching

Three permanent branches. **None of them accepts a direct commit** — you enter through a child
branch and leave through a Pull Request.

```
develop  <--PR--  feat/... fix/... chore/...
qa       <--PR--  qa/...
main     <--PR--  release/...  hotfix/...
```

Promotion happens **by re-application** (`git cherry-pick -x`), never by merging one permanent
branch into another: `merge develop -> qa` and `merge qa -> main` do not exist in this model.

`main` requires **1 approval from `ariel5253`**. On `develop` and `qa` the team sets its own review
rule.

Full policy: `00-governance/branching-policy.md` in `synkro-docs`.

## Internal root delivery

HU-VEN-12 current status: [verification and integration gates](docs/verification-hu-ven-12.md).
Intent recovery uses the [Host session lifecycle contract](docs/session-recovery-proposal.md)
released in Front `v2.0.0` (`c43d024`). On older Hosts without it, new
registration is disabled; history and composed detail remain available.
This portal change does not modify Front or ratify a pending architectural decision.

The owning Compose service keeps DNS `synkro-sales-portal`, exposes HTTP 80 internally, and joins external `platform`; it publishes no host port. The host proxies `/remotes/sales/` to it. `VITE_BASE_PATH` reaches Vite through Compose and Docker; npm and direct Docker builds default to `/`, while Compose defaults to `/remotes/sales/`. Select `/` explicitly for a standalone container build. Preview remains available on 5176 for local npm use.

`VITE_SHELL_ENTRY_URL` is the browser-accessible host federation entry (local default `http://localhost:5173/assets/remoteEntry.js`), and runtime `HOST_ORIGIN` is the browser host origin. Change both for another host; do not use Docker DNS in these inputs. Existing React/session/client, CORS, no-store entry caching, history/filter/cancellation behavior and production credential restrictions are preserved.

Verify `python -m unittest discover -s tests`, existing npm lint/build/coverage/check:compiled and standalone/prefixed images. The root owning `tests/portal_delivery.py` checks both remotes, their compiled JavaScript and CSS through the real host. Related to code-corhuila/synkro-docs#239; full-platform acceptance, owner review and documentation remain pending.
