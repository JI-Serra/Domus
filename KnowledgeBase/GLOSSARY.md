# Domus — Glossary (spec term → code name)

The spec (`InitialProposal.md`) is written in Spanish; **all code is written in English**. This table is the single
source of truth for translating domain concepts. If a concept is missing, add it here in the same PR that introduces it.
Table names follow the naming rules in `AGENTS.md` (singular, snake_case, GeneXus-style attributes).

## Entities → tables

| Spec (es) | Table / code name | Notes |
|---|---|---|
| Barrio / Tenant | `tenant` | |
| Usuario | `auth.users` (Supabase) | Referenced as `user_id`. |
| Super-admin de plataforma | `platform_admin` | Global, not a tenant membership; requires MFA. |
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
| Membership status (`membership_status`) | activa / suspendida / revocada | `active` / `suspended` / `revoked` |
| Admin permissions | `padron`, `accesos_config`, `accesos_auditoria`, `comunicacion`, `reclamos`, `amenities`, `finanzas`, `guardias`, `configuracion_tenant`, `gestion_administradores` | `registry`, `access_config`, `access_audit`, `communication`, `complaints`, `amenities`, `finance`, `guards`, `tenant_settings`, `admin_management` |
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
| Audit event action (`audit_event_action`) | insertar / actualizar / eliminar | `insert` / `update` / `delete` |
| Person document type (`person_document_type`) | DNI / pasaporte / otro | `dni` / `passport` / `other` |

## Reusable PostgreSQL domains

| Spec (es) | Domain / code name | Notes |
|---|---|---|
| Número de documento | `document_number` | Text, 1–32 characters; no document image or PDF417 payload. |
| Teléfono | `phone_number` | Text, 1–32 characters; formatting is handled by shared presentation rules. |

## M01 platform lifecycle additions

| Spec (es) | Table / attribute / code name | Notes |
|---|---|---|
| Invitación | `invitation` | Generic, tenant-scoped consent; only SHA256 token hashes persist. |
| Estado de invitación | `invitation_status`: `pending`, `accepted`, `revoked`, `expired` | Pendiente / aceptada / revocada / vencida. Expiry is enforced even before materializing `expired`. |
| Sesión de soporte / impersonación | `support_session` | MFA platform actor, concrete target user, reason and maximum 60-minute duration. |
| Estado de sesión de soporte | `support_session_status`: `active`, `ended`, `revoked`, `expired` | Activa / finalizada / revocada / vencida. |
| Duración solicitada de soporte (minutos) | `support_session_duration_minutes_count` | Default 30, maximum 60. |
| Actor de soporte | `support_session_actor_user_id` | The actual platform administrator. |
| Usuario representado | `support_session_target_user_id`, `audit_event_on_behalf_of_user_id` | Target whose tenant privileges apply. |
| Criterios de unidades facturables | `tenant_billable_unit_statuses` (`unit_status[]`) | Nonempty set of `occupied`, `under_construction`, `vacant`; counting arrives in M02 (D20). |
| Logo de barrio | Private Storage bucket `tenant-logo` | Object paths begin with the tenant UUID. |
| Identificador de reintento | `client_event_id` | Unique idempotency key for onboarding, invitation creation and support start. |
| Permisos a otorgar al aceptar | `invitation_admin_permissions` (`admin_permission[]`) | D17 validated at creation and acceptance; first platform-invited admin receives all ten. |
| Entrega de invitación registrada | `invitation_delivered_at` | Set by `mark_invitation_delivered` after the email went out; a retry with the same `client_event_id` then never mails again. |
| Motivo de revocación de soporte | `support_session_revocation_reason` | Required when a platform administrator revokes a live support session (`revoke_support_session`); redacted in audit. |

## M02 registry additions

| Spec (es) | Table / attribute / code name | Notes |
|---|---|---|
| Relación del habitante | `unit_resident_relationship`: `owner`, `tenant`, `family`, `other` | Propietario / inquilino / familiar / otro. |
| Permiso delegado al miembro | `membership_household_permission`; `household_permission`: `view_unit_finance`, `book_amenities`, `manage_access_authorizations` | D23; default only access authorizations. |
| Código de unidad | `unit_join_code` | D22; 12 unambiguous base32 characters, hash only, rotatable. |
| Solicitud de incorporación | `unit_join_request`; `unit_join_request_status`: `pending`, `approved`, `rejected`, `cancelled` | Applicant cancellation is final; approval issues email consent; no automatic membership. |
| Asignación de guardia a puesto | `gate_guard` | Guard membership ↔ gate, scoped by tenant. |
| Tipo de puesto | `gate_kind`: `vehicular`, `pedestrian` | Vehicular / peatonal. |
| Estado de dispositivo | `device_status`: `active`, `revoked` | Device identity is independent of operator identity. |
| Vinculación de dispositivo | `device_pairing` | 10-minute, single-use pairing code; SHA256 only. |
| Importación del padrón | `registry_import`; `registry_import_status`: `preview`, `confirmed` | Atomic staged import; row/error/unit/resident counts. |
| Fila de importación | `registry_import_row` | Canonical JSON data, row number and field/code validation errors. |
| Comprobante de reintento | Private `registry_operation` | Actor/tenant/operation-bound client_event_id; input digest and safe result. |
| Contador de intentos | Private `registry_attempt` | Global per-user and failed tenant-code counters; no raw code or PII. |
| Email en el padrón | `person_email` | Tenant-scoped natural import key; separate from Auth email. |
| Facturable por excepción | Nullable `unit_is_billable` | NULL inherits `tenant_billable_unit_statuses`; archive always excludes. |
| Baja lógica | `unit_archived_at`, `vehicle_archived_at`, `pet_archived_at` | Preserves history; units cannot be hard deleted. |
| Contactos de unidad | `unit_contact_phone`, `unit_backup_phone` | Backup exposed to guard only through audited fallback action. |
| Foto de mascota | `pet_photo_path`, private bucket `pet-photo` | `<tenant UUID>/<unit UUID>/<filename>`; never public. |
| Consulta operativa de contacto | `registry_contact_lookup` audit event | `operation_code=approval_phone_fallback`; phone omitted from audit. |
| Vigencia del habitante | `unit_resident_valid_from_at`, `unit_resident_valid_to_at` | UTC timestamps; end is exclusive. Occupied units have continuous adult holder coverage. |
