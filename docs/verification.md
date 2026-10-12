# HU-VEN-11 — evidencia local y limitaciones

Fecha: 11 de octubre de 2026 (America/Bogota). Repositorio: code-corhuila/synkro-sales-portal; rama: feat/sales-portal-history. Base inicial: `1c26b211c175f7c16f90bb525bea652f0e30e4e1`. Se verificaron remoto, árbol limpio y actualización fast-forward de develop antes de crear la rama. No se editaron otros repositorios ni se creó un PR.

## Referencias exactas

Se descargaron copias de lectura de las ramas actuales, manteniendo los checkouts vecinos sin cambios:

- synkro-docs/main: `61056c93e6e0783a9199bf56778e9494739bc458`.
- synkro-products-portal/develop: `8d7140318d9273821142510b60bb92f478576604`.
- synkro-front/develop: `24d781af3ccea07131ae01d75c561da7827c0306`.

Documentos revisados en docs/main:

- `12-ux-ui/design-system.md`, `12-ux-ui/navigation-map.md`, `12-ux-ui/wireframes.md`.
- `12-ux-ui/README.md`, `12-ux-ui/mvp-synkro-tech/README.md`, prototipo `frontend/src/features/sales/SalesPage.jsx`, `components/ui.jsx`, `styles/global.css` y referencias de tokens. Se extrajo el PDF realmente presente, `12-ux-ui/SynkroTech — MVP UI Draft_compressed.pdf`, y se renderizó/revisó la página 11 de Sales. El nombre simplificado citado en wireframes no existe en esa copia. El PDF es un borrador histórico: sus colores no sustituyen Crimson Circuit.
- `_stacks/frontend.md`, ADR-008 y ADR-011 en `05-architecture/decisions/records/`.
- `07-api/contracts/openapi/synkro-sales-api.yaml`, `_shared.yaml`, `07-api/authentication.md`.
- `11-quality/testing-strategy.md`, `04-requirements/user-stories.md`, `04-requirements/traceability-matrix.md`, `00-governance/definition-of-done.md`.
- Issue `code-corhuila/synkro-docs#241`, obtenida de GitHub. HU-VEN-11 aún no figura en los dos documentos de requisitos; la issue reconoce la reconciliación pendiente con HU-VEN-02. No se modificó docs ni se inventó una actualización de trazabilidad.

Products: infraestructura revisada `package.json`, `vite.config.ts`, `src/federation.config.ts`, `src/shell.d.ts`, `src/App.tsx`, `src/routes.tsx`, `.github/workflows/ci.yml`, los tres archivos de deploy y `scripts/check-compiled.mjs`/`compiledCheck.mjs`.

Referencia visual directa: `src/products/pages/ProductsPage.tsx` y `.module.css`; `src/products/components/ProductsTable.tsx` y `.module.css`, `ProductFilterBar.module.css`, `Button.module.css`, `Pagination.module.css`, `Skeleton.module.css`, `ListEmpty.tsx`, `ListError.tsx`, `ListState.module.css`, `Field.module.css`, `Badge.module.css`. Se adaptaron implementaciones genéricas locales; no hay imports de negocio Products ni biblioteca UI compartida nueva.

Comportamiento Products revisado: `products/api/productsApi.ts`, `pages/useProductList.ts`, `pages/useLoad.ts`, sus pruebas relevantes, `ProductsPage.layout.test.tsx` y `App.test.tsx`.

Host revisado: `src/remotes/registry.ts`, `src/federation.config.ts`, `src/shell/apiClient.ts`, `src/shell/session.ts`, `src/core/http/apiClient.ts`, `src/app/App.tsx`, `src/core/errors/RemoteBoundary.tsx`, `src/theme/tokens.css`, `package.json`; además PortalOutlet, guard, navegación y sesión para la verificación. Se mantuvo el plugin OriginJS comprobado; la mención a shareStrategy en _stacks/frontend.md no se convirtió en opción incompatible del plugin.

## TDD y commits

| Orden | Commit | Evidencia |
| --- | --- | --- |
| 1 | f09afe2 test: federation y shell | Red: faltaba federation.config/App; pruebas presentes antes de producción |
| 2 | 131111f feat: remoto mínimo | Green: 4 pruebas del contrato pasaron en Node 22 |
| 3 | a76767c test: queries y formatos | Red: módulos salesApi/formatting ausentes, dos suites fallidas |
| 4 | be65abf feat: queries tipadas | Implementación; el primer run detectó una preparación de test que retornaba una función mock como cleanup |
| 5 | 275d878 test: estados/cancelación | Corrige ese cleanup; 21 tests API/formato Green. Red de pantalla: SalesPage aún ausente |
| 6 | adf3714 feat: pantalla | Green: 40 pruebas; cobertura statements 97,34%. El test de fecha se ajustó a la representación es-CO del runtime, sin cambiar la zona/día |
| 7 | b127207 test: tokens y límites | Auditoría adicional de tokens, transporte prohibido y límites de página; no se presenta como un Red previo a estilos existentes |
| 8 | 1162cd9 refactor: presentación numérica | Fechas/paginación mono, skeletons alineados, UUID legible, limpieza de estilos; suite Green |
| 9 | ea35fab ci: build y empaquetado | Node 22, npm ci, lint/build/coverage/compiled, Docker/Nginx y triggers comunes |
| 10 | docs: evidencia y bloqueo del host | Informe final y README, limpieza de líneas vacías finales; SHA final disponible con git rev-parse HEAD |

Refactor final: skeletons alineados a columnas; eliminación de estilos Products no usados; UUID legible en scroll; fechas/paginación mono; empaquetado y documentación. Sin reescribir historia ni amend.

## Calidad

- Node local 22.23.3. El entorno predeterminado tenía Node 25; verificaciones finales ejecutadas mediante el binario Node 22. Docker usa node:22-alpine.
- `npm ci`, lint, TypeScript estricto + build, `npm run test -- --coverage`, `npm run check:compiled`, `git diff --check`: aprobados.
- Run final después del refactor: 45 pruebas en 6 archivos; 100% statements (113/113), branches (116/116), functions (40/40) y lines (92/92).
- Umbrales ejecutables: statements 70% global y 70% `src/sales/**`. No se excluyen módulos nuevos de producción; se excluyen pruebas, dobles, setup y declaraciones.
- Loading: encabezados y filtros visibles, skeleton de tabla, aria-busy y anuncio; data real sin placeholders de negocio.
- Error/retry: copia española, traceId, mismos filtros/página, distinción 401/403/red/timeout; sin mensaje inglés crudo ni datos alternativos.
- Empty: limpiar filtros o recargar, sin registro ficticio y sin páginas inválidas cuando totalPages=0.
- Data: columnas y total autoritativo, fechas Bogotá, COP exacto en el rango seguro, clientes UUID, acción futura explicada.
- Filtros: UUID/rango/calendario, whitelist, UTC inclusive sin desplazamiento, reset a página 1.
- Paginación: meta real, páginas negativas/fraccionarias/imposibles rechazadas, corrección de última página desaparecida.
- Cancelación: AbortSignal al host, superseded/unmount abortados, respuesta antigua posterior ignorada, cancelación rechazada no visible.
- Teclado: etiquetas/aria-describedby, primer error enfocado, Enter aplica filtros, región de scroll focusable y foco visible.
- Seguridad: solo imports shell; sin fetch/axios, gateway, tokens, sesión propia, createdBy controlable ni fixtures de producción.

## Compilación, contenedor y navegador

El contenedor Sales se construyó y sirvió en 5176. Nginx validó su configuración; compose validó su sintaxis. `GET /assets/remoteEntry.js`: HTTP 200, `Cache-Control: no-store`, CORS `http://localhost:5173`, `Vary: Origin`. El entry expone `./App`, carga CSS con hash y no deja placeholders. El scanner de compilado no detectó transporte/credenciales/URL gateway. Se conservan los archivos generados fuera de Git.

Integración ejecutada en Chrome headless con los bundles reales de las copias actuales de host/develop (5173) y Products/develop (5175), sin editar sus fuentes, y Sales desde su contenedor (5176). Se habilitó únicamente el mecanismo de sesión de desarrollo del host y se interceptaron las respuestas API con fixtures de prueba. **Esto valida montaje federado y comportamiento del host; no demuestra autenticación ni autorización real de un backend.** No se usaron credenciales reales ni JWTs de prueba en producción.

Evidencia local reproducible: `.evidence/host.integration.test.cjs`, `.evidence/host-integration.json`, capturas `sales-{light,dark}-{1440,390}.png` y `host-boundary-blocker.png` (ignorados por Git).

| Verificación real del navegador | Resultado |
| --- | --- |
| salesPortal/App en /sales, navegación del host visible | Aprobado |
| React compartido | React/React DOM instalados 19.3.0 en los tres lockfiles, rango ^19.2.8; share scope 19.3.0; no solicitud de fallback React desde Sales; cero pageerror/hook mismatch |
| shell client | Solicitud real del host `?page=1&limit=20`; API interceptada, sin transporte propio |
| shell session | SALESPERSON cambia copia introductoria; host bloquea INVENTORY y ausencia de sesión antes de descargar Sales |
| 401 | Host cierra sesión y redirige a /login |
| 403 | Banner español, sesión/navegación conservadas, sin retry automático |
| Desktop light/dark 1440px | Sin overflow de página; tipografías reales del host; tarjeta blanco / rgb(22,30,47); números derecha/mono |
| Narrow light/dark 390px | Page scrollWidth=390; región tabla 326px con scroll interno; filtros y paginación envuelven |
| Campo en dark | Fondo real rgb(18,20,28), hereda bg-page; light fondo tarjeta |
| Foco | Outline sólido 2px con token primary-500 |
| Products → Sales → Products con remotos disponibles | Aprobado; color/familia del encabezado Products permanecen iguales; cero pageerror |
| Sales no disponible | Host muestra unavailable y conserva menú; navegación posterior a Products presenta el bloqueo descrito abajo |

## Bloqueo externo confirmado — no corregible dentro de esta rama

En `synkro-front/develop` SHA `24d781af3ccea07131ae01d75c561da7827c0306`:

1. `src/remotes/PortalOutlet.tsx` monta RemoteBoundary sin una key por portal ni mecanismo de reset.
2. `src/core/errors/RemoteBoundary.tsx` deja `state.hasError=true` tras un fallo y no lo reinicia cuando cambian load/portalName.
3. Reproducción: bloquear la descarga de `localhost:5176/assets/remoteEntry.js`; abrir `/sales`; ver unavailable con menú visible; pulsar Productos; URL pasa a `/products`, pero el contenido sigue unavailable. Recargar `/products` monta Products correctamente.

La navegación entre remotos sanos sí funciona y Sales no altera los estilos de Products. Sin embargo, el aislamiento completo exigido después de fallar un remoto **no pasa** en el host actual. Ningún código de Sales puede reiniciar un boundary padre cuando su propio entry no llega a cargar. La tarea prohíbe modificar synkro-front. Se requiere aprobación explícita para aceptar este bloqueo y publicar la rama pendiente, o una corrección del host en otra tarea. No se afirma cumplimiento completo ni se marca READY.

Checks pendientes externos: CI remoto cuando haya PR manual, revisión humana, y autenticación/datos reales del backend con credenciales autorizadas. No se crea/mergea PR, no se toca infraestructura raíz ni documentación/API de otros repositorios, no se hace force-push.

## Archivos entregados

Modificados: `.env.example`, `.github/workflows/ci.yml`, `.gitignore`, `README.md` (incluye su política original de ramas).

Añadidos:

- Tooling: `.nvmrc`, `.dockerignore`, `.oxlintrc.json`, `package.json`, `package-lock.json`, `index.html`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`.
- Deploy/checks: `deploy/Dockerfile`, `deploy/compose.yml`, `deploy/nginx.conf.template`, `scripts/check-compiled.mjs`, `scripts/compiledCheck.mjs`.
- Contrato remoto: `src/App.tsx`, `src/routes.tsx`, `src/federation.config.ts`, `src/shell.d.ts`, `src/remote.test.tsx`, `src/visualContract.test.ts`, `src/test-setup.ts`, `src/test-doubles/shellApiClient.ts`, `src/test-doubles/shellSession.ts`.
- API/modelo: `src/sales/api/salesApi.ts`, `salesApi.test.ts`; `src/sales/model/sale.ts`, `page.ts`, `filters.ts`, `formatting.ts`, `formatting.test.ts`.
- Componentes en `src/sales/components/`: `Button.tsx`, `Button.module.css`, `Field.module.css`, `SalesFilterBar.tsx`, `SalesFilterBar.module.css`, `SalesTable.tsx`, `SalesTable.module.css`, `SalesTableSkeleton.tsx`, `Skeleton.module.css`, `SalesEmpty.tsx`, `SalesError.tsx`, `SalesState.module.css`, `SalesPagination.tsx`, `SalesPagination.module.css`.
- Páginas en `src/sales/pages/`: `SalesPage.tsx`, `SalesPage.module.css`, `SalesPage.test.tsx`, `useSalesHistory.ts`, `useSalesHistory.test.ts`.
- Documentación: `docs/visual-parity.md`, `docs/verification.md`.

No se versionaron bundles, cobertura, capturas, repositorios de referencia ni credenciales. La rama permanece local mientras se solicita la excepción por el bloqueo externo. URL prevista tras un push autorizado: `https://github.com/code-corhuila/synkro-sales-portal/tree/feat/sales-portal-history`; no se afirma que exista remotamente antes del push.

**NOT READY — blockers listed**
