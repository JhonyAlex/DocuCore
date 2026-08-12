# PLAN-04 — Simbología industrial y navegación activo ↔ planos

## Resultado

Los tipos de activo tienen ahora un icono industrial persistente y los planos lo
derivan siempre desde el tipo. No se guarda SVG, nombre de icono ni color en
`FloorPlanMarker`: el marcador conserva exclusivamente su plano, activo y
coordenadas normalizadas.

## Modelo y catálogo controlado

- `AssetType.iconKey` es obligatorio, tiene por defecto `package` y se añade con
  la migración `20260812102902_asset_type_icon_key`.
- El seed asigna símbolos representativos a Máquina, Extintor, Vehículo,
  Servidor e Instrumento.
- `shared/assetIconCatalog.ts` define 124 claves estables, agrupadas en
  maquinaria, motores, ventilación, herramientas, electricidad, incendios,
  sensores, redes, vehículos, almacenamiento, agua/laboratorio y dispositivos.
- `AssetIcon` importa estáticamente solo el subconjunto de `lucide-react` que
  usa DocuCore; el catálogo no carga una biblioteca dinámica completa. Una clave
  desconocida se representa de forma segura con `package`.
- El formulario de tipos ofrece búsqueda, vista previa y cuadrícula agrupada.
  Zod solo admite las claves del catálogo.

## Planos y ficha de activo

- La serialización de activo, ubicaciones, campos dinámicos y marcadores incluye
  `asset.type.iconKey` como dato derivado del tipo.
- Los marcadores usan el icono del tipo y el mismo color de capa. Las alertas
  vencida/próxima se muestran únicamente como halo independiente; nunca cambian
  el símbolo industrial. A bajo zoom permanece el icono compacto y a detalle se
  muestra nombre y código.
- `GET /api/assets/:id/floor-plans` consulta directamente las colocaciones del
  activo y devuelve plano, ubicación, marcador, coordenadas, versión actual,
  dimensiones y URL DZI. No se descargan ni inspeccionan todos los planos en el
  cliente.
- La pestaña **Plano** de la ficha reutiliza OpenSeadragon sobre el DZI real,
  centra y resalta solo el activo, permite pan/zoom y ofrece pestañas si hay más
  de una colocación. Sin colocaciones muestra el estado vacío y acceso a Planos.
- `Abrir en Planos` genera `/plans?assetId=<id>&planId=<id>`. La vista de Planos
  resuelve esa URL al cargar, selecciona el plano correcto y enfoca el marcador.
  El enlace sigue siendo reproducible tras recargar.

## Cobertura

- Unitario: tamaño/grupos del catálogo y fallback seguro.
- API: alta y edición de tipos, validación de clave inválida, serialización del
  icono, cero/una/múltiples colocaciones, datos DZI y cambio de icono sin tocar
  el marcador.
- E2E: selector de icono, marcador industrial, preview DZI centrado y navegación
  ficha → URL de Planos → marcador enfocado.

## Validación

- `pnpm prisma migrate status`: 21 migraciones y esquema de desarrollo al día.
- `pnpm lint`, `pnpm typecheck` y `pnpm build`: pasan. El build conserva el
  aviso no bloqueante preexistente de chunk superior a 500 kB.
- `pnpm test`: 24 archivos y 175 pruebas unitarias/API pasan.
- `pnpm test:e2e`: 59 pruebas pasan, incluidas las nuevas de PLAN-04.
- Se verificó el SHA-256 del HTML protegido:
  `C4B90868465DC108F9140F00B3BA0120F6F5CDBAF8D1930B991B171B1E7F5112`.
- `pnpm test:visual` se ejecutó sin cambiar baselines ni el umbral de 0,5 %:
  15/30 objetivos pasan y 15 quedan fuera. Es un bloqueo visual ya existente
  en Activos, Documentos, Configuración, ficha de activo y Planos. Para Planos
  el resultado actual es 14,6814 % (1440 oscuro), 8,0840 % (1440 claro) y
  6,9759 % (1920 oscuro); por tanto no se declara conformidad visual hasta
  recuperar esos tres objetivos bajo el umbral protegido.
