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
