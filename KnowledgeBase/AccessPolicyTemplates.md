# Plantillas de reglamento de accesos (M03-F05) — propuesta inicial

> **Propuesta del orquestador (2026-10-11), a validar en HR-03** con un caso real de un barrio de Tucumán. La fuente
> de verdad en código es `packages/domain/src/access-policy/templates.ts`; este documento la explica.

**Reglas duras (todas las plantillas, no configurables):**
- `unknown` (desconocido) solo admite `approval` o `reject` (P2/P3: nunca ingreso directo ni solo aviso).
- El timeout de aprobación va de 30 a 300 s.
- Topes absolutos de los límites: autorización permanente 1–3650 días; pase 1–100 usos y 1–365 días; evento 1–1000 invitados.
- Ningún modo por defecto queda fuera de los modos permitidos.

Modos: `direct_entry` (ingreso directo) · `notify` (aviso) · `approval` (aprobación) · `reject` (rechazar).
DNI = verificación de identidad obligatoria (M03-F03).

## Equilibrado (se aplica al crear un barrio)

| Tipo de visitante | Modos permitidos | Por defecto | DNI |
|---|---|---|:-:|
| `permanent_authorized` | direct_entry, notify, approval | direct_entry | — |
| `recurring_authorized` (dentro de la franja; fuera → approval) | direct_entry, notify, approval | direct_entry | ✅ |
| `pass_guest` | direct_entry, notify | notify | ✅ |
| `event_guest` | direct_entry, notify | direct_entry | ✅ |
| `delivery` | notify, approval, reject | approval | — |
| `service_worker` | direct_entry, notify, approval | notify | ✅ |
| `unknown` | approval, reject | approval | ✅ |

Timeout: **90 s**. Límites: autorización permanente hasta **365 días**; pase hasta **10 usos** y **7 días**; evento hasta **100 invitados**.

## Estricto

| Tipo | Modos permitidos | Por defecto | DNI |
|---|---|---|:-:|
| `permanent_authorized` | notify, approval | notify | ✅ |
| `recurring_authorized` | notify, approval | notify | ✅ |
| `pass_guest` | notify, approval | notify | ✅ |
| `event_guest` | notify, approval | notify | ✅ |
| `delivery` | approval, reject | approval | ✅ |
| `service_worker` | notify, approval | approval | ✅ |
| `unknown` | approval, reject | approval | ✅ |

Timeout: **120 s**. Límites: permanente **180 días**; pase **3 usos** y **1 día**; evento **50 invitados**.

## Flexible

| Tipo | Modos permitidos | Por defecto | DNI |
|---|---|---|:-:|
| `permanent_authorized` | direct_entry, notify, approval | direct_entry | — |
| `recurring_authorized` | direct_entry, notify, approval | direct_entry | — |
| `pass_guest` | direct_entry, notify | direct_entry | — |
| `event_guest` | direct_entry, notify | direct_entry | — |
| `delivery` | direct_entry, notify, approval, reject | notify | — |
| `service_worker` | direct_entry, notify, approval | direct_entry | ✅ |
| `unknown` | approval, reject | approval | ✅ |

Timeout: **60 s**. Límites: permanente **730 días**; pase **20 usos** y **30 días**; evento **300 invitados**.
