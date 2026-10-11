# Domus — Especificación del MVP (Initial Proposal)

> **Documento rector del proyecto.** Este archivo es la fuente de verdad funcional y técnica del MVP de Domus. Toda decisión de producto, alcance o arquitectura debe reflejarse acá antes (o al mismo tiempo) que en el código. Si el código y este documento difieren, se discute y se corrige uno de los dos; nunca se ignora la diferencia.

| Campo | Valor |
|---|---|
| Producto | Domus — SaaS multitenant para la gestión integral de barrios privados |
| Versión del documento | 1.3 |
| Fecha | 2026-10-09 |
| Estado | Aprobado para iniciar desarrollo (sujeto a revisiones por hito) |
| Mercado inicial | Tucumán, Argentina (Yerba Buena y alrededores), con expansión posterior |
| Backend | Supabase (decisión tomada) |
| Sistema de diseño | [`DESIGN.md`](./DESIGN.md) (en esta misma carpeta) |

---

## Índice

1. [Cómo usar este documento](#1-cómo-usar-este-documento)
2. [Visión y problema](#2-visión-y-problema)
3. [Contexto comercial (en definición)](#3-contexto-comercial-en-definición)
4. [Panorama competitivo](#4-panorama-competitivo)
5. [Principios de producto y seguridad](#5-principios-de-producto-y-seguridad)
6. [Roles, membresías y permisos](#6-roles-membresías-y-permisos)
7. [Plataformas: web total y mobile first](#7-plataformas-web-total-y-mobile-first)
8. [Arquitectura y stack tecnológico](#8-arquitectura-y-stack-tecnológico)
9. [Modelo de dominio](#9-modelo-de-dominio)
10. [Especificación funcional por módulo](#10-especificación-funcional-por-módulo)
11. [Requisitos no funcionales](#11-requisitos-no-funcionales)
12. [Privacidad y marco legal](#12-privacidad-y-marco-legal)
13. [Roadmap de hitos y revisiones humanas](#13-roadmap-de-hitos-y-revisiones-humanas)
14. [Métricas de éxito del piloto](#14-métricas-de-éxito-del-piloto)
15. [Riesgos y mitigaciones](#15-riesgos-y-mitigaciones)
16. [Fuera de alcance del MVP (Fase 2+)](#16-fuera-de-alcance-del-mvp-fase-2)
17. [Registro de decisiones y preguntas abiertas](#17-registro-de-decisiones-y-preguntas-abiertas)
18. [Referencias](#18-referencias)
19. [Historial de cambios](#19-historial-de-cambios)

---

## 1. Cómo usar este documento

### 1.1 Convenciones

| Marca | Significado |
|---|---|
| `M04-F03` | Identificador de funcionalidad: módulo 04, funcionalidad 03. Se usa en commits, PRs, issues y tests. |
| 📱 **Mobile first** | Se diseña primero para teléfono (o tablet, en la garita). La versión web de escritorio existe y funciona, pero es secundaria. |
| 🖥️ **Desktop first** | Se diseña primero para escritorio (tablas, carga masiva, reportes). Debe poder usarse en móvil, aunque con menor comodidad. |
| 🌐 **Web responsive** | Igual de importante en todos los tamaños. |
| 📟 **Tablet garita** | Mobile first orientado a tablet en horizontal, operada de pie, con prisa y bajo condiciones adversas (sol, ruido, guantes). |
| 🔍 **HR-xx** | **Hito de revisión humana.** El desarrollo se detiene hasta que una persona (el fundador o quien él designe) apruebe el entregable. Ver §13. |
| `[MVP-Núcleo]` | Alcance planteado originalmente para el MVP. |
| `[MVP-Cierre]` | Funcionalidades aportadas por la revisión crítica externa (Codex). Forman parte del MVP, pero se construyen **al final**, después del núcleo. |
| `[Fase 2]` | Fuera del MVP. Se documenta para no cerrar puertas en el diseño. |
| **DEBE / DEBERÍA / PUEDE** | Obligatorio / recomendado / opcional (estilo RFC 2119). |

### 1.2 Regla de oro de plataformas

> **Todo lo que hace Domus DEBE poder hacerse desde la web** (navegador de escritorio o móvil), por cualquier rol. Las apps nativas agregan comodidad (push confiable, cámara, offline robusto), pero nunca son el único camino para completar una tarea.

### 1.3 Cómo evoluciona

- Cada cambio de alcance o de decisión se registra en §17 (decisiones) y §19 (historial).
- Los documentos complementarios (diseño, ADRs, investigación) viven en `KnowledgeBase/` y se enlazan desde §18.
- Cuando un hito 🔍 se aprueba, se marca en la tabla de §13 con fecha y responsable.

---

## 2. Visión y problema

### 2.1 Problema

En los barrios privados de Argentina el control de acceso depende de que la guardia **llame por teléfono a la familia en cada ingreso**. Esto es molesto para los residentes (llamadas a toda hora, también por visitas habituales), lento para las visitas (filas en la garita) y poco trazable para la administración (cuadernos en papel, registros incompletos). A eso se suman la gestión de amenities por WhatsApp o planillas, las expensas con poca transparencia y una comunicación dispersa entre vecinos, guardia y administración.

### 2.2 Visión

Domus es la plataforma que **ordena la vida operativa del barrio** con foco en el residente:

- La guardia sabe **antes de que el auto llegue** quién está autorizado y por qué.
- El residente decide **cómo quiere que lo molesten**, dentro de las reglas del barrio.
- La administración tiene **trazabilidad completa** y comunica sin depender de grupos de WhatsApp.
- Las finanzas del barrio son **transparentes** para quien las paga.

### 2.3 Propuesta de valor por actor

| Actor | Hoy | Con Domus |
|---|---|---|
| Residente | Recibe llamadas por cada visita, delivery u obrero. | Pre-autoriza, define preferencias, aprueba con un toque y recibe solo los avisos que eligió. |
| Visita | Espera en la garita mientras localizan a la familia. | Llega con un pase (QR) o ya figura en una lista; el ingreso toma segundos. Sin instalar nada. |
| Guardia | Busca en un cuaderno, llama, anota a mano. | Escanea el DNI o el QR y ve un semáforo con el motivo de la decisión. |
| Administración | Registros en papel, reclamos por WhatsApp, planillas de reservas. | Panel único: padrón, accesos auditables, comunicados, reclamos, amenities y finanzas. |

### 2.4 Hipótesis principal a validar con el piloto

> "Domus reduce las llamadas y el tiempo de atención de las visitas habituales, con un registro verificable y un procedimiento claro cuando algo falla, **sin aumentar los ingresos indebidos**."

---

## 3. Contexto comercial (en definición)

> ⚠️ **La estrategia comercial sigue abierta** (decisión del fundador, 2026-10-09). Esta sección solo registra el punto de partida y las alternativas analizadas, para que el diseño técnico no las impida.

- **Precio tentativo:** USD 1 por vivienda por mes.
- **Alternativas a evaluar** (de la revisión externa):
  - Piso mínimo por barrio (por ejemplo, el mayor entre USD 100–150 por mes y USD 1 por vivienda).
  - Cobro de implementación (onboarding).
  - Módulos adicionales con precio aparte.
  - Facturación en ARS con una actualización definida en el contrato.
- **Quién contrata:** preferentemente el barrio (la entidad que lo representa). La administradora y la empresa de seguridad son canales.
- **Go-to-market tentativo:** 1–2 pilotos pagos en Yerba Buena, en barrios de 100 a 300 viviendas con una sola garita.

**Requisitos técnicos que se desprenden y que el MVP DEBE soportar aunque el precio cambie:**

1. Poder contar **unidades facturables por tenant** según criterios configurables (ocupada, en obra, lote vacío).
2. Cada tenant tiene un **estado de suscripción** (piloto, activo, suspendido, baja) con efecto en el acceso a la plataforma.
3. **Exportación completa** de los datos de un tenant (continuidad ante una baja o un cambio de administración).

---

## 4. Panorama competitivo

| Producto | Foco | Lectura para Domus |
|---|---|---|
| [Accessin](https://accessin.net/) | Accesos con hardware (Face ID, barreras, molinetes con IA), expensas, amenities, offline. | Es el competidor más completo. No hay que vender "QR" ni "offline" como novedad: el diferencial es la **menor fricción en escenarios concretos**. |
| [AdminProp](https://adminprop.net/) | Administración y expensas; app "Conserje" con registro de visitas. | Es fuerte en expensas. Domus **convive** con estos sistemas; no los reemplaza en el MVP. |
| [Redconar](https://www.redconar.com.ar/) | Expensas, cuentas corrientes, reclamos, amenities. | Mismo perfil que AdminProp. |
| [ConsorcioAbierto](https://www.consorcioabierto.com/blog/2021/11/15/control-de-accesos-barrios-privados/) | Pre-autorización de visitas por DNI. | Hace lo básico de accesos. |
| [BuenVecino](https://buenvecino.com.ar/) | Amenities y comunicación; gratis para grupos chicos. | Referencia de simplicidad. |
| [Planta Digital](https://www.plantadigital.com.ar/barriosaas.html) | Padrón, expensas, registro de accesos. | Orientado a la operación. |
| Referencias internacionales ([Gatesentry](https://gatesentry.com/industries/self-service-gated-community/), [Proptia](https://www.proptia.com/visitor-management/), [Symliv](https://symliv.com/)) | Pase digital sin app, LPR, permisos por horario y por hogar. | Inspiración para pases y franjas horarias. |

**El competidor real es el cuaderno + las llamadas + WhatsApp**, porque ya están instalados. El cambio tiene que valer el costo de coordinar a todo un barrio.

**Diferenciales buscados:**

1. Política de acceso **por tipo de visitante** y por vivienda, dentro del reglamento del barrio.
2. Visitas recurrentes con **franja horaria** (personal doméstico, jardinero, profesores).
3. **Pase de evento** con auto-registro de invitados y aprobación del anfitrión.
4. Una garita que **explica el porqué** de cada decisión (semáforo + motivo).
5. Integración entre módulos: reservar un amenity con invitados genera automáticamente el pase de evento.

---

## 5. Principios de producto y seguridad

Estos principios son **restricciones de diseño vigentes desde el primer commit**. No son funcionalidades que se puedan diferir: incluyen los aportes de la revisión externa que afectan la seguridad.

### 5.1 Producto

| # | Principio |
|---|---|
| P1 | **El reglamento del barrio está por encima de la preferencia del hogar.** La administración define qué opciones existen; cada vivienda elige dentro de ese margen. |
| P2 | **El silencio nunca aprueba.** Una solicitud sin respuesta vence y pasa al procedimiento de respaldo (llamada), nunca a "aprobado". |
| P3 | **"No molestar" cambia a quién y cómo se consulta; no autoriza a nadie.** |
| P4 | **La garita primero.** Cualquier flujo de guardia DEBE resolverse en pocos toques, con texto grande y sin depender solo del color. |
| P5 | **La web hace todo; el móvil lo hace más cómodo.** (§1.2) |
| P6 | **Estructura antes que chat.** La comunicación se hace con solicitudes, avisos y tickets con estados, no con conversaciones libres que distraen. |
| P7 | **Convivir, no reemplazar.** Las expensas en el MVP buscan transparencia, no reemplazar el sistema contable de la administradora. |
| P8 | **Plantillas antes que motores infinitos.** Las políticas se configuran a partir de plantillas claras, no con un editor de reglas arbitrario. |

### 5.2 Seguridad y datos

| # | Principio |
|---|---|
| S1 | **Aislamiento multitenant obligatorio:** RLS en todas las tablas con datos de un tenant, basado en membresías verificadas. Se prueba con tests automáticos de acceso cruzado. |
| S2 | **Un QR es un pase, no una identidad.** Contiene un token opaco y aleatorio, sin DNI ni datos personales. Tiene vencimiento, cantidad de usos y revocación. El consumo se valida en una transacción del servidor. |
| S3 | **Auditoría solo de agregado (append-only).** Los movimientos y las decisiones no se editan ni se borran: se corrigen con un evento nuevo que indica motivo y autor. |
| S4 | **La notificación no es la autorización.** Una aprobación existe solo como estado durable en la base de datos; el push es un aviso para ir a consultarlo. |
| S5 | **Minimización de datos.** Del DNI se guarda solo lo necesario (número, apellido, nombre). Nunca se guarda una foto del DNI ni el contenido completo del PDF417. |
| S6 | **Offline honesto.** La garita muestra siempre cuándo sincronizó por última vez. Una decisión tomada sin conexión no crea autorizaciones nuevas, y un caché vencido se trata como riesgo. |
| S7 | **Claves de servicio fuera del cliente.** La `service_role` de Supabase solo vive en Edge Functions o en el servidor. |
| S8 | **Super-admin con MFA** y acceso excepcional auditado a los datos de los tenants. |
| S9 | **Datos públicos mínimos.** La página del invitado no se indexa, no lista a otros invitados y no expone DNI en la URL. |

---

## 6. Roles, membresías y permisos

### 6.1 Modelo de membresías

Un **usuario** (cuenta de autenticación) se vincula a una **persona**. Una persona puede tener **varias membresías**, cada una con: tenant (barrio), rol, unidad (si corresponde), vigencia (desde/hasta) y estado.

Ejemplos que el modelo DEBE soportar:

- Propietario de lotes en dos barrios distintos.
- Guardia que trabaja en tres barrios para la misma empresa de seguridad.
- Persona que es residente y además administradora de su propio barrio.

La interfaz DEBE mostrar siempre el **contexto activo** (barrio + rol + unidad) y permitir cambiarlo.

### 6.2 Roles del MVP

| Rol | Alcance | Descripción |
|---|---|---|
| **Super-admin de plataforma** | Global | Equipo Domus: alta y estado de tenants, soporte, métricas globales. Con MFA y acceso auditado. |
| **Administrador del barrio** | Tenant | Gestiona padrón, reglamento de accesos, comunicados, reclamos, amenities, finanzas y guardias. Puede haber varios por barrio. |
| **Guardia** | Tenant (uno o varios) | Opera la consola de garita: validación, ingresos/egresos, solicitudes, novedades, paquetería. |
| **Titular de unidad** | Unidad | Propietario, o inquilino con titularidad delegada. Gestiona el hogar, las preferencias, las autorizaciones y las finanzas de la unidad. |
| **Miembro del hogar** | Unidad | Cónyuge, hijos, inquilino no titular. Puede autorizar visitas y aprobar solicitudes; ve las finanzas solo si el titular lo habilita. |

`[Fase 2]` **Comisión / consejo** (solo lectura sobre finanzas y reportes) y **Supervisor de seguridad multibarrio** (ver M13).

### 6.3 Permisos granulares del administrador

El administrador del barrio tiene permisos activables por persona: `padron`, `accesos_config`, `accesos_auditoria`, `comunicacion`, `reclamos`, `amenities`, `finanzas`, `guardias`, `configuracion_tenant`, `gestion_administradores`. El primer administrador de cada tenant los tiene todos.

**Gestión de administradores (D17):** solo un administrador con `gestion_administradores` puede crear, modificar o revocar administradores y otorgar o quitar permisos. Nadie puede modificar sus propias membresías ni sus propios permisos, y solo se puede otorgar un permiso que uno mismo tiene. `padron` gestiona personas y membresías no administrativas (guardias, titulares, miembros).

### 6.4 Matriz resumida

| Capacidad | Super-admin | Admin | Guardia | Titular | Miembro |
|---|:-:|:-:|:-:|:-:|:-:|
| Crear y suspender tenants | ✅ | — | — | — | — |
| Configurar el reglamento de accesos | — | ✅ | — | — | — |
| Gestionar el padrón del barrio | — | ✅ | 👁️ (consulta operativa) | — | — |
| Gestionar los miembros del hogar | — | ✅ | — | ✅ | — |
| Preferencias de acceso de la unidad | — | 👁️ | 👁️ (efecto) | ✅ | 👁️ |
| Crear autorizaciones y pases | — | ✅ (excepcional, auditado) | — | ✅ | ✅ |
| Aprobar o rechazar solicitudes de ingreso | — | — | — | ✅ | ✅ |
| Validar y registrar ingresos/egresos | — | 👁️ | ✅ | — | — |
| Ver los movimientos de su unidad | — | ✅ | ✅ (operativo) | ✅ | ✅ |
| Publicar comunicados | — | ✅ | — | — | — |
| Crear reclamos | — | — | — | ✅ | ✅ |
| Reservar amenities | — | ✅ (en nombre de una unidad) | — | ✅ | ✅ (si el titular lo habilita) |
| Ver la cuenta corriente de la unidad | — | ✅ | — | ✅ | Configurable |
| Ver gastos y presupuesto del barrio | — | ✅ | — | ✅ | ✅ |
| Cargar gastos y conciliar pagos | — | ✅ | — | — | — |

---

## 7. Plataformas: web total y mobile first

### 7.1 Superficies

| Superficie | Tecnología | Usuarios | Notas |
|---|---|---|---|
| **Web App** | Next.js (responsive + PWA instalable) | Todos los roles | Cubre el 100 % de las funcionalidades. |
| **App móvil** | Expo / React Native (iOS + Android) | Residentes y guardias | Push confiable, cámara nativa, offline robusto para la garita. Se publica en el hito H11. |
| **Página pública del invitado** | Next.js (rutas públicas) | Visitas | Muestra el QR del pase y el auto-registro a eventos. Sin cuenta ni instalación. |
| **Backoffice de plataforma** | Next.js (sección restringida) | Super-admin | Gestión de tenants y soporte. |

### 7.2 Mapa de enfoque por funcionalidad

| Área | Rol | Enfoque |
|---|---|---|
| Autorizar visitas, crear y compartir pases, aprobar solicitudes | Residente | 📱 Mobile first |
| Preferencias de acceso del hogar | Residente | 📱 Mobile first |
| Gestión del hogar (miembros, vehículos, mascotas) | Residente | 📱 Mobile first |
| Reservar amenities | Residente | 📱 Mobile first |
| Comunicados (leer), reclamos (crear), avisos a la guardia | Residente | 📱 Mobile first |
| Cuenta corriente, informar un pago | Residente | 📱 Mobile first |
| Transparencia (gastos y presupuesto) | Residente | 🌐 Web responsive |
| Consola de garita (validar, registrar, solicitudes, presentes) | Guardia | 📟 Tablet garita |
| Libro de guardia, paquetería | Guardia | 📟 Tablet garita |
| Padrón, importaciones, reglamento, configuración | Admin | 🖥️ Desktop first |
| Auditoría de accesos y reportes | Admin | 🖥️ Desktop first |
| Comunicados (redactar), gestión de reclamos | Admin | 🖥️ Desktop first (con atención de reclamos 🌐) |
| Amenities (configuración y agenda) | Admin | 🖥️ Desktop first |
| Finanzas (gastos, presupuesto, conciliación) | Admin | 🖥️ Desktop first |
| Página del invitado | Visita | 📱 Mobile first |
| Backoffice de plataforma | Super-admin | 🖥️ Desktop first |

### 7.3 Estrategia de construcción

1. **Primero la web** (Next.js): todas las funcionalidades, con diseño mobile first donde corresponda. Se instala como PWA, con Web Push en Android y en iOS 16.4+ (PWA instalada).
2. **Después la app nativa** (Expo), que **reutiliza el paquete de dominio** (tipos, validaciones Zod, cliente de Supabase, reglas de presentación) y se enfoca en las vistas 📱 y 📟, con push nativo, escaneo con cámara nativa y offline robusto.
3. La garita PUEDE operar en la web (tablet con navegador), con un modo degradado limitado por el caché del navegador. **El offline robusto se garantiza en la app nativa** (§10, M06).

---

## 8. Arquitectura y stack tecnológico

### 8.1 Stack

| Capa | Tecnología | Uso |
|---|---|---|
| Lenguaje | TypeScript (estricto) en todo el código, sobre **Node 25** | Un solo lenguaje de punta a punta. Código en inglés (D11). |
| Monorepo | Turborepo + pnpm | `apps/web`, `apps/mobile`, `packages/domain`, `packages/ui-tokens`, `packages/supabase`, `supabase/` (migraciones). |
| Web | Next.js (App Router), React, Tailwind v4 con tokens de `DESIGN.md` | Web App, página del invitado, backoffice. |
| Móvil | Expo (React Native), Expo Router, expo-camera (QR + PDF417), expo-sqlite, expo-notifications | App de residente y guardia. |
| Validación | Zod | Esquemas compartidos entre cliente, Edge Functions y formularios. |
| Backend | **Supabase** | Ver §8.2. |
| Escaneo web | Lector de códigos en el navegador (ZXing o equivalente) con `getUserMedia` | PDF417 del DNI y QR desde la tablet o el celular, vía web. |
| Notificaciones | Expo Push (nativo), Web Push (VAPID), email transaccional (Resend o equivalente) | §10, M10. |
| Observabilidad | Módulo propio de reporte de errores (sin proveedor) + logs de Supabase. Sentry u otro proveedor se suma más adelante (D15). | Errores y rendimiento. |
| Hosting web | Vercel (o equivalente) | Previews por PR. |
| Testing | Vitest (unit), Playwright (e2e web), tests de RLS en SQL (pgTAP o equivalente), Maestro (e2e móvil, H11) | §11. |

### 8.2 Supabase: cómo se usa

| Servicio | Uso en Domus |
|---|---|
| **Postgres** | Modelo de dominio, RLS, funciones SQL para operaciones transaccionales (consumir un pase, decidir un acceso, cerrar una solicitud). |
| **Auth** | Email + contraseña, magic link y OTP por email. Los claims de membresía se resuelven del lado del servidor, nunca se confía en lo que manda el cliente. MFA obligatorio para super-admin y recomendado para admin. |
| **Row Level Security** | Todas las tablas de tenant con políticas basadas en `membresias` vigentes (tenant + rol + unidad). |
| **Realtime** | Estado de las solicitudes de aprobación (guardia ↔ residente), cola de la garita y avisos. Con **Realtime Authorization** por canal (canales por tenant y por unidad, nunca globales). Después de una reconexión, siempre se consulta el estado durable. |
| **Storage** | Comprobantes de gastos y pagos, adjuntos de reclamos y comunicados, documentación de trabajadores, fotos de paquetes. Buckets privados con políticas por tenant y URLs firmadas. |
| **Edge Functions** | Webhooks, envío de notificaciones, lógica con `service_role`, generación de PDFs, importaciones masivas, página pública del invitado (resolución del token). |
| **pg_cron** | Vencimiento de solicitudes y pases, recordatorios, purga por retención, recálculo de morosidad. |
| **Backups / PITR** | Plan Pro con PITR antes del piloto. **Storage se respalda aparte** (los backups de la base no incluyen los objetos de Storage). |

### 8.3 Multitenancy

- **Base compartida, esquema compartido**, con columna `tenant_id` en toda tabla de tenant.
- Claves foráneas compuestas o checks que **impiden referencias cruzadas** entre tenants (por ejemplo, un movimiento no puede apuntar a una unidad de otro tenant).
- Funciones auxiliares SQL `SECURITY DEFINER` con `search_path` fijo para resolver las membresías del usuario actual.
- Toda Edge Function que use `service_role` DEBE validar explícitamente el tenant y el rol del solicitante.
- **Suite de tests de aislamiento** obligatoria en CI: un usuario de un tenant A no puede leer ni escribir datos de B (tablas, Storage, Realtime, exportaciones y endpoints públicos).

### 8.4 Región y datos

- Región candidata: **São Paulo (sa-east-1)**, por latencia.
- Estado actual (2026-10-09): el proyecto Supabase `Domus` (ref `kymaarzsbhiczmpazepm`) se creó en **us-west-2** y se usa como `staging` (D14). Estados Unidos tampoco figura entre los destinos adecuados para la AAIP; la región de producción sigue abierta en Q3.
- ⚠️ Brasil no figura entre los destinos con nivel de protección adecuado según la AAIP. Antes de operar con datos reales se DEBE instrumentar la transferencia internacional (cláusulas contractuales modelo y contratos con el barrio). Ver §12 y la decisión abierta Q3 en §17.

### 8.5 Ambientes

| Ambiente | Propósito |
|---|---|
| `local` | Supabase CLI + Docker, con datos semilla de dos barrios ficticios. |
| `preview` | Por PR (Vercel + Supabase Branching, si el plan lo permite). |
| `staging` | Demo para las revisiones humanas (🔍) y el entrenamiento del piloto. |
| `production` | Pilotos y clientes. |

### 8.6 Lineamientos de arquitectura

- **Reglas de negocio críticas en un solo lugar:** la decisión de acceso, el consumo de pases y el cierre de solicitudes viven en funciones de base de datos o Edge Functions transaccionales. La UI nunca decide un acceso por sí sola.
- **Idempotencia** en toda operación que pueda reintentarse (registro de movimientos desde la garita, sincronización offline, webhooks), mediante un `client_event_id` único.
- **Fechas en UTC** en la base; se presentan en `America/Argentina/Tucuman`, con la zona horaria configurable por tenant.
- **Sin microservicios** en el MVP: un monorepo, una base y Edge Functions.

---

## 9. Modelo de dominio

> Modelo conceptual (no es un esquema SQL). Los nombres definitivos se fijan en las migraciones. Todas las entidades, salvo las de plataforma, llevan `tenant_id`.

### 9.1 Plataforma e identidad

| Entidad | Descripción | Atributos clave |
|---|---|---|
| **Tenant (Barrio)** | Cliente de Domus. | nombre, slug, dirección, zona horaria, estado de suscripción, configuración, logo |
| **Usuario** | Cuenta de Supabase Auth. | email, teléfono, MFA |
| **Persona** | Ser humano conocido por el barrio (con o sin usuario). | nombre, apellido, tipo y número de documento, teléfono, fecha de nacimiento (opcional) |
| **Membresía** | Vínculo persona ↔ tenant con un rol. | rol, unidad (opcional), permisos, vigencia, estado |
| **Dispositivo** | Tablet o teléfono registrado para la garita. | nombre, puesto, último sync, estado (activo/revocado) |
| **Puesto (Garita)** | Punto de acceso físico. | nombre, tipo (vehicular/peatonal), activo |

### 9.2 Padrón

| Entidad | Descripción | Atributos clave |
|---|---|---|
| **Unidad** | Lote, casa o departamento. | identificador (manzana/lote), estado (ocupada/en obra/vacía), coeficiente, facturable, teléfonos de contacto |
| **Habitante** | Persona asociada a una unidad. | relación (propietario/inquilino/familiar), titular sí/no, menor sí/no |
| **Vehículo** | Asociado a una unidad. | patente, marca, modelo, color |
| **Mascota** | Asociada a una unidad. | nombre, especie, raza, foto (opcional) |

### 9.3 Accesos

| Entidad | Descripción | Atributos clave |
|---|---|---|
| **Reglamento de accesos** | Política institucional por tipo de visitante. | tipo de visitante, opciones permitidas para el hogar, opción por defecto, timeout de aprobación, verificación de identidad requerida |
| **Preferencia de unidad** | Elección del hogar dentro del reglamento. | tipo de visitante → modo (`ingreso_directo` / `aviso` / `aprobacion` / `rechazar`), contactos de respaldo en orden, "no molestar" (vigencia) |
| **Autorización** | Permiso para que una persona o un vehículo ingrese a una unidad. | tipo (`permanente` / `recurrente` / `puntual`), persona o patente, vigencia, franjas horarias, notificar al ingresar sí/no, creada por |
| **Franja horaria** | Días + horario de una autorización recurrente. | días de la semana, hora desde/hasta |
| **Pase** | Credencial compartible (QR) asociada a una unidad. | token opaco, tipo (`individual` / `evento`), ventana de validez, usos máximos/consumidos, atado a DNI (opcional), estado |
| **Evento** | Reunión con lista de invitados. | unidad anfitriona, fecha y hora, cupo, modo de registro (`lista_previa` / `auto_registro_con_aprobacion`), pase de evento, reserva de amenity asociada (opcional) |
| **Invitado de evento** | Persona registrada en un evento. | persona, patente, acompañantes, estado (`pendiente` / `aprobado` / `rechazado`), ingresó sí/no |
| **Solicitud de aprobación** | Consulta de la garita al hogar. | visitante, unidad, motivo, estado, respondida por, canal, vencimiento, resultado de la llamada de respaldo |
| **Movimiento** | Ingreso o egreso registrado. | tipo, persona/patente, unidad destino, puesto, guardia, dispositivo, regla aplicada, origen (autorización / pase / solicitud / excepción), hora local y hora de servidor, `client_event_id` |
| **Restricción de acceso** | Restricción del barrio a una persona o patente. Reemplaza la "lista negra". | persona/patente, motivo documentado, responsable, vigencia, revisión |
| **Trabajador / Proveedor** | Persona que presta servicios (obra, mantenimiento, etc.). | empresa, oficio, unidades donde trabaja, documentos |
| **Documento de trabajador** | ART, seguro de accidentes personales, etc. | tipo, archivo, vencimiento, estado de verificación |
| **Novedad (Libro de guardia)** | Registro operativo de un turno. | tipo, descripción, puesto, guardia, adjuntos |
| **Paquete** | Paquete recibido en la garita. | unidad, transportista, foto (opcional), estado (`recibido` / `notificado` / `entregado`), entregado a |

### 9.4 Comunicación

| Entidad | Atributos clave |
|---|---|
| **Comunicado** | título, cuerpo, adjuntos, segmento (todos / manzanas / unidades / roles), requiere confirmación de lectura, programación, estado |
| **Lectura de comunicado** | comunicado, persona, fecha |
| **Reclamo** | unidad, categoría, descripción, fotos, estado, prioridad, asignado a, SLA |
| **Comentario de reclamo** | autor, texto, adjuntos, interno sí/no |
| **Aviso a guardia** | unidad, tipo (catálogo), texto breve, estado (`enviado` / `visto` / `atendido`), atendido por |
| **Alerta de emergencia** | unidad, persona, ubicación (opcional), estado, atendida por, cierre |

### 9.5 Amenities

| Entidad | Atributos clave |
|---|---|
| **Amenity** | nombre, descripción, fotos, capacidad, activo |
| **Regla de amenity** | franjas reservables, duración del turno, anticipación mínima/máxima, máximo de reservas por unidad por período, requiere aprobación, costo, política de cancelación, máximo de invitados |
| **Bloqueo** | amenity, rango, motivo (mantenimiento, evento del barrio) |
| **Reserva** | amenity, unidad, persona, rango, cantidad de invitados, estado, cargo generado, evento asociado |

### 9.6 Finanzas (expensas lite)

| Entidad | Atributos clave |
|---|---|
| **Período** | mes/año, estado (`abierto` / `publicado` / `cerrado`) |
| **Cargo** | unidad, período, concepto (`expensa` / `extraordinaria` / `amenity` / `multa` / `ajuste`), importe, vencimiento, origen |
| **Pago** | unidad, importe, fecha, medio, comprobante, estado (`informado` / `conciliado` / `rechazado`), conciliado por |
| **Cuenta corriente** | Vista derivada de cargos y pagos por unidad (saldo, deuda vencida). |
| **Categoría de gasto** | nombre, rubro presupuestario |
| **Gasto** | período, categoría, proveedor, importe, fecha, comprobante, descripción |
| **Presupuesto** | año, categoría, importe mensual/anual planificado |
| **Liquidación publicada** | período, PDF emitido por el sistema contable externo, fecha de publicación |

### 9.7 Transversales

| Entidad | Atributos clave |
|---|---|
| **Notificación** | destinatario, tipo, canal(es), payload, estado de entrega, leída |
| **Suscripción push** | persona, dispositivo, plataforma (Expo / Web Push), token |
| **Preferencias de notificación** | persona, tipo → canales habilitados |
| **Evento de auditoría** | actor, acción, entidad, antes/después (diff), IP o dispositivo, fecha |

### 9.8 Máquinas de estado

**Solicitud de aprobación**

```
creada ──► notificada ──► aprobada ──► (movimiento de ingreso)
                    ├──► rechazada
                    └──► vencida ──► respaldo_llamada ──► aprobada_por_llamada
                                                     ├──► rechazada_por_llamada
                                                     └──► sin_contacto ──► (decisión de guardia según reglamento, registrada como excepción)
cancelada (por la guardia: la visita se fue)
```

**Pase**

```
activo ──► consumido (usos < máximo, sigue activo) ──► agotado
      ├──► vencido (fin de la ventana)
      └──► revocado (por el residente o el admin)
```

**Invitado de evento**: `pendiente → aprobado | rechazado` (con lista previa nace `aprobado`) → `ingresado`.

**Reserva**: `pendiente_aprobacion → confirmada → completada | cancelada | no_show` (sin aprobación requerida, nace `confirmada`).

**Reclamo**: `abierto → en_curso → resuelto → cerrado`; `resuelto → reabierto → en_curso`.

**Pago**: `informado → conciliado | rechazado`.

**Paquete**: `recibido → notificado → entregado`.

**Alerta de emergencia**: `activa → atendida → cerrada`.

---

## 10. Especificación funcional por módulo

Cada módulo indica: objetivo, funcionalidades (con ID, enfoque y criterios de aceptación) y el **hito de revisión humana** correspondiente. El orden de construcción está en §13.

---

### M00 — Fundaciones `[MVP-Núcleo]`

**Objetivo:** dejar la base técnica, visual y de seguridad sobre la que se construye todo lo demás.

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M00-F01 | Monorepo Turborepo con `apps/web`, `apps/mobile` (esqueleto), `packages/domain`, `packages/ui-tokens`, `supabase/` | — | `pnpm dev` levanta la web y Supabase local; CI con lint, typecheck y tests. |
| M00-F02 | Tokens de diseño desde `DESIGN.md` en Tailwind v4 y en un paquete compartido para RN | 🌐 | Página interna `/design` que muestra tokens, tipografía, botones, inputs, badges de estado y el panel semáforo en claro/oscuro y en "modo garita". |
| M00-F03 | Layouts base: shell web (sidebar en desktop, tab bar inferior en móvil), selector de contexto (barrio/rol/unidad) | 🌐 | Navegación usable a 360 px y a 1440 px; el contexto activo es visible siempre. |
| M00-F04 | Autenticación (email + contraseña, magic link, recuperación) | 🌐 | Login, logout, recuperación y sesión persistente; mensajes de error en es-AR. |
| M00-F05 | Esquema base multitenant: tenants, personas, membresías, auditoría + RLS + tests de aislamiento | — | La suite de aislamiento pasa en CI; ninguna tabla de tenant queda sin RLS (check automático). |
| M00-F06 | Auditoría transversal (trigger o función) | — | Toda escritura en tablas sensibles genera un evento de auditoría con actor y diff. |
| M00-F07 | Observabilidad (módulo de reporte de errores desacoplado del proveedor), ambientes `local` / `staging` | — | Un error forzado queda registrado con contexto de tenant (sin PII) a través del módulo; conectar Sentry u otro proveedor es solo configurar un adaptador (D15). |
| M00-F08 | i18n base es-AR, formato de moneda ARS, zona horaria por tenant | 🌐 | Fechas y montos con formato local. |

> 🔍 **HR-00 — Fundaciones.** Revisar: estructura del repo, página `/design` (fidelidad con `DESIGN.md`, modo garita, modo oscuro), login completo, demostración de aislamiento (usuario de A intentando leer B) y pipeline de CI en verde.

---

### M01 — Plataforma y tenants `[MVP-Núcleo]`

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M01-F01 | Backoffice super-admin: alta de tenant (datos, zona horaria, logo, estado de suscripción) | 🖥️ | Se crea un barrio y se invita a su primer administrador por email. |
| M01-F02 | Estados de suscripción (`piloto` / `activo` / `suspendido` / `baja`) y su efecto | 🖥️ | Si el tenant está suspendido, los usuarios ven un aviso y solo lectura; la garita mantiene la validación (no se corta la seguridad). |
| M01-F03 | Conteo de unidades facturables por tenant | 🖥️ | Reporte por tenant según los criterios configurados. |
| M01-F04 | Acceso de soporte excepcional ("impersonación" auditada, con motivo y duración) | 🖥️ | Cada acceso queda auditado y es visible para el admin del barrio. |
| M01-F05 | MFA obligatorio para super-admin | 🖥️ | Sin MFA no se accede al backoffice. |

> 🔍 **HR-01 — Plataforma.** Crear un barrio de punta a punta, invitar a un admin, suspenderlo y reactivarlo, y verificar la auditoría del acceso de soporte.

---

### M02 — Padrón del barrio `[MVP-Núcleo]`

**Objetivo:** tener el barrio digitalizado (unidades, habitantes, vehículos) con onboarding de residentes.

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M02-F01 | ABM de unidades (manzana/lote, estado, coeficiente, facturable) | 🖥️ | Alta, edición y baja lógica; búsqueda por identificador. |
| M02-F02 | Importación masiva de unidades y habitantes (CSV/XLSX con plantilla) | 🖥️ | Vista previa con errores por fila antes de confirmar; la importación es idempotente. |
| M02-F03 | ABM de habitantes por unidad (relación, titular, menor) | 🖥️ | Una unidad ocupada tiene al menos un titular; los menores no reciben invitación de cuenta. |
| M02-F04 | Invitación de residentes (email o link de un solo uso; código de unidad como alternativa) | 🖥️ admin / 📱 residente | El residente acepta, crea su cuenta y queda con la membresía correcta. |
| M02-F05 | "Mi hogar": el titular gestiona miembros, vehículos y mascotas, y delega permisos (finanzas, reservas) | 📱 | El titular invita a un miembro; el miembro ve solo lo habilitado. |
| M02-F06 | ABM de guardias (membresía guardia, puestos asignados) | 🖥️ | El guardia invitado accede solo a la consola de su barrio. |
| M02-F07 | Puestos (garitas) y dispositivos registrados | 🖥️ | Se registra una tablet con un código de vinculación y queda asociada a un puesto. |
| M02-F08 | Ficha de unidad (vista 360°: habitantes, vehículos, autorizaciones, movimientos recientes, saldo) | 🖥️ | Se accede desde la búsqueda global del admin. |

> 🔍 **HR-02 — Padrón.** Importar un barrio de prueba de 150 unidades, invitar a un residente que se registra desde el celular y gestiona su hogar, y registrar un guardia y una tablet.

---

### M03 — Reglamento de accesos (configuración institucional) `[MVP-Núcleo]`

**Objetivo:** que la administración defina las reglas que enmarcan las preferencias de cada hogar (principio P1).

**Tipos de visitante (catálogo fijo del MVP):**

| Tipo | Descripción |
|---|---|
| `autorizado_permanente` | Persona o vehículo en la lista de habilitados de la unidad (familia, amigos frecuentes). |
| `autorizado_recurrente` | Personal con días y franja horaria (personal doméstico, jardinero, profesor). |
| `invitado_con_pase` | Presenta un QR individual válido. |
| `invitado_evento` | Figura como aprobado en un evento. |
| `delivery` | Reparto o cadetería. |
| `servicio_trabajador` | Obrero, técnico o proveedor registrado. |
| `desconocido` | No figura en ninguna lista ni tiene pase. |

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M03-F01 | Por cada tipo, definir los **modos permitidos** para el hogar y el **modo por defecto** | 🖥️ | Ejemplo: `desconocido` solo admite `aprobacion` o `rechazar`; `autorizado_permanente` admite `ingreso_directo` o `aviso`. |
| M03-F02 | Timeout de aprobación (por defecto: 90 s) y procedimiento de respaldo (llamada a contactos en orden) | 🖥️ | Configurable entre 30 y 300 s. |
| M03-F03 | Verificación de identidad requerida por tipo (documento obligatorio sí/no) | 🖥️ | Si es obligatoria, la garita no puede registrar el ingreso sin un documento cargado o escaneado. |
| M03-F04 | Límites: vigencia máxima de autorizaciones permanentes, máximo de usos y duración de pases, cupo máximo de eventos | 🖥️ | El residente no puede crear nada que exceda los límites (validado en el servidor). |
| M03-F05 | Plantillas de reglamento ("Estricto", "Equilibrado", "Flexible") como punto de partida | 🖥️ | Al crear un tenant se aplica "Equilibrado"; el admin puede ajustarlo. |
| M03-F06 | Historial de cambios del reglamento (auditoría visible) | 🖥️ | Cada cambio muestra quién, cuándo, antes y después. |

> 🔍 **HR-03 — Reglamento.** Revisar con un caso real de un barrio de Tucumán si los tipos y modos alcanzan; aprobar los valores por defecto de las plantillas.

---

### M04 — Accesos: experiencia del residente `[MVP-Núcleo]`

**Objetivo:** que el residente evite llamadas innecesarias autorizando antes y eligiendo cómo lo consultan.

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M04-F01 | **Preferencias del hogar** por tipo de visitante, mostrando solo los modos que permite el reglamento | 📱 | Un cambio aplica de inmediato en la garita; queda auditado. |
| M04-F02 | **Contactos de respaldo** ordenados (quién recibe la solicitud y a quién se llama si no hay respuesta) | 📱 | Al menos un contacto con teléfono por unidad ocupada. |
| M04-F03 | **No molestar / Estoy de viaje** con vigencia: cambia el destinatario o el canal, o rechaza a los desconocidos (P3) | 📱 | Nunca convierte un caso en `ingreso_directo`; muestra un aviso claro de su efecto. |
| M04-F04 | **Lista de habilitados permanentes** (persona con DNI y/o patente, vigencia, "avisarme al ingresar") | 📱 | Alta en menos de 30 s desde el celular; se puede importar un contacto del teléfono (en la app nativa). |
| M04-F05 | **Autorizaciones recurrentes** con días y franja horaria (por ejemplo, lunes a viernes de 8 a 17) y comportamiento fuera de franja (pasa a `aprobacion`) | 📱 | La garita ve verde dentro de la franja y amarillo fuera de ella, con el motivo. |
| M04-F06 | **Pase individual (QR)**: ventana de validez, cantidad de usos, atado a DNI opcional, nota para la guardia | 📱 | Se comparte por WhatsApp o cualquier app (share sheet nativa o Web Share API) como link a la página del invitado. |
| M04-F07 | **Pase de evento**: fecha y hora, cupo, modo `lista_previa` (el anfitrión carga a los invitados) o `auto_registro_con_aprobacion` (el invitado se registra con link y el anfitrión aprueba con un toque o en bloque) | 📱 | Un invitado auto-registrado **nunca** ingresa sin aprobación del anfitrión; el anfitrión ve en vivo quién confirmó y quién ingresó. |
| M04-F08 | **Pre-aviso de delivery** ("espero un pedido de X en las próximas 2 horas") | 📱 | La garita ve el pre-aviso y registra el ingreso como verde con motivo "pre-aviso". |
| M04-F09 | **Bandeja de solicitudes**: aprobar o rechazar con un toque desde el push (acciones en la notificación) o desde la app/web | 📱 | La respuesta llega a la garita en menos de 2 s (Realtime); si otro miembro del hogar ya respondió, se informa. |
| M04-F10 | **Historial de movimientos** de la unidad (quién entró y salió, cuándo, con qué autorización) | 📱 | Filtros por fecha y tipo; exportable por el titular. |
| M04-F11 | Revocar cualquier autorización o pase al instante | 📱 | La revocación se refleja en la garita online de inmediato y en los dispositivos offline en el próximo sync (S6). |

**Página pública del invitado** (📱):

- **Pase individual:** QR grande, nombre del barrio, unidad anfitriona (sin datos personales del residente más allá de lo que se configure), ventana de validez e instrucciones. Sin indexación (S9).
- **Evento:** formulario de auto-registro (nombre, apellido, DNI, patente opcional, acompañantes), muestra el estado (`pendiente` / `aprobado`) y, una vez aprobado, el QR personal.
- Funciona sin cuenta, en cualquier navegador móvil moderno, con un peso inicial menor a 200 KB.

> 🔍 **HR-04a — Preferencias y autorizaciones** (F01–F05, F10–F11).
> 🔍 **HR-04b — Pases y eventos** (F06–F08 + página del invitado): probar compartir por WhatsApp en Android e iOS y completar un auto-registro.
> 🔍 **HR-04c — Solicitudes en tiempo real** (F09): prueba cruzada con M05 en dos dispositivos.

---

### M05 — Accesos: consola de garita `[MVP-Núcleo]`

**Objetivo:** que la guardia resuelva cada ingreso en segundos, con un motivo claro y un registro completo. Enfoque: 📟 **Tablet garita** (y funcional en el celular del guardia vía web).

#### Algoritmo de decisión (se ejecuta en el servidor; también en el dispositivo offline con datos en caché, ver M06)

Para un visitante identificado (por documento, QR o patente) y una unidad destino:

1. **Restricción de acceso vigente** sobre la persona o la patente → 🔴 **Rojo** ("Restringido por la administración"). Fin.
2. **QR presentado** → validar el pase (existe, activo, dentro de la ventana, usos disponibles, DNI coincidente si está atado). Si es válido → 🟢, con consumo transaccional. Si no → 🔴 con el motivo (vencido, agotado, revocado, inexistente).
3. **Invitado de evento aprobado** dentro de la ventana del evento → 🟢.
4. **Autorización permanente o recurrente** vigente (y dentro de la franja, si es recurrente) → aplicar el modo de la preferencia de la unidad para ese tipo: `ingreso_directo` → 🟢; `aviso` → 🟢 + notificación; `aprobacion` → 🟡.
5. **Pre-aviso de delivery** vigente para esa unidad → 🟢 (o según la preferencia).
6. **Ninguna de las anteriores** → tipo `desconocido` → modo de la preferencia: `aprobacion` → 🟡 (solicitud); `rechazar` → 🔴.
7. Si el reglamento exige verificación de identidad y no hay documento → 🟡 "Falta documento".

La pantalla SIEMPRE muestra: **color + ícono + texto del resultado + motivo + regla aplicada + quién autorizó**.

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M05-F01 | **Pantalla principal de garita**: acciones grandes (Escanear DNI, Escanear QR, Buscar patente/persona/unidad), cola de solicitudes en curso, indicador de conectividad y último sync | 📟 | Botones de al menos 56 px y texto de al menos 20 px; usable con una mano; contraste AA en "modo garita". |
| M05-F02 | **Escaneo del PDF417 del DNI argentino** con la cámara (web y nativa); se extraen número, apellido, nombre y sexo; carga manual como alternativa (DNI libreta, extranjeros, código ilegible) | 📟 | Lectura de un DNI tarjeta en menos de 2 s en una tablet de gama media; solo se persisten los campos mínimos (S5). |
| M05-F03 | **Escaneo del QR del pase** | 📟 | Validación y consumo en menos de 1 s online; un QR de un solo uso no puede consumirse dos veces (test de concurrencia). |
| M05-F04 | **Búsqueda** por patente, apellido, DNI o unidad, con resultados al tipear | 📟 | Menos de 300 ms con 2.000 unidades. |
| M05-F05 | **Panel semáforo** con el resultado del algoritmo y un botón de acción principal ("Registrar ingreso" / "Solicitar aprobación" / "Ver motivo") | 📟 | En verde, el ingreso se registra con 1 toque; en total, un ingreso verde toma menos de 10 s desde el escaneo. |
| M05-F06 | **Solicitud de aprobación** al hogar con temporizador visible; al vencer, pasa al respaldo con la lista de contactos y botones "Atendió y aprobó / rechazó / no atendió" | 📟 | Cumple la máquina de estados de §9.8; el silencio nunca aprueba (P2). |
| M05-F07 | **Excepción de guardia**: registrar un ingreso fuera de regla (por ejemplo, emergencia médica) con motivo obligatorio | 📟 | Queda marcado como excepción y notifica a la administración. |
| M05-F08 | **Registro de egreso** (por búsqueda, QR o desde la lista de presentes) | 📟 | Se distingue "egreso no registrado" de "presente confirmado". |
| M05-F09 | **Presentes** (visitas y trabajadores dentro del barrio, con hora de ingreso y unidad) | 📟 | Sirve para operar; **no se presenta como padrón certificado de evacuación**. |
| M05-F10 | **Trabajadores y proveedores**: registro con documentación (ART, seguro de AP) y vencimiento; al vencer → 🔴 "Documentación vencida" | 📟 garita / 🖥️ admin | El admin carga y verifica los documentos; la garita ve el estado. Aviso automático al trabajador y a la unidad 7 días antes del vencimiento. |
| M05-F11 | **Restricciones de acceso** (ex lista negra): persona/patente, motivo, responsable, vigencia, revisión | 🖥️ admin | Solo el admin con permiso `accesos_config` las crea; nunca se comparten entre barrios. |
| M05-F12 | **Libro de guardia digital**: novedades del turno (tipo, texto, adjunto), cambio de turno con resumen | 📟 | El turno entrante ve las novedades abiertas del saliente. |
| M05-F13 | **Paquetería**: registrar la recepción (unidad, transportista, foto opcional) → push al hogar → entrega con registro de quién retiró | 📟 | El residente ve sus paquetes pendientes en la app. |
| M05-F14 | **Auditoría de accesos** para el admin: filtros por fecha, unidad, tipo, resultado, guardia y excepciones; exportación CSV | 🖥️ | Los registros no son editables (S3); las correcciones se hacen como eventos nuevos con motivo. |

> 🔍 **HR-05a — Consola básica** (F01, F04, F05, F08, F09, F14), en tablet real.
> 🔍 **HR-05b — Escaneo** (F02, F03): prueba con al menos 20 DNIs reales de distintos ejemplares y con QR desde pantallas con brillo bajo.
> 🔍 **HR-05c — Aprobación y excepciones** (F06, F07), de punta a punta con M04-F09 en dos dispositivos.
> 🔍 **HR-05d — Trabajadores, restricciones, libro y paquetería** (F10–F13).
> 🔍 **HR-05e — Simulacro de garita**: un guardia real (o persona ajena al desarrollo) opera 30 ingresos simulados mixtos; se mide el tiempo y los errores.

---

### M06 — Contingencia y modo offline de garita `[MVP-Núcleo]`

**Objetivo:** que la garita siga operando con un corte de internet, **sin mentir sobre el estado** (S6).

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M06-F01 | **Caché local** en el dispositivo de garita: autorizaciones permanentes y recurrentes vigentes, invitados de eventos del día, pases activos del día, restricciones y padrón mínimo (unidades, contactos) | 📟 | Se refresca por Realtime y con un sync completo periódico (cada 5 min). En la app nativa usa SQLite; en la web, IndexedDB. |
| M06-F02 | **Indicador de estado permanente**: online / degradado / offline + "último sync hace X min" | 📟 | Visible en toda pantalla de la consola. |
| M06-F03 | **Decisión offline** con los datos en caché: verde solo si la autorización existe en caché y el caché tiene menos antigüedad que el máximo configurado (por defecto, 30 min); pasado ese límite, todo pasa a 🟡 "Verificación manual" | 📟 | Las decisiones offline se marcan como tales en el movimiento. |
| M06-F04 | **Pases de un solo uso offline**: se aceptan con la advertencia "no se puede verificar un uso previo en otro puesto"; si se registró un consumo local, se rechaza un segundo uso en el mismo dispositivo | 📟 | En el piloto (una garita) el riesgo queda acotado; con varias garitas se requiere validación online (§15). |
| M06-F05 | **Cola local de movimientos** con `client_event_id`, hora local, operador y dispositivo; sincronización idempotente al reconectar | 📟 | Sin duplicados tras cortes repetidos (test automático). |
| M06-F06 | **Solicitudes de aprobación offline**: no se pueden enviar → se pasa directamente al respaldo telefónico con la lista de contactos en caché | 📟 | Queda registrado como "respaldo por offline". |
| M06-F07 | **Revocaciones pendientes**: al reconectar, si un ingreso offline usó una autorización que había sido revocada, se genera una alerta para el admin | 🖥️ | La alerta queda visible en el panel de auditoría. |
| M06-F08 | **Protocolo manual imprimible** (PDF por barrio: contactos y procedimiento) | 🖥️ | Generado desde el admin; se actualiza con el padrón. |

> 🔍 **HR-06 — Simulacro de corte.** Cortar la conectividad de la tablet durante 20 minutos con ingresos simulados, reconectar y verificar que no haya duplicados, que las marcas offline sean correctas y que se genere la alerta de revocación pendiente. Probarlo primero en la web (degradado) y repetirlo en la app nativa en H11.

---

### M07 — Comunicación `[MVP-Núcleo]`

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M07-F01 | **Comunicados** de admin a vecinos: editor de texto enriquecido, adjuntos, segmentación (todos / manzanas / unidades / roles), programación, confirmación de lectura opcional | 🖥️ redactar / 📱 leer | Push + email según preferencias; el admin ve el porcentaje de lectura y quién no leyó. |
| M07-F02 | **Cartelera** de comunicados vigentes (fijados, archivo) | 📱 | Accesible desde el inicio del residente. |
| M07-F03 | **Reclamos** de vecino a administración: categoría, descripción, fotos, estados (§9.8), comentarios públicos e internos, asignación, SLA por categoría | 📱 crear / 🖥️ gestionar | El vecino recibe una notificación en cada cambio de estado; el admin ve el tablero por estado y antigüedad. |
| M07-F04 | **Avisos del vecino a la guardia**, estructurados: catálogo configurable ("Ruidos molestos en…", "Perro suelto", "Auto sospechoso", "Necesito asistencia", "Otro") + texto breve, con estados `enviado` / `visto` / `atendido` | 📱 vecino / 📟 garita | Aparece en la consola con sonido; el vecino ve cuándo fue visto y atendido. No es chat libre (P6). |
| M07-F05 | **Alerta de emergencia** (botón con confirmación de mantener presionado 2 s): notifica a la garita con prioridad máxima y a los contactos del hogar | 📱 | En la garita, la alerta ocupa la pantalla hasta que alguien la atiende; queda auditada. |
| M07-F06 | **Avisos de la guardia al vecino**: mensajes predefinidos ("Su visita se retiró", "Portón abierto en su lote", "Paquete recibido") | 📟 | Push a la unidad, con registro. |

> 🔍 **HR-07a — Comunicados y cartelera.**
> 🔍 **HR-07b — Reclamos.**
> 🔍 **HR-07c — Avisos a la guardia y emergencia**, cruzado entre la app del residente y la consola.

---

### M08 — Amenities `[MVP-Núcleo]`

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M08-F01 | ABM de amenities con fotos, capacidad y reglas (§9.5) | 🖥️ | Al menos los tipos SUM, quincho, cancha (por turnos) y pileta (por cupo). |
| M08-F02 | Bloqueos por mantenimiento o eventos del barrio | 🖥️ | Las reservas afectadas se notifican y se cancelan. |
| M08-F03 | **Calendario y reserva** con disponibilidad en vivo y reglas aplicadas en el servidor (anticipación, máximos, solapamientos) | 📱 | Imposible reservar dos veces el mismo turno (constraint de exclusión en la base). |
| M08-F04 | Aprobación de reservas (cuando la regla lo requiere) | 🖥️ / 📱 | El residente es notificado del resultado. |
| M08-F05 | **Costo de la reserva → cargo en la cuenta corriente** de la unidad (integración con M09) | — | El cargo se crea al confirmarse la reserva y se anula según la política de cancelación. |
| M08-F06 | **Reserva con invitados → pase de evento automático** (integración con M04-F07) | 📱 | Al reservar el SUM indicando invitados, se crea el evento con la ventana de la reserva y se ofrece compartir el link. |
| M08-F07 | Cancelación según la política (con o sin cargo) y registro de no-show por el admin | 📱 / 🖥️ | Un no-show puede generar una multa (cargo) si el reglamento lo prevé. |
| M08-F08 | Agenda del admin (vista diaria y semanal de todas las reservas) | 🖥️ | Filtros por amenity; impresión o exportación. |

> 🔍 **HR-08 — Amenities.** Reservar un SUM con invitados desde el celular → ver el cargo en la cuenta corriente → el pase de evento generado → ingreso de un invitado en la garita.

---

### M09 — Expensas lite y transparencia `[MVP-Núcleo]`

**Objetivo:** transparencia financiera y control de cobro **sin reemplazar** el sistema contable de la administradora (P7). La liquidación por coeficiente automática es `[Fase 2]`.

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M09-F01 | **Períodos** (abrir, publicar, cerrar) | 🖥️ | Un período cerrado no admite cambios (solo ajustes en el período abierto). |
| M09-F02 | **Carga de cargos**: importación del CSV/XLSX de la liquidación del sistema externo (unidad, concepto, importe, vencimiento) + carga manual de extraordinarias, multas y ajustes | 🖥️ | Vista previa con validación; la importación es idempotente por período. |
| M09-F03 | **Publicación de la liquidación oficial** (PDF del sistema externo) por período | 🖥️ / 📱 | El residente la descarga desde la app. |
| M09-F04 | **Cuenta corriente por unidad**: cargos, pagos, saldo, deuda vencida, con la leyenda "Fuente: liquidación del período X" | 📱 | Coincide al centavo con la importación; muestra el origen de cada línea. |
| M09-F05 | **Informar un pago** (importe, fecha, medio, comprobante) | 📱 | El admin recibe el aviso; el pago queda `informado`. |
| M09-F06 | **Conciliación** por el admin (`conciliado` / `rechazado` con motivo) | 🖥️ | El saldo solo se actualiza con pagos conciliados. |
| M09-F07 | **Gastos del barrio** con categoría, proveedor y comprobante adjunto, visibles para los residentes | 🖥️ cargar / 🌐 ver | El residente ve el gasto y su comprobante (URL firmada temporal). |
| M09-F08 | **Presupuesto anual vs. ejecutado** por categoría, con gráfico y desvíos | 🌐 | Los desvíos mayores al umbral configurable se resaltan. |
| M09-F09 | **Morosidad**: tablero del admin (deuda por antigüedad) y recordatorios automáticos al vencimiento y a los X días | 🖥️ | La morosidad **nunca** se publica a la comunidad (§12). |

> 🔍 **HR-09a — Cuenta corriente y pagos** (F01–F06): conciliar una importación real anonimizada contra la liquidación original.
> 🔍 **HR-09b — Transparencia** (F07–F09): un residente ajeno al proyecto revisa si entiende los gastos y el presupuesto.

---

### M10 — Notificaciones (transversal) `[MVP-Núcleo]`

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M10-F01 | **Centro de notificaciones** in-app (web y nativa) con leídas/no leídas | 📱 | Toda notificación push también queda en el centro. |
| M10-F02 | **Web Push** (VAPID) para la PWA en Android y en iOS 16.4+ instalada | 📱 | Las solicitudes de aprobación llegan con acciones "Aprobar / Rechazar" donde la plataforma lo soporte. |
| M10-F03 | **Push nativo** (Expo) en la app móvil (se activa en H11) | 📱 | Categorías con acciones (aprobar/rechazar) en iOS y Android. |
| M10-F04 | **Email transaccional** (invitaciones, comunicados, resúmenes) | — | Plantillas con la identidad de Domus y del barrio. |
| M10-F05 | **Preferencias** por tipo de notificación y canal | 📱 | Las solicitudes de aprobación y las emergencias no se pueden desactivar del todo (como mínimo, queda el centro in-app). |
| M10-F06 | **Contenido mínimo en la pantalla bloqueada** ("Solicitud de ingreso en tu unidad", sin nombre del visitante si se elige "privado") | 📱 | Configurable por el usuario. |

> 🔍 **HR-10 — Notificaciones**, en iOS y Android reales (PWA en H10 y nativa en H11).

---

### M11 — Reportes y panel de administración `[MVP-Núcleo]`

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M11-F01 | **Dashboard del admin**: ingresos del día, solicitudes pendientes, excepciones, reclamos abiertos, reservas del día, morosidad | 🖥️ | Carga en menos de 2 s. |
| M11-F02 | **Métricas del piloto** (§14): llamadas evitadas (ingresos verdes sin solicitud), tiempo de atención, adopción por unidad | 🖥️ | Exportable para el informe del piloto. |
| M11-F03 | Exportaciones CSV de cada listado principal | 🖥️ | Respetan los permisos del rol. |

> 🔍 **HR-11 — Panel de administración y métricas.**

---

### M12 — App nativa (Expo) `[MVP-Núcleo]`

**Objetivo:** llevar las vistas 📱 y 📟 a una app nativa reutilizando el dominio.

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M12-F01 | App de residente: inicio, accesos (M04), solicitudes, comunicados, reclamos, avisos, amenities, cuenta corriente, notificaciones | 📱 | Paridad funcional con la web para las vistas 📱. |
| M12-F02 | App de guardia (rol guardia en el mismo binario o una variante dedicada; decisión en HR-12): consola M05 completa | 📟 | Modo kiosco recomendado en la tablet (Android). |
| M12-F03 | Offline robusto con SQLite (M06) | 📟 | Repite HR-06 con éxito. |
| M12-F04 | Escaneo nativo PDF417/QR (expo-camera) | 📟 | Igual o mejor rendimiento que la web. |
| M12-F05 | Push nativo con acciones (M10-F03) y deep links a la solicitud o al pase | 📱 | Tocar la notificación abre la pantalla exacta. |
| M12-F06 | Compartir pases con la share sheet nativa; importar contactos del teléfono para autorizaciones | 📱 | — |
| M12-F07 | Distribución: TestFlight / prueba interna en Play, con actualizaciones OTA (EAS Update) | — | Builds reproducibles con EAS. |

> 🔍 **HR-12 — App nativa**, en dispositivos reales iOS y Android + repetición de HR-05e y HR-06 sobre la app.

---

### M13 — Robustez operativa `[MVP-Cierre]` (aportes de la revisión externa)

> Estas funcionalidades surgen de la revisión crítica de Codex. Por decisión del fundador **forman parte del MVP, pero se construyen al final**, después del núcleo (M00–M12). El modelo de datos del núcleo DEBE dejarlas preparadas (por ejemplo, la vigencia en las membresías y los dispositivos separados de la identidad del operador).

| ID | Funcionalidad | Enfoque | Criterios de aceptación |
|---|---|---|---|
| M13-F01 | **Baja inmediata y mudanzas**: dar de baja a un residente, inquilino o guardia revoca en el acto su membresía, sus sesiones, sus autorizaciones creadas (opcional) y su caché de dispositivo; cambiar a alguien de unidad conserva el historial | 🖥️ | La revocación se refleja en la garita en menos de 1 min online. |
| M13-F02 | **Credenciales individuales del guardia en una tablet compartida**: el dispositivo está registrado al puesto y el operador inicia turno con PIN o QR personal; cambio de turno rápido | 📟 | Cada movimiento identifica dispositivo **y** operador. |
| M13-F03 | **Vecinos sin smartphone**: el admin o el titular gestionan por ellos; la garita usa los contactos telefónicos como canal principal para esas unidades (marcado en el padrón) | 🖥️ / 📟 | La garita ve el ícono "sin app" y pasa directo a la llamada. |
| M13-F04 | **Disputas de autorización** entre propietario, ocupante y administrador: precedencias configurables (por ejemplo, el inquilino titular manda sobre el propietario no residente) y un registro de conflictos | 🖥️ | Ante dos preferencias contradictorias se aplica la precedencia y se informa a ambos. |
| M13-F05 | **Delegación limitada y menores**: los miembros menores no pueden autorizar a desconocidos ni crear eventos; límites por miembro | 📱 | Validado en el servidor. |
| M13-F06 | **Recuperación de cuenta** segura (sin contraseñas compartidas; re-verificación por el admin si se pierde el email) | 🌐 | Flujo auditado. |
| M13-F07 | **Protocolo de emergencias y excepciones** aprobado por el barrio, consultable en la consola | 📟 | Accesible con un toque desde la consola, también offline. |
| M13-F08 | **Exportación completa y continuidad**: el admin exporta todos los datos del tenant (padrón, movimientos, finanzas, adjuntos) en formatos abiertos | 🖥️ | ZIP con CSV/JSON + archivos, generado en segundo plano. |
| M13-F09 | **Tablero de salud operativa**: dispositivos y último sync, dispositivos desconectados, revocaciones pendientes de propagar, versión de la app | 🖥️ | Alerta al admin si la garita lleva más de X min sin sincronizar. |
| M13-F10 | **Capacitación por turno**: checklist de entrenamiento por guardia y modo práctica (sandbox) en la consola | 📟 | Un guardia no capacitado ve un aviso al iniciar turno. |
| M13-F11 | **Auditoría de cambios de reglas visible para los residentes** (qué cambió en el reglamento y cuándo) | 🌐 | Transparencia del reglamento. |

> 🔍 **HR-13 — Robustez operativa.** Revisión completa de bajas, cambios de turno, unidades sin app y exportación, seguida de la **revisión final del MVP** (HR-FINAL, §13).

---

## 11. Requisitos no funcionales

| Área | Requisito |
|---|---|
| **Rendimiento (garita)** | Un ingreso verde desde el escaneo en menos de 10 s (objetivo: menos de 5 s). Validación de un QR online en menos de 1 s. Búsqueda en menos de 300 ms. |
| **Rendimiento (web)** | LCP menor a 2,5 s en 4G para las vistas del residente; página del invitado menor a 200 KB iniciales. |
| **Tiempo real** | Respuesta del residente visible en la garita en menos de 2 s (p95). |
| **Disponibilidad** | Objetivo del 99,5 % mensual en el piloto; la garita mantiene la operación degradada ante caídas (M06). |
| **Recuperación** | RPO de 15 min o menos (PITR), RTO de 4 h o menos; restauración probada antes del piloto. Respaldo independiente de Storage. |
| **Seguridad** | RLS en el 100 % de las tablas de tenant (check en CI); OWASP ASVS nivel 1 como guía; rate limiting en los endpoints públicos (página del invitado, auto-registro); tokens de pase con al menos 128 bits de entropía. |
| **Privacidad** | §12. |
| **Accesibilidad** | WCAG 2.1 AA; el estado nunca se comunica solo con color; touch targets de 44 px como mínimo (56 px en la garita). |
| **Compatibilidad** | Últimas 2 versiones de Chrome, Safari, Edge y Firefox; iOS 16.4+ y Android 10+; tablet Android de 10" de referencia para la garita. |
| **Idioma** | es-AR en el MVP; textos externalizados para i18n futura. |
| **Calidad** | Cobertura de tests unitarios en `packages/domain` del 80 % o más; e2e de los flujos críticos (ingreso verde, solicitud, pase, evento, reserva, pago); suite de RLS. |
| **Observabilidad** | Errores en Sentry sin PII; logs de Edge Functions con el `tenant_id` como contexto. |
| **Escalabilidad** | El diseño soporta 200 tenants y 50.000 unidades sin cambios de arquitectura (canales Realtime por tenant, índices por `tenant_id`). |

---

## 12. Privacidad y marco legal

**Marco:** Ley 25.326 de Protección de Datos Personales (Argentina) y normativa de la AAIP.

| Tema | Definición para el MVP |
|---|---|
| Roles de tratamiento | El **barrio** es responsable del tratamiento y **Domus** es el proveedor (encargado). Se formaliza en el contrato: finalidades, subencargados (Supabase, Vercel, proveedor de email, Expo), confidencialidad, incidentes, devolución y borrado de datos, atención de derechos. |
| Información al titular | Aviso de privacidad en el onboarding del residente y en la página del invitado (antes del auto-registro). |
| Minimización | Del DNI: número, apellido, nombre (y sexo, si hace falta para desambiguar). Sin fotos de documentos. Sin biometría en el MVP. |
| Retención (por defecto, configurable por tenant y a validar con asesoría) | Movimientos de visitantes: 90 días. Invitados de eventos: 30 días después del evento. Documentación de trabajadores: mientras esté vigente + 30 días. Auditoría: 1 año. Retención extendida ("legal hold") por incidente documentado. |
| Purga | Job diario con `pg_cron`, que deja auditoría del volumen purgado. |
| Acceso | Cada vecino ve sus datos; la guardia ve lo necesario para operar; los accesos administrativos excepcionales quedan auditados. Sin búsquedas de DNI entre barrios. |
| Exposición | La morosidad y los movimientos nunca se publican a la comunidad. La página del invitado no se indexa ni muestra otros invitados. |
| Transferencia internacional | Hosting en Brasil → requiere un mecanismo válido (cláusulas contractuales modelo) y revisión profesional **antes de operar con datos reales** (Q3). |
| Registro | Evaluar la inscripción de las bases ante la AAIP con asesoría legal. |
| Dispositivos | Revocación remota de las tablets; borrado del caché local al revocar; cifrado del almacenamiento local cuando la plataforma lo permita. |

> 🔍 **HR-LEGAL — Revisión legal** (antes del piloto con datos reales): contrato tipo con el barrio, aviso de privacidad, política de retención, transferencia internacional.

---

## 13. Roadmap de hitos y revisiones humanas

### 13.1 Qué es un hito de revisión humana (🔍)

Al terminar cada funcionalidad o módulo marcado con 🔍, **el desarrollo se detiene** hasta que el revisor aprueba. La revisión se hace sobre `staging`, con este checklist:

1. ✅ **Demo funcional** del flujo completo, en web de escritorio **y** en viewport móvil (y en tablet para 📟).
2. ✅ **Criterios de aceptación** de cada funcionalidad del hito, verificados uno por uno.
3. ✅ **Diseño** fiel a `DESIGN.md` (incluida la Parte A, adaptación para Domus).
4. ✅ **Seguridad:** tests de RLS y aislamiento en verde; sin claves en el cliente.
5. ✅ **Tests** automáticos del hito en verde en CI.
6. ✅ **Documentación:** este archivo actualizado si algo cambió (§17 y §19).
7. ✅ **Decisión registrada:** `Aprobado` / `Aprobado con cambios` / `Rechazado`, con fecha, revisor y notas.

**Definition of Done de una funcionalidad:** cumple sus criterios de aceptación, tiene tests, funciona en la web en todos los viewports, respeta el diseño, no rompe el aislamiento, quedó documentada y fue aprobada en su 🔍.

### 13.2 Secuencia

| Hito | Contenido | Revisiones 🔍 | Estado |
|---|---|---|---|
| **H0** | M00 Fundaciones | HR-00 ([guía](./reviews/HR-00.md)) | ✅ Aprobado (2026-10-10, fundador) |
| **H1** | M01 Plataforma y tenants | HR-01 ([guía](./reviews/HR-01.md)) | 🔍 En revisión (2026-10-10) |
| **H2** | M02 Padrón | HR-02 ([guía](./reviews/HR-02.md)) | 🔍 En revisión (2026-10-11) |
| **H3** | M03 Reglamento de accesos | HR-03 | ⏳ |
| **H4** | M04 Accesos — residente + página del invitado | HR-04a, HR-04b, HR-04c | ⏳ |
| **H5** | M05 Consola de garita (con M10-F01/F02 básicos para las solicitudes) | HR-05a … HR-05e | ⏳ |
| **H6** | M06 Contingencia / offline (web degradada) | HR-06 | ⏳ |
| **H7** | M07 Comunicación | HR-07a, HR-07b, HR-07c | ⏳ |
| **H8** | M08 Amenities | HR-08 | ⏳ |
| **H9** | M09 Expensas lite y transparencia | HR-09a, HR-09b | ⏳ |
| **H10** | M10 Notificaciones (completo) + M11 Panel y métricas | HR-10, HR-11 | ⏳ |
| **H11** | M12 App nativa (Expo) | HR-12 | ⏳ |
| **H12** | M13 Robustez operativa `[MVP-Cierre]` | HR-13 | ⏳ |
| **H13** | Preparación del piloto: revisión legal, carga del barrio piloto, capacitación, simulacros | HR-LEGAL, **HR-FINAL** | ⏳ |

**HR-FINAL — Aprobación del MVP para piloto:**

- Todos los hitos anteriores aprobados.
- Prueba de restauración de backup realizada.
- Simulacros de garita (HR-05e) y de corte (HR-06) repetidos sobre la versión final.
- Protocolo manual impreso en la garita.
- Revisión legal cerrada.
- Métricas de línea base del barrio piloto relevadas (§14).

### 13.3 Dependencias clave

- M04 y M05 se desarrollan en paralelo, pero HR-04c y HR-05c se revisan juntos.
- M08-F05 depende de M09-F04 (cuenta corriente): se puede construir el cargo con una vista mínima y completarlo en H9.
- M08-F06 depende de M04-F07 (eventos).
- M12 reutiliza todo `packages/domain`; cualquier lógica nueva en la web DEBE ir al paquete de dominio y no quedar en componentes.

---

## 14. Métricas de éxito del piloto

Umbrales orientativos, que se acuerdan con el barrio sobre una línea base relevada en las 2 primeras semanas:

| Métrica | Objetivo orientativo |
|---|---|
| Viviendas que usan la autorización previa en el período | ≥ 60 % |
| Llamadas por cada 100 ingresos (casos elegibles) | −50 % vs. la línea base |
| Tiempo de atención p95 de visitas pre-autorizadas | −30 %, sin empeorar la espera global |
| Ingresos registrados en el sistema por turno | ≥ 95 % |
| Ingresos indebidos atribuibles al sistema | 0 (cualquier incidente pausa el flujo afectado y se investiga) |
| Simulacros (corte, QR repetido, revocación) | 100 % completados |
| Soporte después del onboarding | ≈ 4 h por barrio por mes |
| Reservas de amenities hechas por la app | ≥ 70 % de las reservas totales |
| Comunicados con confirmación de lectura | ≥ 60 % de lectura en 72 h |

**Plan del piloto (8–10 semanas):**

1. Relevamiento de la línea base (semanas 1–2).
2. Limpieza del padrón, protocolos y capacitación de todos los turnos (semana 3).
3. Operación con un grupo limitado de viviendas y el procedimiento anterior como respaldo (semanas 4–5).
4. Ampliación y medición (semanas 6–8).
5. Decisión de continuidad (semanas 9–10).

---

## 15. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| La guardia no adopta la consola (prisa, baja familiaridad tecnológica) | Alto | Diseño 📟 con pocos toques, simulacros (HR-05e), capacitación por turno (M13-F10), procedimiento de respaldo siempre disponible. |
| Los residentes no pre-autorizan y la garita sigue llamando | Alto | Onboarding guiado, plantillas de autorizaciones recurrentes, métricas por unidad, comunicación del barrio. |
| Conectividad deficiente en la garita | Alto | M06 offline, router con conexión alternativa (4G), UPS; indicador de estado visible. |
| Un QR compartido o reutilizado | Medio | Token opaco, usos limitados, vencimiento, atado a DNI opcional, consumo transaccional, control visual cuando el reglamento lo exige (S2). |
| Doble uso offline de un pase de un solo uso con varias garitas | Medio | Piloto con una garita; con varias, validación online o autoridad local (Fase 2). |
| Las push no llegan (iOS/PWA) | Medio | Estado durable + timeout + respaldo telefónico (P2, S4); app nativa en H11. |
| Fuga de datos entre tenants | Crítico | RLS + tests de aislamiento en CI + revisión en cada 🔍 (S1). |
| Incumplimiento de la Ley 25.326 / transferencia internacional | Alto | HR-LEGAL antes de datos reales; minimización y retención (§12). |
| Expensas lite que no coinciden con la liquidación oficial | Medio | Importación desde el sistema oficial como única fuente, con origen visible; sin edición de saldos (P7). |
| Alcance del MVP demasiado grande para el equipo | Alto | Hitos con revisión, orden estricto (accesos primero), `[MVP-Cierre]` al final, recorte permitido en cada 🔍. |
| Costos de infraestructura o de soporte superiores al ingreso | Alto | Seguimiento de costo por tenant en M01; definición comercial pendiente (§3). |

---

## 16. Fuera de alcance del MVP (Fase 2+)

- Liquidación automática de expensas por coeficiente, intereses y fondo de reserva.
- Pagos online (Mercado Pago, débito) y conciliación bancaria automática.
- Facturación electrónica (ARCA).
- Lectura de patentes (LPR), integración con barreras, molinetes o cámaras, apertura con QR.
- Biometría / reconocimiento facial.
- Múltiples garitas con unicidad offline garantizada (autoridad local).
- WhatsApp Business API (envío automático de pases y avisos).
- Encuestas y votaciones; repositorio de documentos (reglamento, actas).
- Marketplace / clasificados entre vecinos; objetos perdidos.
- Rol de comisión/consejo; supervisor de seguridad multibarrio con panel propio.
- Edificios / consorcios verticales (lógica de accesos distinta).
- Multi-idioma y multi-país (monedas y normativa).
- IA para decisiones de ingreso (no planificado: riesgo sin beneficio probado).

---

## 17. Registro de decisiones y preguntas abiertas

### 17.1 Decisiones tomadas

| # | Fecha | Decisión | Motivo |
|---|---|---|---|
| D1 | 2026-10-09 | **Backend: Supabase** (Postgres + RLS, Auth, Realtime, Storage, Edge Functions, pg_cron) | Velocidad para el MVP, Realtime nativo para las aprobaciones, Postgres estándar (migrable). |
| D2 | 2026-10-09 | **Web total + mobile first**: todo es realizable por la web; las apps nativas (Expo) se suman en H11 para 📱/📟 | Requisito del fundador; reduce la dependencia de las tiendas en la validación. |
| D3 | 2026-10-09 | **Alcance del MVP = propuesta original** (accesos, amenities, expensas lite, comunicación) **+ aportes de Codex al final** (`[MVP-Cierre]`, M13) | Decisión del fundador. |
| D4 | 2026-10-09 | Los **principios de seguridad** de la revisión externa (P1–P3, S1–S9) aplican desde el inicio | Son restricciones de diseño, no funcionalidades diferibles. |
| D5 | 2026-10-09 | **Pase de evento con aprobación del anfitrión** (o lista previa) en lugar de un link abierto | Resuelve las reuniones sociales sin que un link reenviado dé acceso. |
| D6 | 2026-10-09 | **Lista negra → "Restricciones de acceso"** con motivo, responsable y vigencia, por barrio | Proporcionalidad y privacidad. |
| D7 | 2026-10-09 | **Expensas lite como espejo transparente** del sistema contable externo (importación), sin edición de saldos | Evita una doble fuente de verdad. |
| D8 | 2026-10-09 | **Comunicación vecino ↔ guardia estructurada** (catálogo de avisos + emergencia), sin chat libre | No distraer la garita (P6). |
| D9 | 2026-10-09 | **Sistema de diseño** basado en `DESIGN.md`, con la Parte A de adaptación para Domus (estados semánticos, modo garita, escala de UI, tipografía Inter) | La referencia original es de marketing; una app operativa necesita más. |
| D10 | 2026-10-09 | **Estrategia comercial abierta** (precio, quién paga, canales) | Decisión del fundador: se define más adelante. |
| D11 | 2026-10-09 | **Código en inglés** (identificadores, objetos de base, comentarios, commits); la interfaz en es-AR vía i18n. Traducciones de dominio en [`GLOSSARY.md`](./GLOSSARY.md) | Decisión del fundador. Estándar de la industria; el glosario evita traducciones divergentes entre agentes. |
| D12 | 2026-10-09 | **Nomenclatura de base estilo GeneXus en snake_case**: tablas en singular, atributos prefijados por su tabla (`unit_name`), FK con el mismo nombre que la PK referenciada (`unit_id`), subtipos por rol (`movement_guard_person_id`). Reglas en `AGENTS.md` | Decisión del fundador: permite ver las relaciones a simple vista. Se usa snake_case para evitar las comillas obligatorias de PascalCase en Postgres. |
| D13 | 2026-10-09 | **Node 25** como runtime de desarrollo | Decisión del fundador. Riesgo a vigilar: compatibilidad de Expo en H11. |
| D14 | 2026-10-09 | **Supabase local (Docker) para desarrollo; proyecto en la nube `Domus` como `staging`**. Solo el orquestador aplica migraciones a `staging` | Agentes en paralelo sin pisarse; `staging` refleja solo código integrado. |
| D15 | 2026-10-09 | **Sin Sentry por ahora**: reporte de errores detrás de un módulo propio con adaptadores | El fundador no tiene cuenta; se conecta un proveedor más adelante sin tocar el código de negocio. |
| D17 | 2026-10-09 | **Nuevo permiso `gestion_administradores`** (`admin_management`); sin auto-modificación de permisos; solo se otorga lo que uno tiene | La revisión de seguridad T6 detectó que `padron` permitía auto-escalar a todos los permisos; §6.3 no definía quién otorga permisos. |
| D18 | 2026-10-10 | **M01-F04 = impersonación completa**: el super-admin (con MFA) actúa como un usuario concreto, con motivo y duración obligatorios, banner visible, cada escritura auditada con el impersonador como actor real, y la sesión visible para el admin del barrio | Decisión del fundador: soporte real sobre lo que ve y hace el usuario. |
| D19 | 2026-10-10 | **Staging diferido**: H1 se revisa en local; Vercel + Supabase staging se arman en un hito posterior | Decisión del fundador. |
| D20 | 2026-10-10 | **M01-F03 (unidades facturables) se completa en H2**: en H1 se guardan los criterios por tenant; el conteo se construye con la tabla `unit` de M02 | Dependencia de datos: las unidades llegan en M02. |
| D21 | 2026-10-10 | **H2 se desarrolla en paralelo a la revisión HR-01** | Pedido del fundador (ausente); los cambios que surjan de HR-01 se aplican después sobre H2. |
| D22 | 2026-10-10 | **Ingreso con código de unidad requiere aprobación** del titular o del admin (no da acceso automático); la invitación por email/link sigue siendo el camino principal | Un código compartido o filtrado no debe dar acceso al hogar. *Propuesta del orquestador, a validar en HR-02.* |
| D23 | 2026-10-10 | **Permisos que el titular delega a los miembros del hogar:** ver finanzas de la unidad, reservar amenities, gestionar autorizaciones y pases (por defecto: solo autorizaciones y pases) | §6.2/§6.4 piden finanzas y reservas configurables por el titular. *Propuesta del orquestador, a validar en HR-02.* |
| D24 | 2026-10-10 | **Proyección mínima del padrón para la guardia** se adelanta a M02 (cierra L4): la guardia ve unidad, nombres y, solo para la operación, contactos de respaldo; nunca DNI completo, fecha de nacimiento ni datos de otros barrios | Bloqueante del piloto detectado en la revisión T6; M02 es donde nace el padrón. |
| D16 | 2026-10-09 | **Desarrollo orquestado**: el fundador y Claude (orquestador) diseñan y revisan; el desarrollo se delega a agentes Codex/Claude vía Orca, en worktrees por tarea | Paralelismo y control de costo por tarea. |

### 17.2 Preguntas abiertas

| # | Pregunta | Bloquea |
|---|---|---|
| Q1 | Modelo de precios definitivo (USD 1/vivienda vs. piso por barrio + setup) | Contratos del piloto (H13) |
| Q2 | Barrio(s) piloto concreto(s) en Tucumán | HR-03 (validación del reglamento), H13 |
| Q3 | Región de Supabase (São Paulo con cláusulas contractuales vs. alternativa) y asesoría legal | HR-LEGAL / datos reales |
| Q4 | Tablet de referencia para la garita (modelo, quién la provee) | HR-05b, HR-12 |
| Q5 | ¿App de guardia en el mismo binario que la del residente o separada? | HR-12 |
| Q6 | Formato del sistema contable de la administradora del piloto (para la importación de M09) | HR-09a |
| Q7 | Nombre comercial y dominio definitivos ("Domus" es de trabajo) | Branding, tiendas (H11) |

---

## 18. Referencias

| Documento | Ubicación |
|---|---|
| Sistema de diseño | [`KnowledgeBase/DESIGN.md`](./DESIGN.md) — la Parte A (adaptación Domus) es normativa; la Parte B es la referencia visual base. |
| Glosario español → código | [`KnowledgeBase/GLOSSARY.md`](./GLOSSARY.md) |
| Reglas para agentes | [`AGENTS.md`](../AGENTS.md) (raíz del repo) |
| Competencia | Links en §4. |
| Ley 25.326 | https://www.argentina.gob.ar/normativa/nacional/ley-25326-64790/texto |
| AAIP — Transferencias internacionales | https://www.argentina.gob.ar/transferencias-internacionales |
| Supabase — RLS | https://supabase.com/docs/guides/database/postgres/row-level-security |
| Supabase — Realtime Authorization | https://supabase.com/docs/guides/realtime/authorization |
| Supabase — Backups | https://supabase.com/docs/guides/platform/backups |
| Expo — Push notifications | https://docs.expo.dev/push-notifications/what-you-need-to-know/ |

**Origen de este documento:** sesión de diseño del 2026-10-04/09 (análisis de la propuesta inicial, investigación de la competencia y revisión crítica independiente con Codex).

---

## 19. Historial de cambios

| Versión | Fecha | Autor | Cambios |
|---|---|---|---|
| 1.0 | 2026-10-09 | Fundador + Claude | Versión inicial: alcance del MVP, arquitectura, modelo de dominio, módulos M00–M13, hitos de revisión humana. |
| 1.3 | 2026-10-10 | Fundador + Claude | HR-00 aprobado. D18–D20: impersonación completa, staging diferido, M01-F03 en H2. |
| 1.2 | 2026-10-09 | Fundador + Claude | D17: permiso `gestion_administradores` y reglas de otorgamiento de permisos (§6.3). |
| 1.1 | 2026-10-09 | Fundador + Claude | Decisiones D11–D16: código en inglés + glosario, nomenclatura GeneXus en snake_case, Node 25, Supabase local + staging en la nube (us-west-2), Sentry diferido, desarrollo orquestado. |
