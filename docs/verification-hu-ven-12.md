# HU-VEN-12 — evidencia, brechas y dependencias pendientes

Fecha: 12 de octubre de 2026 (America/Bogota). Repositorio: code-corhuila/synkro-sales-portal; rama `feat/sales-registration-and-detail`; base `d88babf9cd5a95bd7fb6cbae3a0db642c8df285f` (develop). Historia: code-corhuila/synkro-docs#246. No se creó ni fusionó ningún PR, no se cerró la issue y no se modificó otro repositorio.

## Referencias leídas (solo lectura)

- synkro-docs/main `61056c93e6e0783a9199bf56778e9494739bc458`: contratos `synkro-workflow` 2.1.0, `synkro-sales-api` 2.1.0, `synkro-customers-api` 2.0.0, `synkro-products-api`, `_shared`, `authentication.md`; `12-ux-ui/design-system.md`, `navigation-map.md` (Flow 1), `wireframes.md` («Screen: Sales», «Screen: Sale detail»); ADR-007, ADR-010; `entities-and-rules.md`; `user-stories.md` y `traceability-matrix.md`; la issue #246.
- Referencias de patrón: synkro-products-portal (`navigation.ts`, `PortalLink`, `Button`, `Field`, `Skeleton`) y synkro-front `1d4683366e53` (`apiClient`, `session`, `App`, `RequireRole`, `RemoteBoundary`).
- Dependencias backend (solo lectura): synkro-workflow `45aa24425185`, synkro-customers-api `5dddfc84f885`, synkro-products-api `b6b379b31471`, synkro-sales-api `70bdbaba3783`, synkro-api-gateway `24a4ab157bb0`.
- HU-VEN-11 no se rehizo: sus 45 pruebas siguen verdes; cuatro aserciones se actualizaron porque ahora existe el formulario encima del historial y el botón `Ver` pasó de deshabilitado a enlace (mensaje «El detalle … próxima entrega» eliminado). Ninguna otra conducta del historial cambió.

## Brechas y discrepancias de contrato (sin inventar campos)

1. **Customers no tiene búsqueda por nombre**: solo `identityDocument` exacto y `active`. El selector de cliente busca por documento (como indica `navigation-map.md`, Flow 1).
2. **404 para inactivos**: `GET /customers/{id}` responde 404 si el cliente está inactivo y `GET /products/{id}` lo hace con productos inactivos para SALESPERSON. El detalle de una venta antigua puede mostrar el identificador almacenado; no se añadió ninguna consulta alternativa.
3. **`SagaResponse` no incluye mensaje de rechazo**, pero `wireframes.md` pide que la tercera línea del aviso salga «del mensaje del saga». Se usa texto español aprobado por paso (el de stock es literal del wireframe); no se inventó un campo.
4. **Detalle sin vista parcial en el wireframe**: `wireframes.md` dice «sin estado parcial sensato»; HU-VEN-12 pide vista parcial ante metadatos faltantes. Se siguió la historia: error de venta → pantalla completa con «Reintentar»; fallo de metadatos → vista parcial.
5. **No existe endpoint por lote** de clientes/productos: se consulta un producto distinto por vez (máx. 4 en vuelo).
6. **El host no vuelve a renderizar el remoto entre `/sales` y `/sales/{id}`** (una sola ruta `/sales/*`). Corregido en el remoto con una suscripción a `popstate` (`src/App.tsx`); es un requisito de integración para el equipo del host, no un cambio al host.
7. `PortalOutlet`/`RemoteBoundary` siguen sin reiniciarse tras un fallo (bloqueo externo de HU-VEN-11, no relacionado con esta historia).

## TDD (cronología real)

| # | Commit | Evidencia |
| --- | --- | --- |
| 1 | `7cbf4b6` docs: paridad visual | Lista de requisitos aprobados antes de escribir componentes |
| 2 | `8502912` test: validación del formulario | RED: 3 suites no resuelven `saleForm`, `customersApi/productsApi`, `SaleForm` |
| 3 | `a4d9926` feat: formulario | GREEN: 44 pruebas |
| 4 | `adc97cb` test: Workflow, idempotencia, saga | RED: `workflowApi`, `saga`, `sagaMachine`, `useRegisterSale` ausentes |
| 5 | `6126def` + `6f247bb` feat: saga | GREEN: 106 pruebas; la segunda corrige que `getSale` lanzaba de forma síncrona |
| 6 | `9693ac8` test: estado de saga, navegación, panel | RED: `SagaStatus`, `navigation`, `NewSalePanel` ausentes |
| 7 | `1d49070` feat: panel y salidas | GREEN; se actualizaron 4 aserciones de HU-VEN-11 (ver arriba) |
| 8 | `9a81cf7` test: detalle compuesto | RED: `useSaleDetail`, `SaleDetailPage` y la ruta ausentes |
| 9 | `1bd0594` feat: detalle | GREEN: 215 pruebas, 97,9 % statements |
| 10 | `dc9d535` test: contratos de fuente | Guardas: solo Workflow hace POST, sin campos sensibles, UUID criptográfico, sin router/transport |
| 11 | `f098388` fix: popstate | La verificación en navegador mostró que `/sales/{id}` no se renderizaba; prueba que reproduce el fallo antes del arreglo |

Refactor final aplicado durante el desarrollo: el estado de la saga es un reductor puro con ref sincrónica (evita doble POST antes del render), los refs se actualizan en efectos (sin avisos del linter), el total autoritativo se deriva en vez de guardarse, y las consultas de búsqueda comparten `useSearch`.

## Pruebas de comportamiento destacadas

- Formulario: cliente obligatorio, producto, cantidad 0/negativa/fraccionaria/no segura, 101 líneas (el botón se bloquea en 100), duplicados, quitar/agregar, pendiente (campos y botones bloqueados), formulario conservado, `Limpiar`, cancelación al desmontar, cero llamadas si falla la validación.
- Workflow: ruta y cuerpo exactos, lista blanca (descarta `createdBy`, precios, totales, `saleId`), rechazo previo al envío de UUID/cantidades/líneas inválidas, `Idempotency-Key` explícita, error de transporte propagado sin reintento.
- Idempotencia: misma clave tras red/timeout/5xx/forma inesperada; clave nueva al cambiar cliente/producto/cantidad; el reordenamiento conserva la clave; no hay reintentos automáticos (se avanza 10 min con reloj falso); saga conocida ⇒ se observa en vez de otro POST.
- Saga: RUNNING con intervalos 1/2/3/5 s, COMPLETED inmediato (201) o por sondeo, COMPLETED sin `saleId` ⇒ sin resolver, COMPENSATED (clave nueva al repetir), FAILED (bloquea reenvío idéntico), límite de 120 s ⇒ sin resolver y sin otro POST, `resume`, errores transitorios y tres seguidos, respuesta tardía tras estado terminal (reductor), desmontaje sin temporizadores ni actualizaciones.
- Detalle: venta autoritativa, un cliente y un producto por id distinto (3 líneas con 2 productos ⇒ 2 consultas), concurrencia ≤ 4, fallo de cliente o de un producto sin ocultar la venta, `retryMetadata` solo repite lo fallido, 404/403/500/0/401, id inválido sin llamada, cambio de id con respuesta tardía, precios congelados frente a un catálogo con otro precio, venta anulada.
- Navegación: `popstate` (Atrás/Adelante), `redirectToSales` reemplaza la entrada, aviso de un solo uso en `history.state`, enlace con modificador conserva el comportamiento del navegador.

## Calidad local (Node v25.7.0 local; CI y Docker usan Node 22)

| Comprobación | Resultado |
| --- | --- |
| `npm run lint` (oxlint) | 0 avisos |
| `npm run build` (tsc estricto + vite) | correcto |
| `npm run test -- --coverage` | 19 archivos, 221 pruebas aprobadas; ver cobertura abajo |
| `npm run check:compiled` | correcto |
| `git diff --check` | sin errores |
| `docker build` (independiente y `VITE_BASE_PATH=/remotes/sales/`) | correcto |
| `nginx -t` en la imagen | correcto |
| `python -m unittest discover -s tests` | 2 pruebas correctas |

La cobertura se registra al final de este documento. Umbrales ejecutables: 70 % statements global y `src/sales/**`. CI no necesitó cambios: el job existente ya ejecuta lint, build, pruebas con cobertura, `check:compiled`, Docker y Nginx; las guardas nuevas viven en la suite.

## Verificación en navegador (integración basada en contratos, NO backend real)

Host construido fuera del repositorio (`vite build --outDir` en el directorio temporal, `VITE_DEV_SIGN_IN=true`) sobre el árbol de trabajo actual de synkro-front (con cambios no confirmados ajenos de Auth que no se tocaron), remoto Sales y remoto Products servidos con `vite preview` (5176 y 5175). Sesión local con un token **sin firmar generado para la prueba** (solo identidad `SALESPERSON`); respuestas de `/api/v1/*` interceptadas **en la página** con dobles fieles a los contratos. Esta evidencia valida la UI y la composición con el host; no prueba Workflow, Customers, Products ni Sales reales.

Observado: formulario e historial en `/sales`; validación con error junto al campo y foco; búsqueda de cliente y producto con los parámetros documentados; envío con la clave de idempotencia y el cuerpo exacto; «Procesando venta…», sondeo y «Venta registrada» con el total autoritativo y recarga del historial; rechazo por stock con el texto aprobado y formulario conservado; detalle con esqueleto, datos completos, vista parcial con cliente caído y «Reintentar información», 404, 403 (vuelve a `/sales` con aviso, +1 entrada de historial neta), id no UUID; Atrás/Adelante; Existencias → Ventas → Existencias sin errores de consola ni instancias duplicadas de React; modo claro y oscuro; 375 px sin desbordamiento horizontal (`scrollWidth == clientWidth`) con fuentes Big Shoulders / IBM Plex / JetBrains Mono. No se ejercieron manualmente en el navegador: error de red con reintento (cubierto por pruebas automáticas) ni FAILED.

## Integración real: NO verificada

| Participante | Estado observado (solo lectura) |
| --- | --- |
| synkro-customers-api | **Placeholder: todos los endpoints responden 501** (`PlaceholderController`). Sin `GET /customers` ni `GET /customers/{id}` reales. |
| synkro-workflow | Orquestación persistente implementada (PR #4 fusionado), pero su propio reporte marca **WKF-16 «Real integration: BLOCKED — Actual Customers 501»**. |
| synkro-products-api / synkro-sales-api | Código presente; no hay instancias en ejecución en este entorno (solo gateway y MongoDB en Docker). La rama local de Sales tiene trabajo de reportes sin relación. |
| Gateway | Enruta `/api/v1/customers`, `/products`, `/sales` y `/sagas`; los servicios destino no están levantados. |

Por tanto: no se ejecutó ninguna saga real, ni la composición de detalle con servicios reales. Hasta que Customers (HU-CLI-02), la infraestructura raíz (HU-INF-02) y Workflow estén operativos, la aceptación de extremo a extremo permanece pendiente. Si un endpoint real difiere del OpenAPI aprobado, debe reportarse; no se ajustó el cliente a un comportamiento no contractual.

## Seguridad

- Solo `shell/apiClient` y `shell/session`; sin `fetch`, Axios, router propio, almacenamiento ni token en el código de producción (guardas en `visualContract.test.ts` y `sourceContract.test.ts`).
- El navegador no envía `createdBy`, precios, subtotales, totales, `saleId`, datos internos de la saga ni credenciales SERVICE; no llama a `POST /sales`.
- Identificadores en rutas solo si son UUID completos; el aviso del 403 no va en URL ni almacenamiento; mensajes de error en español sin texto crudo del backend ni trazas (solo el `traceId` como referencia).
- Sin datos de venta, clientes ni productos en el código de producción; los dobles viven en `src/test-doubles` y en pruebas.

## Cobertura (run final, V8)

Global: statements 97,93 % (665/679), branches 94,85 %, funciones 100 %, líneas 100 %. `src/sales/components` 95,32 % statements; `src/sales/model` 99,26 %; `src/sales/pages` 98,32 %; `src/` (navegación, rutas) 100 %. Ningún módulo de producción nuevo está excluido; solo pruebas, dobles, setup y declaraciones.
