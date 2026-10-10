# Domus — Glossary (spec term → code name)

The spec (`InitialProposal.md`) is written in Spanish; **all code is written in English**. This table is the single
source of truth for translating domain concepts. If a concept is missing, add it here in the same PR that introduces it.
Table names follow the naming rules in `AGENTS.md` (singular, snake_case, GeneXus-style attributes).

## Entities → tables

| Spec (es) | Table / code name | Notes |
|---|---|---|
| Barrio / Tenant | `tenant` | |
| Usuario | `auth.users` (Supabase) | Referenced as `user_id`. |
| Persona | `person` | Human known to a tenant, with or without a user. |
| Membresía | `membership` | person ↔ tenant ↔ role (↔ unit). |
| Permiso granular de admin | `membership_permission` | Values in "Admin permissions" below. |
| Dispositivo | `device` | Registered gate tablet/phone. |
| Puesto / Garita | `gate` | Physical access point. |
| Unidad (lote/casa) | `unit` | |
| Habitante | `unit_resident` | person ↔ unit link (relationship, holder, minor). |
| Vehículo | `vehicle` | |
| Mascota | `pet` | |
| Reglamento de accesos | `access_policy` | One row per tenant + visitor type. |
| Preferencia de unidad | `unit_access_preference` | |
| Contacto de respaldo | `unit_backup_contact` | Ordered. |
| No molestar / De viaje | `unit_do_not_disturb` | |
| Autorización | `access_authorization` | `authorization` is a reserved SQL word — never use it alone. |
| Franja horaria | `access_authorization_time_slot` | |
| Pase (QR) | `access_pass` | |
| Evento | `event` | |
| Invitado de evento | `event_guest` | |
| Pre-aviso de delivery | `delivery_notice` | |
| Solicitud de aprobación | `approval_request` | |
| Movimiento (ingreso/egreso) | `movement` | |
| Restricción de acceso | `access_restriction` | Never "blacklist". |
| Trabajador / Proveedor | `worker` | |
| Documento de trabajador | `worker_document` | |
| Novedad (libro de guardia) | `guard_log_entry` | |
| Paquete | `parcel` | Avoid "package" (clashes with npm packages). |
| Comunicado | `announcement` | |
| Lectura de comunicado | `announcement_read` | |
| Reclamo | `complaint` | |
| Comentario de reclamo | `complaint_comment` | |
| Aviso a guardia | `guard_notice` | |
| Alerta de emergencia | `emergency_alert` | |
| Amenity | `amenity` | |
| Regla de amenity | `amenity_rule` | |
| Bloqueo de amenity | `amenity_block` | |
| Reserva | `reservation` | |
| Período | `billing_period` | |
| Cargo | `charge` | |
| Pago | `payment` | |
| Cuenta corriente | `unit_account` | Derived view, not a table. |
| Categoría de gasto | `expense_category` | |
| Gasto | `expense` | |
| Presupuesto | `budget` | |
| Liquidación publicada | `published_statement` | |
| Notificación | `notification` | |
| Suscripción push | `push_subscription` | |
| Preferencias de notificación | `notification_preference` | |
| Evento de auditoría | `audit_event` | Append-only. |

## Enumerations

| Concept | Spec values (es) | Code values |
|---|---|---|
| Role (`membership_role`) | super-admin / administrador / guardia / titular / miembro | `platform_admin` (not a tenant membership) / `tenant_admin` / `guard` / `unit_holder` / `household_member` |
| Admin permissions | `padron`, `accesos_config`, `accesos_auditoria`, `comunicacion`, `reclamos`, `amenities`, `finanzas`, `guardias`, `configuracion_tenant` | `registry`, `access_config`, `access_audit`, `communication`, `complaints`, `amenities`, `finance`, `guards`, `tenant_settings` |
| Tenant subscription status | piloto / activo / suspendido / baja | `pilot` / `active` / `suspended` / `cancelled` |
| Unit status | ocupada / en obra / vacía | `occupied` / `under_construction` / `vacant` |
| Visitor type | `autorizado_permanente`, `autorizado_recurrente`, `invitado_con_pase`, `invitado_evento`, `delivery`, `servicio_trabajador`, `desconocido` | `permanent_authorized`, `recurring_authorized`, `pass_guest`, `event_guest`, `delivery`, `service_worker`, `unknown` |
| Household access mode | `ingreso_directo` / `aviso` / `aprobacion` / `rechazar` | `direct_entry` / `notify` / `approval` / `reject` |
| Authorization kind | permanente / recurrente / puntual | `permanent` / `recurring` / `one_time` |
| Pass kind | individual / evento | `individual` / `event` |
| Pass status | activo / agotado / vencido / revocado | `active` / `exhausted` / `expired` / `revoked` |
| Event registration mode | `lista_previa` / `auto_registro_con_aprobacion` | `pre_list` / `self_registration_with_approval` |
| Approval request status | creada, notificada, aprobada, rechazada, vencida, respaldo_llamada, aprobada_por_llamada, rechazada_por_llamada, sin_contacto, cancelada | `created`, `notified`, `approved`, `rejected`, `expired`, `phone_fallback`, `approved_by_phone`, `rejected_by_phone`, `no_contact`, `cancelled` |
| Access decision (semáforo) | verde / amarillo / rojo | `green` / `yellow` / `red` |
| Movement direction | ingreso / egreso | `entry` / `exit` |
| Movement origin | autorización / pase / solicitud / excepción | `authorization` / `pass` / `approval_request` / `exception` |
| Complaint status | abierto, en_curso, resuelto, cerrado, reabierto | `open`, `in_progress`, `resolved`, `closed`, `reopened` |
| Reservation status | pendiente_aprobacion, confirmada, completada, cancelada, no_show | `pending_approval`, `confirmed`, `completed`, `cancelled`, `no_show` |
| Payment status | informado / conciliado / rechazado | `reported` / `reconciled` / `rejected` |
| Billing period status | abierto / publicado / cerrado | `open` / `published` / `closed` |
| Charge concept | expensa / extraordinaria / amenity / multa / ajuste | `regular_fee` / `extraordinary_fee` / `amenity` / `fine` / `adjustment` |
| Parcel status | recibido / notificado / entregado | `received` / `notified` / `delivered` |
| Guard notice status | enviado / visto / atendido | `sent` / `seen` / `handled` |
| Emergency alert status | activa / atendida / cerrada | `active` / `handled` / `closed` |
