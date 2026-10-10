# Domus — Sistema de diseño

> Documento referenciado desde [`InitialProposal.md`](./InitialProposal.md) (§13.1, checklist de revisión humana).
>
> **Estructura y precedencia**
> - **Parte A — Adaptación para Domus (normativa).** Reglas para una aplicación operativa: residente (📱), garita (📟) y administración (🖥️). **Si contradice a la Parte B, manda la Parte A.**
> - **Parte B — Referencia visual base.** Estilo de referencia original (páginas de producto de Apple España): define el tono general (blanco, aire, monocromo con un único acento azul, superficies sin sombra, radios generosos).

---

# Parte A — Adaptación para Domus (normativa)

## A.1 Por qué se adapta

La referencia base describe **páginas de marketing**: titulares enormes, bandas alternadas y una única CTA por sección. Domus es una **aplicación operativa** con formularios, tablas, estados de seguridad (semáforo de acceso) y una consola usada bajo el sol en una garita. Se conserva el *tono* (limpio, monocromo, un acento azul, sin sombras decorativas, radios generosos) y se agregan las piezas que una app necesita.

## A.2 Identidad y licencias

- Domus **no usa marcas, logos, nombres de producto ni imágenes de Apple**. La Parte B es solo inspiración de estilo.
- **Tipografía: Inter** (licencia OFL) como familia única para display y texto, con `font-feature-settings: "tnum"` en datos numéricos (montos, horas, patentes) para que las cifras sean tabulares. SF Pro **no se usa**: su licencia la restringe a plataformas de Apple. En la app nativa se usa Inter empaquetada; como fallback, `system-ui`.
- Iconografía: set de línea de 1,5–2 px de trazo (Lucide o equivalente), monocromo.

## A.3 Colores semánticos (nuevos)

La UI sigue siendo monocroma, pero **los estados de seguridad y del sistema necesitan color**. Todos cumplen contraste AA sobre su fondo.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--color-success` | `#1a7f37` | `#3fb950` | Acceso permitido (🟢), pagos conciliados, confirmaciones |
| `--color-success-bg` | `#e6f4ea` | `#12261a` | Fondo del panel semáforo verde |
| `--color-warning` | `#9a5b00` | `#e3a33b` | Requiere aprobación o verificación (🟡), vencimientos próximos |
| `--color-warning-bg` | `#fff4e0` | `#2b2111` | Fondo del panel semáforo amarillo |
| `--color-danger` | `#c62828` | `#ff6b62` | Acceso denegado o restringido (🔴), errores, emergencias |
| `--color-danger-bg` | `#fdecea` | `#2d1414` | Fondo del panel semáforo rojo |
| `--color-info` | `#0066cc` | `#4da3ff` | Información neutra, links (reutiliza Link Blue) |
| `--color-offline` | `#474747` | `#a1a1a6` | Indicador de modo offline o degradado |

**Reglas:**

- **El color nunca es el único portador del estado.** El semáforo siempre combina color + ícono (✓ / ! / ✕) + texto ("Permitido", "Requiere aprobación", "Restringido").
- Electric Blue `#0071e3` sigue reservado para la acción primaria. Los colores semánticos no se usan como decoración.
- Ember `#b64400` queda para badges informativos ("Nuevo", "Pendiente"), no para estados de seguridad.

## A.4 Modo oscuro (nuevo)

Obligatorio en la app del residente y en la consola de garita (uso nocturno).

| Token | Claro | Oscuro |
|---|---|---|
| `--surface-0` (fondo) | `#ffffff` | `#000000` |
| `--surface-1` (bandas/tarjetas) | `#f5f5f7` | `#1c1c1e` |
| `--surface-2` (hover/inputs) | `#e8e8ed` | `#2c2c2e` |
| `--text-primary` | `#1d1d1f` | `#f5f5f7` |
| `--text-secondary` | `#707070` | `#a1a1a6` |
| `--hairline` | `#d6d6d6` | `#38383a` |
| `--accent` | `#0071e3` | `#0a84ff` |

Se respeta `prefers-color-scheme`, con override manual por usuario.

## A.5 Escala tipográfica de producto (nueva)

La regla de la Parte B "no usar titulares menores a 40 px" **aplica solo a la landing y a material de marketing**. Dentro de la app rige esta escala:

| Rol | Tamaño / interlineado | Peso | Uso |
|---|---|---|---|
| `app-display` | 34 / 40 | 700 | Título de la pantalla de inicio del residente |
| `app-title` | 28 / 34 | 600 | Título de página |
| `app-heading` | 22 / 28 | 600 | Sección o tarjeta |
| `app-subheading` | 17 / 24 | 600 | Subtítulo, encabezado de tabla |
| `app-body` | 17 / 25 | 400 | Texto base (móvil) |
| `app-body-dense` | 15 / 22 | 400 | Tablas y formularios densos del admin (desktop) |
| `app-caption` | 13 / 18 | 400 | Ayudas, metadatos |
| `app-micro` | 12 / 16 | 500 | Badges, etiquetas |

**Modo garita** (ver A.7): base de 20 px, títulos de 28–34 px y resultado del semáforo de 40–56 px.

## A.6 Componentes de aplicación (nuevos)

| Componente | Especificación |
|---|---|
| **Input / Select** | Altura 44 px (56 px en garita), radio 12 px, fondo `--surface-2`, sin borde en reposo; foco con anillo de 2 px `--accent`. Label siempre visible arriba (no solo placeholder). Error: texto `--color-danger` + ícono debajo. |
| **Botón primario** | Pill (980 px), `--accent`, texto blanco 17 px. **Uno por pantalla o sección.** Altura 44 px (56 px en garita). |
| **Botón secundario** | Pill ghost (borde de 1 px `--text-primary`) o relleno `--surface-2`. |
| **Botón destructivo** | Pill con texto `--color-danger` y fondo `--color-danger-bg`; pide confirmación. |
| **Badge de estado** | Pill (36 px de radio), 12 px peso 500, fondo `*-bg` + texto semántico + ícono. |
| **Tarjeta** | Radio 28 px en móvil y en tarjetas destacadas; **16 px en tarjetas densas del admin** (tablas, listas). Sin sombra. |
| **Tabla (admin)** | Filas de 48 px, divisores hairline (se permite el hairline en tablas), encabezado sticky, columnas numéricas alineadas a la derecha con `tnum`. |
| **Barra de pestañas (móvil)** | 4–5 destinos, ícono + label, alto de 49 px + safe area. Residente: Inicio · Accesos · Barrio · Cuenta. |
| **Sidebar (desktop)** | 240 px, fondo `--surface-1`, ítem activo con fondo `--surface-2` y texto en peso 600. |
| **Bottom sheet (móvil)** | Radio superior de 28 px, handle visible; para acciones rápidas (crear pase, aprobar). |
| **Modal / diálogo** | Radio de 28 px. **Se permite una única sombra funcional**: `0 8px 32px rgba(0,0,0,.18)` (sobre un overlay `rgba(0,0,0,.4)`). Es la única excepción a "sin sombras". |
| **Toast** | Arriba en móvil y abajo a la derecha en desktop; pill, `--text-primary` invertido; con ícono semántico. |
| **Panel semáforo (garita)** | Ocupa ≥ 50 % de la pantalla. Fondo `*-bg`, ícono de 64 px, resultado de 40–56 px peso 700, motivo de 20 px y regla aplicada de 17 px. Botón de acción principal de 64 px de alto a todo el ancho. |
| **Tarjeta de pase (QR)** | Fondo blanco **siempre** (también en oscuro, para que el QR se lea), QR de ≥ 240 px con zona de silencio, nombre del barrio, ventana de validez y estado. Brillo de pantalla al máximo en la app nativa. |
| **Indicador de conectividad** | Pill fija en la barra superior de la consola: "En línea" / "Degradado · sync hace 7 min" / "Sin conexión", con color + ícono. |
| **Estados vacíos** | Ícono de línea de 48 px, título de 22 px, una frase y una acción primaria. Tono amable y directo en es-AR. |
| **Skeletons** | Bloques `--surface-1` con radio igual al del contenido; sin shimmer agresivo. |

## A.7 Modo garita (📟)

Tema de alto contraste para la consola de guardia (tablet en horizontal, a pleno sol, con prisa):

- Touch targets de **56 px como mínimo**, separación de 12 px o más entre acciones.
- Texto base de 20 px; nada por debajo de 15 px.
- Contraste mínimo de 7:1 para el texto principal (AAA).
- Máximo **3 acciones primarias** visibles en la pantalla principal (Escanear DNI · Escanear QR · Buscar).
- Sonido + vibración ante solicitudes respondidas, avisos de vecinos y emergencias (que ocupan la pantalla completa en `--color-danger-bg`).
- Sin animaciones decorativas; transiciones ≤ 150 ms.
- Modo oscuro por defecto de noche (automático por horario configurable).

## A.8 Layout de aplicación

- **Móvil (📱):** gutter lateral de 16 px, una columna, barra de pestañas inferior y acción principal al alcance del pulgar.
- **Tablet garita (📟):** dos paneles en horizontal (acciones/semáforo a la izquierda, cola de solicitudes/presentes a la derecha).
- **Desktop (🖥️):** sidebar + contenido con un ancho máximo de 1200 px (1440 px para tablas anchas), gutter de 24–32 px. Las bandas alternadas `#fff`/`#f5f5f7` se usan para separar secciones de páginas de lectura (transparencia, comunicados), no dentro de formularios.
- Breakpoints: `sm 640` · `md 768` · `lg 1024` · `xl 1280`.

## A.9 Tono de los textos (UX copy)

- Español rioplatense con voseo ("Autorizá", "Compartí el pase").
- Verbos de acción en los botones ("Registrar ingreso", no "Aceptar").
- Errores que digan qué pasó y qué hacer ("El pase venció a las 18:00. Pedile al anfitrión uno nuevo.").
- Sin culpar al usuario; sin tecnicismos en la garita.

## A.10 Tokens nuevos (para agregar a Tailwind v4 / CSS)

```css
:root {
  --font-sans: 'Inter', ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --color-success: #1a7f37;  --color-success-bg: #e6f4ea;
  --color-warning: #9a5b00;  --color-warning-bg: #fff4e0;
  --color-danger:  #c62828;  --color-danger-bg:  #fdecea;
  --color-info:    #0066cc;  --color-offline:    #474747;
  --radius-input: 12px; --radius-card-dense: 16px;
  --touch-min: 44px; --touch-garita: 56px;
  --shadow-modal: 0 8px 32px rgba(0,0,0,.18);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --color-success: #3fb950;  --color-success-bg: #12261a;
    --color-warning: #e3a33b;  --color-warning-bg: #2b2111;
    --color-danger:  #ff6b62;  --color-danger-bg:  #2d1414;
    --color-info:    #4da3ff;  --color-offline:    #a1a1a6;
  }
}
```

---

# Parte B — Referencia visual base

> Referencia de estilo original. Las secciones que siguen se conservan como fuente de inspiración; donde contradicen la Parte A, manda la Parte A. Las menciones a SF Pro deben leerse como Inter (ver A.2).

## Apple (España) — Style Reference
> Cathedral of white space with whispered headlines. A vast pale hall where massive weight-700 type hangs in the air, tethered only by pastel product colors and a single blue thread.

**Theme:** light

Apple's product page language is a study in typographic generosity: oversized SF Pro Display headlines floating on near-white canvas, surrounded by enormous negative space that makes every word feel deliberate. The palette is almost monochrome — text at #1d1d1f, canvas alternating between #ffffff and #f5f5f7 — with a single blue accent (#0071e3) reserved exclusively for interactive moments. Color appears in the product imagery itself (the pastel finishes), never as UI decoration. Components are borderless: rounded cards with 28px radii, pill-shaped buttons that nearly touch the page edges with no visible containers, and zero shadow. Rhythm comes from alternating white/gray bands rather than dividers or borders.

## Tokens — Colors

| Name | Value | Token | Role |
|------|-------|-------|------|
| Primary Ink | `#1d1d1f` | `--color-primary-ink` | Headlines, body text, button labels — the dominant foreground tone across all surfaces |
| Primary Ink Gradient | `linear-gradient(184deg, #1d1d1f 20%, #0000f9 76%, #252525 95%)` | `--gradient-primary-ink` | Hero image background only (marketing) — fades from solid #1d1d1f at top into chromatic blue. Not for UI surfaces. |
| Mid Gray | `#707070` | `--color-mid-gray` | Secondary text, nav inactive state, muted UI labels |
| Deep Gray | `#474747` | `--color-deep-gray` | Navigation text and iconography at medium emphasis |
| Hairline | `#d6d6d6` | `--color-hairline` | Hairline borders between sections and UI elements |
| Canvas | `#f5f5f7` | `--color-canvas` | Alternating section backgrounds — the gray band that breaks up white sections |
| Paper | `#ffffff` | `--color-paper` | Card surfaces, primary page background, button text on dark fills |
| Cool Wash | `#e8e8ed` | `--color-cool-wash` | Subtle button backgrounds, hovered surfaces, pagination dot fills |
| Faded Surface | `#fafafc` | `--color-faded-surface` | Global nav opened state, elevated panel surfaces |
| Quiet Dot | `#777779` | `--color-quiet-dot` | Pagination indicator fills, tertiary interactive state |
| Electric Blue | `#0071e3` | `--color-electric-blue` | Filled action buttons — the only chromatic accent in the UI, used sparingly for CTAs |
| Link Blue | `#0066cc` | `--color-link-blue` | Inline body text links, arrow-link chevron text |
| Ember | `#b64400` | `--color-ember` | Orange state accent for badges, validation surfaces, and short status labels. |
| Sky | `#c8d8e0` | `--color-sky` | Product finish swatch — pastel blue surface option |
| Citrus | `#dddc8c` | `--color-citrus` | Product finish swatch — pastel yellow-green surface option |
| Starlight | `#f0e4d3` | `--color-starlight` | Product finish swatch — warm cream surface option |
| Silver | `#e3e4e5` | `--color-silver` | Product finish swatch — cool gray surface option |
| Blush | `#e8d0d0` | `--color-blush` | Product finish swatch — soft pink surface option |
| Indigo | `#596680` | `--color-indigo` | Product finish swatch — muted indigo surface option |
| Midnight | `#2e3642` | `--color-midnight` | Product finish swatch — deep charcoal surface option |
| Citrus Gradient | `linear-gradient(184deg, #1d1d1f 0%, #dfe74f 33%, #5a7e22 100%)` | `--color-citrus-gradient` | Product hero alternative finish — dark base fading through yellow-green highlight |

## Tokens — Typography

### SF Pro Display — Hero headlines and display titles — weight 700 at 80–96px with negative tracking up to -1.44px creates the signature Apple 'enormous headline floating in white' feel. Substitutes: Inter, system-ui · `--font-sf-pro-display`
- **Substitute:** Inter
- **Weights:** 600, 700
- **Sizes:** 21px, 24px, 28px, 32px, 40px, 56px, 80px, 96px
- **Line height:** 1.04–1.07
- **Letter spacing:** -1.44px at 96px, -0.28px at 56px
- **OpenType features:** `"numr"`
- **Role:** Hero headlines and display titles — weight 700 at 80–96px with negative tracking up to -1.44px creates the signature Apple 'enormous headline floating in white' feel. Substitutes: Inter, system-ui

### SF Pro Display — Section headings, card titles, subheadings — weight 600 with slightly positive tracking reads as warm and approachable at mid sizes, contrasting the tight display headlines above · `--font-sf-pro-display`
- **Substitute:** Inter
- **Weights:** 600
- **Sizes:** 21px, 24px, 28px, 32px, 40px, 56px, 80px, 96px
- **Line height:** 1.14–1.38
- **Letter spacing:** 0.007em at 28px (opens up for mid-size), 0.011em at 21px
- **OpenType features:** `"numr"`
- **Role:** Section headings, card titles, subheadings — weight 600 with slightly positive tracking reads as warm and approachable at mid sizes, contrasting the tight display headlines above

### SF Pro Text — Body copy, navigation, supporting paragraphs, small labels — weight 400 at 17px is the workhorse. Negative tracking tightens the body for crispness on dense informational pages · `--font-sf-pro-text`
- **Substitute:** Inter
- **Weights:** 400, 500, 600
- **Sizes:** 8px, 12px, 14px, 17px, 20px, 44px
- **Line height:** 1.18–1.47
- **Letter spacing:** -0.022em at 17px, -0.003em at 44px
- **OpenType features:** `"numr"`
- **Role:** Body copy, navigation, supporting paragraphs, small labels — weight 400 at 17px is the workhorse. Negative tracking tightens the body for crispness on dense informational pages

### Type Scale

| Role | Size | Line Height | Letter Spacing | Token |
|------|------|-------------|----------------|-------|
| micro | 12px | 16 | -0.12px | `--text-micro` |
| caption | 14px | 18 | -0.224px | `--text-caption` |
| body-sm | 17px | 25 | -0.374px | `--text-body-sm` |
| body | 21px | 29 | 0.231px | `--text-body` |
| body-lg | 28px | 32 | 0.196px | `--text-body-lg` |
| subheading | 32px | 36 | 0.128px | `--text-subheading` |
| heading-sm | 40px | 48 | — | `--text-heading-sm` |
| heading | 56px | 60 | -0.28px | `--text-heading` |
| heading-lg | 80px | 84 | -1.2px | `--text-heading-lg` |
| display | 96px | 100 | -1.44px | `--text-display` |

## Tokens — Spacing & Shapes

**Base unit:** 4px

**Density:** comfortable

### Spacing Scale

| Name | Value | Token |
|------|-------|-------|
| 4 | 4px | `--spacing-4` |
| 8 | 8px | `--spacing-8` |
| 12 | 12px | `--spacing-12` |
| 16 | 16px | `--spacing-16` |
| 20 | 20px | `--spacing-20` |
| 24 | 24px | `--spacing-24` |
| 28 | 28px | `--spacing-28` |
| 32 | 32px | `--spacing-32` |
| 40 | 40px | `--spacing-40` |
| 44 | 44px | `--spacing-44` |
| 48 | 48px | `--spacing-48` |
| 52 | 52px | `--spacing-52` |
| 76 | 76px | `--spacing-76` |
| 80 | 80px | `--spacing-80` |
| 120 | 120px | `--spacing-120` |
| 144 | 144px | `--spacing-144` |

### Border Radius

| Element | Value |
|---------|-------|
| cards | 28px |
| links | 10px |
| badges | 36px |
| buttons | 980px |
| smallButtons | 999px |
| productImages | 28px |

### Layout

- **Page max-width:** 1200px
- **Section gap:** 100-120px
- **Card padding:** 28px
- **Element gap:** 8-10px

## Components

### Filled Pill Button (Primary CTA)
**Role:** High-emphasis action button — the only chromatic button in the system

Pill shape at 980px radius. Background #0071e3, white text. 17px SF Pro Text weight 400. Horizontal padding 16px, vertical 11px. Used for "Comprar" and "Más información" — appears once per section maximum.

### Ghost Pill Button
**Role:** Medium-emphasis action on light backgrounds

Transparent fill, 1px border at #1d1d1f or rgba(0,0,0,0.8). 999px radius. Text in #1d1d1f at 17px weight 400. Padding 16px horizontal.

### Text Link with Arrow
**Role:** Inline directional link within body copy and section footers

No background, no border. Text color #0066cc with trailing arrow glyph (› or →). 17px SF Pro Text weight 400. Underline only on hover.

### Hairline Underlined Link
**Role:** Minimal nav and footer links

Transparent fill, text #1d1d1f or #474747, bottom border 1px solid matching text color. 12–14px SF Pro Text. Used in global nav and footer.

### Feature Showcase Card
**Role:** Large content card with rounded corners, no shadow or border

28px border-radius. White or #f5f5f7 background. Padding 28–40px internal. Contains headline at 40–56px SF Pro Display, supporting body at 17px, and optional CTA. No visible stroke.

### Product Finish Swatch
**Role:** Color selector for hardware variants

Small rounded square (~80px) at 28px radius, filled with one of the product finish colors (Sky, Citrus, Starlight, etc). No border, no label inside — color IS the content.

### Section Header
**Role:** Opening label for each content band

28–32px SF Pro Display weight 600, color #1d1d1f. Followed by optional supporting paragraph at 21px. Left-aligned with generous left/right padding matching page grid. Letter-spacing slightly positive (+0.007em) makes mid-size headings feel warmer.

### Global Navigation Bar
**Role:** Sticky top bar across all Apple pages

Height 44px. Background transitions from white/transparent to #fafafc on scroll (backdrop-filter blur 20px). Logo + 7 product links + search + bag icon. Links at 12px SF Pro Text weight 400, color #1d1d1f, separated by 8–10px gaps.

### Promo Ribbon
**Role:** Slim announcement bar above the nav

Centered single-line text at 12–14px SF Pro Text. Black text on white. Optional inline link in #0066cc.

### Product Hero
**Role:** Full-width product presentation with centered text above and product visual below

White background. Product name (e.g., "MacBook Neo") at 17px centered. Hero headline at 96px SF Pro Display weight 600, color #1d1d1f, letter-spacing -1.44px. CTA button below, then pricing text at 17px. Product image fills lower half with rounded or full-bleed edges depending on product type.

### Color Variant Showcase
**Role:** Two-column comparison of product color options

Two side-by-side cards at 28px radius, each containing a product render on its finish-colored background. Cards sit on #f5f5f7 canvas. No text inside — the visual does the work.

### "Nuevo" Badge
**Role:** New-product indicator

Inline text only, no background or shape. Text "Nuevo" in #b64400 (warm orange) at 12–14px SF Pro Text weight 500. Sits above product name as a warm punctuation against the cool palette.

### Dot Pagination Indicator
**Role:** Carousel position indicator

Small circles ~8px diameter. Active dot at #1d1d1f, inactive dots at #777779. Horizontal spacing 7px between dots.

### Section Divider (Implicit)
**Role:** Visual break between content bands

No explicit divider line. Sections alternate between #ffffff and #f5f5f7 backgrounds, and the color shift alone signals separation. Vertical spacing 100–120px between bands.

### Footer Legal Block
**Role:** Dense fine-print at page bottom

Background #f5f5f7. Body copy at 12px SF Pro Text weight 400, color #707070. Inline links in #0066cc. Tight line-height 1.33.

## Do's and Don'ts

### Do
- Use SF Pro Display weight 700 for hero headlines at 80–96px with negative tracking up to -1.44px — the tight tracking on huge type is what makes Apple headlines feel architectural.
- Set section backgrounds to alternate between #ffffff and #f5f5f7 to create visual rhythm without borders or dividers.
- Use 28px border-radius on all cards and product images — this is the signature rounding that softens the entire system.
- Reserve #0071e3 for filled CTA buttons only — never as text color, never as decoration. Inline links use #0066cc instead.
- Use pill buttons at 980px or 9999px radius. Square or lightly rounded buttons break the system's fluid feel.
- Set body copy at 17px SF Pro Text weight 400 with -0.022em letter-spacing — this is the canonical reading size across all Apple pages.
- Apply the "numr" font-feature-setting on all numeric content for consistent tabular figures.
- Keep line-height tight on display sizes (1.04–1.07) and open up for body (1.47) — the contrast creates hierarchy without size jumps.
- Let product imagery carry the color. The UI stays monochrome; the MacBook, iPhone, or finish swatch provides all chromatic interest.

### Don't
- Don't use shadows or elevation on cards. The system relies on background-color alternation and 28px radii to establish hierarchy.
- Don't introduce accent colors beyond #0071e3 and #0066cc. Even the orange "Nuevo" badge is used at most once per page.
- Don't set headlines below 40px. Apple's system depends on oversized type to create its cathedral-of-white-space feel.
- Don't use borders to separate sections. Alternate the canvas color (#ffffff ↔ #f5f5f7) instead.
- Don't apply border-radius below 10px to interactive elements. Pills and 28px corners are non-negotiable.
- Don't put decorative gradients on UI surfaces. The complex product-color gradients belong inside product renders, not buttons or cards.
- Don't use weight below 400 for body text or below 600 for headings. The system speaks in clear, weighty voices.
- Don't add background fills to text links. Use color and arrow glyphs only — never boxes around inline links.
- Don't center body paragraphs. Apple headlines can be centered, but multi-line descriptions and supporting copy are left-aligned.

## Surfaces

| Level | Name | Value | Purpose |
|-------|------|-------|---------|
| 0 | Canvas White | `#ffffff` | Primary page background and card surfaces — the default light canvas |
| 1 | Canvas Gray | `#f5f5f7` | Alternating section bands, footer, badge backgrounds — provides visual rhythm without borders |
| 2 | Hover Wash | `#e8e8ed` | Interactive hover state on light buttons and pagination dots |
| 3 | Nav Elevated | `#fafafc` | Global nav background after scroll, slight frosted distinction from white canvas |

## Imagery

Apple's visual language is product-first photography: tightly cropped hardware renders on pure white or finish-colored backgrounds, with no lifestyle context or staging. The hero shows hands holding a pastel-green MacBook Neo — the human element is incidental, showing scale and texture rather than emotion. Product variant sections pair two devices side-by-side on their respective finish colors (pink, green, silver, sky blue), each card a flat color field with the product centered. Detail shots use extreme close-ups (laptop hinge, camera module) against neutral backgrounds. There are no illustrations, no abstract graphics, no decorative imagery — the product IS the visual. Iconography throughout is monochrome SF Symbols-style line icons at 1.5–2px stroke weight, drawn from Apple's system icon set. Photography treatment is always high-key: even, shadowless lighting that flattens the product into a graphic shape rather than a dimensional object.

## Layout

Full-bleed sections that stretch edge-to-edge with generous internal padding (~40–80px sides). Content max-width effectively 1200px centered within each band. The hero is a centered stack: eyebrow label, oversized headline, single CTA button, pricing line, then product image filling the lower 60% of the viewport. Sections follow a repeating pattern: heading left-aligned in a band, then either a 2-column feature layout (text-left/image-right or alternating), a 3-column card grid, or a centered visual showcase. Content rhythm is controlled entirely by alternating white/#f5f5f7 backgrounds with 100–120px vertical gaps — no dividers, no cards wrapping features. The global nav is a single 44px sticky bar. Product spec sections use full-width bands with generous internal whitespace, where text sits in narrow columns (~560px) centered against a wider visual area.

## Agent Prompt Guide

Quick Color Reference:
- Text: #1d1d1f (primary), #707070 (secondary), #474747 (nav)
- Background: #ffffff (canvas), #f5f5f7 (alternating bands)
- Border: #d6d6d6 (hairlines only — rarely used)
- Accent: #0071e3 (filled button), #0066cc (inline link text), #b64400 (Nuevo badge)
- primary action: #0071e3 (filled action)

3 Example Component Prompts:

1. Product Hero Section: White (#ffffff) background. Eyebrow text "MacBook Neo" at 17px SF Pro Text weight 400, #1d1d1f, centered. Headline "Hola, Neo." at 96px SF Pro Display weight 600, #1d1d1f, letter-spacing -1.44px, centered. Blue CTA button "Comprar" — #0071e3 fill, white text at 17px weight 400, 980px radius, 16px horizontal padding, 11px vertical. Pricing text "Desde 799 €" at 17px SF Pro Text, #707070, centered below. Product image fills lower section, centered.

2. Feature Showcase Band: #f5f5f7 background. Section padding 100px vertical. Left-aligned heading "Lo principal." at 28px SF Pro Display weight 600, #1d1d1f, letter-spacing 0.007em. Below: single large card with 28px radius, white (#ffffff) background, 40px internal padding, containing headline at 40px SF Pro Display weight 600 and body at 17px SF Pro Text weight 400, #707070.

3. Color Variant Grid: Two cards side-by-side on #f5f5f7 canvas, each 28px radius, no border, no shadow. First card: pastel green (#dddc8c) background with centered product image. Second card: soft pink (#e8d0d0) background with centered product image. 20px gap between cards. Cards fill ~45% width each.

General Rules: Always use SF Pro Display weight 600–700 for headings, SF Pro Text weight 400 for body. Always alternate white and #f5f5f7 between sections. Never use shadows. Never use border-radius below 10px.

## Similar Brands

- **Apple iPhone product pages** — Same oversized SF Pro Display headlines floating on alternating white/#f5f5f7 bands, same 28px card radii, same pill-shaped blue CTAs, same borderless flat surfaces with zero shadow
- **Apple Vision Pro pages** — Same typographic generosity, same monochrome UI with single blue accent, same product-color gradients used only inside hero imagery, same cathedral-of-white-space layout rhythm
- **Apple AirPods Max pages** — Identical component language — pill buttons at 980px radius, 17px body copy with -0.022em tracking, alternating canvas bands without dividers, color presented through product finish swatches not UI decoration
- **Nothing.tech product pages** — Same font-first hierarchy, same generous whitespace, same near-monochrome UI that lets typography carry all weight
- **Teenage Engineering** — Same deliberate restraint — the UI itself is so quiet that the product and its color options become the only visual interest, achieved through identical flat surfaces and absence of decorative chrome

## Quick Start

### CSS Custom Properties

```css
:root {
  /* Colors */
  --color-primary-ink: #1d1d1f;
  --gradient-primary-ink: linear-gradient(184deg, #1d1d1f 20%, #0000f9 76%, #252525 95%);
  --color-mid-gray: #707070;
  --color-deep-gray: #474747;
  --color-hairline: #d6d6d6;
  --color-canvas: #f5f5f7;
  --color-paper: #ffffff;
  --color-cool-wash: #e8e8ed;
  --color-faded-surface: #fafafc;
  --color-quiet-dot: #777779;
  --color-electric-blue: #0071e3;
  --color-link-blue: #0066cc;
  --color-ember: #b64400;
  --color-sky: #c8d8e0;
  --color-citrus: #dddc8c;
  --color-starlight: #f0e4d3;
  --color-silver: #e3e4e5;
  --color-blush: #e8d0d0;
  --color-indigo: #596680;
  --color-midnight: #2e3642;
  --color-citrus-gradient: #3b3b23;
  --gradient-citrus-gradient: linear-gradient(184deg, #1d1d1f 0%, #dfe74f 33%, #5a7e22 100%);

  /* Typography — Font Families */
  --font-sf-pro-display: 'SF Pro Display', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-sf-pro-text: 'SF Pro Text', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-micro: 12px;
  --leading-micro: 16;
  --tracking-micro: -0.12px;
  --text-caption: 14px;
  --leading-caption: 18;
  --tracking-caption: -0.224px;
  --text-body-sm: 17px;
  --leading-body-sm: 25;
  --tracking-body-sm: -0.374px;
  --text-body: 21px;
  --leading-body: 29;
  --tracking-body: 0.231px;
  --text-body-lg: 28px;
  --leading-body-lg: 32;
  --tracking-body-lg: 0.196px;
  --text-subheading: 32px;
  --leading-subheading: 36;
  --tracking-subheading: 0.128px;
  --text-heading-sm: 40px;
  --leading-heading-sm: 48;
  --text-heading: 56px;
  --leading-heading: 60;
  --tracking-heading: -0.28px;
  --text-heading-lg: 80px;
  --leading-heading-lg: 84;
  --tracking-heading-lg: -1.2px;
  --text-display: 96px;
  --leading-display: 100;
  --tracking-display: -1.44px;

  /* Typography — Weights */
  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* Spacing */
  --spacing-unit: 4px;
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-48: 48px;
  --spacing-52: 52px;
  --spacing-76: 76px;
  --spacing-80: 80px;
  --spacing-120: 120px;
  --spacing-144: 144px;

  /* Layout */
  --page-max-width: 1200px;
  --section-gap: 100-120px;
  --card-padding: 28px;
  --element-gap: 8-10px;

  /* Border Radius */
  --radius-lg: 10px;
  --radius-3xl: 28px;
  --radius-3xl-2: 32px;
  --radius-3xl-3: 36px;
  --radius-full: 980px;
  --radius-full-2: 999px;
  --radius-full-3: 9999px;

  /* Named Radii */
  --radius-cards: 28px;
  --radius-links: 10px;
  --radius-badges: 36px;
  --radius-buttons: 980px;
  --radius-smallbuttons: 999px;
  --radius-productimages: 28px;

  /* Surfaces */
  --surface-canvas-white: #ffffff;
  --surface-canvas-gray: #f5f5f7;
  --surface-hover-wash: #e8e8ed;
  --surface-nav-elevated: #fafafc;
}
```

### Tailwind v4

```css
@theme {
  /* Colors */
  --color-primary-ink: #1d1d1f;
  --color-mid-gray: #707070;
  --color-deep-gray: #474747;
  --color-hairline: #d6d6d6;
  --color-canvas: #f5f5f7;
  --color-paper: #ffffff;
  --color-cool-wash: #e8e8ed;
  --color-faded-surface: #fafafc;
  --color-quiet-dot: #777779;
  --color-electric-blue: #0071e3;
  --color-link-blue: #0066cc;
  --color-ember: #b64400;
  --color-sky: #c8d8e0;
  --color-citrus: #dddc8c;
  --color-starlight: #f0e4d3;
  --color-silver: #e3e4e5;
  --color-blush: #e8d0d0;
  --color-indigo: #596680;
  --color-midnight: #2e3642;
  --color-citrus-gradient: #3b3b23;

  /* Typography */
  --font-sf-pro-display: 'SF Pro Display', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-sf-pro-text: 'SF Pro Text', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;

  /* Typography — Scale */
  --text-micro: 12px;
  --leading-micro: 16;
  --tracking-micro: -0.12px;
  --text-caption: 14px;
  --leading-caption: 18;
  --tracking-caption: -0.224px;
  --text-body-sm: 17px;
  --leading-body-sm: 25;
  --tracking-body-sm: -0.374px;
  --text-body: 21px;
  --leading-body: 29;
  --tracking-body: 0.231px;
  --text-body-lg: 28px;
  --leading-body-lg: 32;
  --tracking-body-lg: 0.196px;
  --text-subheading: 32px;
  --leading-subheading: 36;
  --tracking-subheading: 0.128px;
  --text-heading-sm: 40px;
  --leading-heading-sm: 48;
  --text-heading: 56px;
  --leading-heading: 60;
  --tracking-heading: -0.28px;
  --text-heading-lg: 80px;
  --leading-heading-lg: 84;
  --tracking-heading-lg: -1.2px;
  --text-display: 96px;
  --leading-display: 100;
  --tracking-display: -1.44px;

  /* Spacing */
  --spacing-4: 4px;
  --spacing-8: 8px;
  --spacing-12: 12px;
  --spacing-16: 16px;
  --spacing-20: 20px;
  --spacing-24: 24px;
  --spacing-28: 28px;
  --spacing-32: 32px;
  --spacing-40: 40px;
  --spacing-44: 44px;
  --spacing-48: 48px;
  --spacing-52: 52px;
  --spacing-76: 76px;
  --spacing-80: 80px;
  --spacing-120: 120px;
  --spacing-144: 144px;

  /* Border Radius */
  --radius-lg: 10px;
  --radius-3xl: 28px;
  --radius-3xl-2: 32px;
  --radius-3xl-3: 36px;
  --radius-full: 980px;
  --radius-full-2: 999px;
  --radius-full-3: 9999px;
}
```
