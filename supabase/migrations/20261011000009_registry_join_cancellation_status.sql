-- M02-F04: commit the new enum value before functions use it.
alter type public.unit_join_request_status add value 'cancelled';
