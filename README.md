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

Cliente muestra el UUID completo, sin nombres inventados ni N+1. `Ver` está deshabilitado y explicado; `saleDetailPath` y `data-planned-route` identifican `/sales/{id}` para una futura entrega. Registro, saga, detalle completo, reportes, lookup de clientes e infraestructura raíz están fuera de alcance.

CSS Modules consumen los tokens del host en ambos temas. No hay `:root`, colores ni fuentes globales propios. Véanse [paridad visual](docs/visual-parity.md) y [verificación y bloqueo del host](docs/verification.md).

Vitest, Testing Library, user-event, jsdom y V8 usan aliases a dobles de shell. Los datos simulados aparecen solo en tests. Las pruebas unitarias no hacen HTTP ni requieren backend/bases de datos. El mínimo de statements es 70% global y 70% para Sales; todos los módulos de producción participan.

## Contenedor y CI

```sh
docker build -f deploy/Dockerfile -t synkro-sales-portal:local .
docker run --rm -e HOST_ORIGIN=http://localhost:5173 synkro-sales-portal:local nginx -t
docker compose --env-file .env -f deploy/compose.yml up --build
```

Copiar `.env.example` a `.env` para configurar el entry del host (build) y su origen CORS (runtime). No se configura gateway ni credenciales. El build usa Node 22 + npm ci; compose publica 5176. Nginx envsubst solo sustituye HOST_ORIGIN. Entry con `Cache-Control: no-store`; chunks con hash y caché immutable. Compose cubre únicamente este portal.

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
