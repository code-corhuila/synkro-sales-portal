# HU-VEN-11 — paridad visual antes de implementar

Referencias de lectura: synkro-docs/main 61056c93e6e0783a9199bf56778e9494739bc458; Products y host: develop (SHA registrados en verification.md).

| Aspecto | Diseño aprobado | Products actual | Historial de Sales propuesto |
| --- | --- | --- | --- |
| Encabezados | heading, black, mayúsculas, 0.01em | ProductsPage.module.css: 2xl/xl | Ventas 2xl; Historial xl, mismos tokens |
| Tarjeta | bg-card, radios y sombras publicados | catalogue: radius-lg, shadow-md, space-4/6 | Una tarjeta para filtros, estados, tabla y paginación |
| Filtros | Etiquetas, foco primary-500, campos bg-page | Flex con wrap, space-4 | Desde, Hasta y ID del cliente; aplicar y limpiar |
| Tabla | Máximo 20 filas; números mono alineados a derecha | space-3/4; cabecera sm semibold, borde text-disabled | Fecha, Cliente, Líneas, Total, Acciones; mismos espacios |
| Números | mono, tabular-nums | numeric | Fechas, líneas y COP mono, derecha; UUID completo sin nombres inventados |
| Botones | Primary, secondary alias, ghost | Button.module.css, objetivos de 48/32px | Aplicar primary; limpiar/reintentar/paginación secondary; Ver ghost deshabilitado explicado |
| Paginación | 20 filas | Derecha, wrap, space-3/4 | Metadata real; cero páginas sin controles inválidos |
| Skeleton | Placeholders, sin datos falsos | Gradiente con tokens, reduced-motion | Filas dentro de la tabla, anuncio Cargando ventas |
| Error | Español, retry, referencia; jamás mensajes crudos | ListError/ListState: texto ink y barra error | Banner equivalente; 401/403 diferenciados; sesión y guard del host |
| Vacío | Mensaje y acción contextual | ListEmpty: centrado, espacios tokenizados | SVG decorativo, limpiar filtros o recargar; sin registro ficticio |
| Foco | primary-500 visible | Host y TableRegion | Foco scoped en campos, botones y región desplazable |
| Responsive | Teclado y pantallas estrechas | Tabla con overflow-x local; filtros y paginación wrap | Igual; min-width:0 en tarjeta y scroll accesible |
| Temas | Host único propietario de tokens | Sin :root ni paleta propia | Herencia automática light/dark, sin fuentes globales |

La sección de historial de wireframes.md contiene estas cinco columnas. El formulario y el detalle completos pertenecen a entregas futuras por el alcance explícito de esta tarea. La ruta /sales/{id} quedará identificada, sin acción funcional falsa. No se añaden filtros, selección o clasificación que el contrato de Sales no soporte.

El prototipo histórico incluido en 12-ux-ui/mvp-synkro-tech usa nombres de tokens antiguos y texto inglés; se consulta su estructura, pero design-system.md y Products determinan los tokens y la presentación actual. _stacks/frontend.md menciona shareStrategy; se usa la configuración comprobada de OriginJS, que no soporta esa opción, tal como exige esta tarea.

---

# HU-VEN-12 — paridad visual del formulario de venta y del detalle (antes de implementar)

Referencias: synkro-docs/main (`12-ux-ui/wireframes.md` «Screen: Sales» y «Screen: Sale detail», `navigation-map.md` Flow 1, `design-system.md`); Products/develop (`PortalLink`, `navigation.ts`, `Button`, `Field`, `ListError`, `Skeleton`). Sin frames de Figma para el detalle: `wireframes.md` es la fuente de estructura, comportamiento y estados.

| Aspecto | Requisito aprobado | Implementación propuesta |
| --- | --- | --- |
| Ubicación del formulario | «Nueva venta» sobre «Historial» en `/sales`; sin ruta de registro | Tarjeta `NewSaleForm` encima de la tarjeta Historial, misma ruta |
| Estructura | Selector de cliente, líneas (producto + cantidad + subtotal + quitar), «+ Agregar línea», «Total estimado» destacado, «Limpiar» y «Registrar venta» | Misma estructura; el formulario siempre inicia con selector de cliente y una línea vacía |
| Cliente | Búsqueda por `GET /customers?identityDocument=` (único filtro documentado) | Campo documento + «Buscar»; solo clientes activos son seleccionables |
| Producto | `GET /products` (filtros documentados: `name`, `active`, `limit`) | Búsqueda por nombre por línea, `limit=10`, `active=true`; nunca se precarga el catálogo |
| Total | Estimación del cliente, rotulada; el total real viene de Sales | «Total estimado (referencial)»; el total autoritativo se lee de `GET /sales/{id}` |
| Números | JetBrains Mono, tabular, derecha | Cantidad, subtotales, total y precios con `data-numeric` / `.numeric` |
| Botón pendiente | «Registrar venta» muestra spinner mientras la saga está pendiente | Deshabilitado + indicador textual accesible; campos bloqueados mientras hay solicitud en vuelo |
| Éxito | Toast «Venta registrada» y la venta aparece arriba del historial | Región `role="status"` con «Venta registrada», total autoritativo, enlace al detalle y recarga del historial en página 1 |
| Rechazo | Alerta en línea sobre el formulario: «No se pudo completar la venta» / «Paso fallido: reserva de stock» / motivo (texto exacto aprobado para stock) | `role="alert"`; formulario conservado; sin enum crudo |
| Procesando | «Procesando venta…» mientras RUNNING | Región de estado con el mismo texto |
| FAILED | Saga terminada para decisión humana | Alerta de atención operativa con el ID de la saga; no afirma reversión |
| Detalle: estructura | Cabecera con fecha y total; cliente (nombre y documento); tabla de líneas; «Volver al historial» | `SaleDetailPage` con tarjeta de resumen, sección Cliente y tabla (Producto, Cantidad, Precio unitario, Subtotal) |
| Detalle: estados | Skeleton de cabecera/cliente/filas; error con «Reintentar»; 404 «Venta no encontrada» + enlace; 403 redirige a `/sales` con mensaje | Igual; metadatos fallidos → vista parcial con identificadores y mensaje contextual (instrucción de HU-VEN-12) |
| Enlaces | Navegación sin document load | `PortalLink` propio (patrón de Products), `history.pushState` + `popstate` |
| Responsive | Sin overflow de página | Formulario en columnas que envuelven; la tabla del detalle desplaza dentro de su región |
| Temas / tipografías | Tokens del host; Big Shoulders (títulos), IBM Plex Sans, JetBrains Mono | Solo `var(--…)`; sin `:root`, colores ni fuentes propios |

Brechas conocidas del contrato, sin inventar parámetros: Customers solo filtra por `identityDocument` exacto y `active` (no hay búsqueda por nombre); `GET /customers/{id}` y `GET /products/{id}` responden 404 para registros inactivos al rol SALESPERSON, por lo que el detalle de ventas antiguas puede mostrar el identificador almacenado; `SagaResponse` no incluye mensaje de rechazo, por lo que la tercera línea del aviso usa texto español aprobado por paso, no el mensaje del backend.
