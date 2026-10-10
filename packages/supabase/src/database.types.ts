export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_event: {
        Row: {
          audit_event_action: Database['public']['Enums']['audit_event_action'];
          audit_event_actor_person_id: string | null;
          audit_event_actor_user_id: string | null;
          audit_event_db_role: string;
          audit_event_diff: NonNullable<Json>;
          audit_event_id: string;
          audit_event_occurred_at: string;
          audit_event_on_behalf_of_user_id: string | null;
          audit_event_request_device: string | null;
          audit_event_request_ip: string | null;
          audit_event_row_id: string;
          audit_event_table_name: string;
          support_session_id: string | null;
          tenant_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          audit_event_action: Database['public']['Enums']['audit_event_action'];
          audit_event_actor_person_id?: string | null;
          audit_event_actor_user_id?: string | null;
          audit_event_db_role: string;
          audit_event_diff: NonNullable<Json>;
          audit_event_id?: string;
          audit_event_occurred_at?: string;
          audit_event_on_behalf_of_user_id?: string | null;
          audit_event_request_device?: string | null;
          audit_event_request_ip?: string | null;
          audit_event_row_id: string;
          audit_event_table_name: string;
          support_session_id?: string | null;
          tenant_id?: string | null;
        };
        Update: {
          audit_event_action?: Database['public']['Enums']['audit_event_action'];
          audit_event_actor_person_id?: string | null;
          audit_event_actor_user_id?: string | null;
          audit_event_db_role?: string;
          audit_event_diff?: NonNullable<Json>;
          audit_event_id?: string;
          audit_event_occurred_at?: string;
          audit_event_on_behalf_of_user_id?: string | null;
          audit_event_request_device?: string | null;
          audit_event_request_ip?: string | null;
          audit_event_row_id?: string;
          audit_event_table_name?: string;
          support_session_id?: string | null;
          tenant_id?: string | null;
        };
        Relationships: [];
      };
      device: {
        Row: {
          device_created_at: string;
          device_credential_hash: string;
          device_id: string;
          device_last_sync_at: string | null;
          device_name: string;
          device_paired_by_user_id: string;
          device_status: Database['public']['Enums']['device_status'];
          device_updated_at: string;
          gate_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          device_created_at?: string;
          device_credential_hash: string;
          device_id?: string;
          device_last_sync_at?: string | null;
          device_name: string;
          device_paired_by_user_id: string;
          device_status?: Database['public']['Enums']['device_status'];
          device_updated_at?: string;
          gate_id: string;
          tenant_id: string;
        };
        Update: {
          device_created_at?: string;
          device_credential_hash?: string;
          device_id?: string;
          device_last_sync_at?: string | null;
          device_name?: string;
          device_paired_by_user_id?: string;
          device_status?: Database['public']['Enums']['device_status'];
          device_updated_at?: string;
          gate_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'device_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'device_tenant_id_gate_id_fkey';
            columns: ['tenant_id', 'gate_id'];
            isOneToOne: false;
            referencedRelation: 'gate';
            referencedColumns: ['tenant_id', 'gate_id'];
          },
        ];
      };
      device_pairing: {
        Row: {
          client_event_id: string;
          device_id: string | null;
          device_pairing_code_hash: string;
          device_pairing_created_at: string;
          device_pairing_created_by_user_id: string;
          device_pairing_expires_at: string;
          device_pairing_id: string;
          device_pairing_redeemed_at: string | null;
          device_pairing_updated_at: string;
          gate_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          client_event_id: string;
          device_id?: string | null;
          device_pairing_code_hash: string;
          device_pairing_created_at?: string;
          device_pairing_created_by_user_id: string;
          device_pairing_expires_at: string;
          device_pairing_id?: string;
          device_pairing_redeemed_at?: string | null;
          device_pairing_updated_at?: string;
          gate_id: string;
          tenant_id: string;
        };
        Update: {
          client_event_id?: string;
          device_id?: string | null;
          device_pairing_code_hash?: string;
          device_pairing_created_at?: string;
          device_pairing_created_by_user_id?: string;
          device_pairing_expires_at?: string;
          device_pairing_id?: string;
          device_pairing_redeemed_at?: string | null;
          device_pairing_updated_at?: string;
          gate_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'device_pairing_tenant_id_device_id_fkey';
            columns: ['tenant_id', 'device_id'];
            isOneToOne: false;
            referencedRelation: 'device';
            referencedColumns: ['tenant_id', 'device_id'];
          },
          {
            foreignKeyName: 'device_pairing_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'device_pairing_tenant_id_gate_id_fkey';
            columns: ['tenant_id', 'gate_id'];
            isOneToOne: false;
            referencedRelation: 'gate';
            referencedColumns: ['tenant_id', 'gate_id'];
          },
        ];
      };
      gate: {
        Row: {
          gate_created_at: string;
          gate_id: string;
          gate_is_active: boolean;
          gate_kind: Database['public']['Enums']['gate_kind'];
          gate_name: string;
          gate_updated_at: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          gate_created_at?: string;
          gate_id?: string;
          gate_is_active?: boolean;
          gate_kind: Database['public']['Enums']['gate_kind'];
          gate_name: string;
          gate_updated_at?: string;
          tenant_id: string;
        };
        Update: {
          gate_created_at?: string;
          gate_id?: string;
          gate_is_active?: boolean;
          gate_kind?: Database['public']['Enums']['gate_kind'];
          gate_name?: string;
          gate_updated_at?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'gate_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
        ];
      };
      gate_guard: {
        Row: {
          gate_guard_created_at: string;
          gate_guard_id: string;
          gate_guard_updated_at: string;
          gate_id: string;
          membership_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          gate_guard_created_at?: string;
          gate_guard_id?: string;
          gate_guard_updated_at?: string;
          gate_id: string;
          membership_id: string;
          tenant_id: string;
        };
        Update: {
          gate_guard_created_at?: string;
          gate_guard_id?: string;
          gate_guard_updated_at?: string;
          gate_id?: string;
          membership_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'gate_guard_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'gate_guard_tenant_id_gate_id_fkey';
            columns: ['tenant_id', 'gate_id'];
            isOneToOne: false;
            referencedRelation: 'gate';
            referencedColumns: ['tenant_id', 'gate_id'];
          },
          {
            foreignKeyName: 'gate_guard_tenant_id_membership_id_fkey';
            columns: ['tenant_id', 'membership_id'];
            isOneToOne: false;
            referencedRelation: 'membership';
            referencedColumns: ['tenant_id', 'membership_id'];
          },
        ];
      };
      invitation: {
        Row: {
          client_event_id: string;
          invitation_accepted_at: string | null;
          invitation_accepted_by_user_id: string | null;
          invitation_admin_permissions: Database['public']['Enums']['admin_permission'][];
          invitation_created_at: string;
          invitation_created_by_user_id: string;
          invitation_delivered_at: string | null;
          invitation_email: string;
          invitation_expires_at: string;
          invitation_first_name: string | null;
          invitation_id: string;
          invitation_last_name: string | null;
          invitation_membership_role: Database['public']['Enums']['membership_role'];
          invitation_status: Database['public']['Enums']['invitation_status'];
          invitation_token_hash: string;
          invitation_updated_at: string;
          person_id: string | null;
          tenant_id: string;
          unit_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          client_event_id: string;
          invitation_accepted_at?: string | null;
          invitation_accepted_by_user_id?: string | null;
          invitation_admin_permissions?: Database['public']['Enums']['admin_permission'][];
          invitation_created_at?: string;
          invitation_created_by_user_id: string;
          invitation_delivered_at?: string | null;
          invitation_email: string;
          invitation_expires_at: string;
          invitation_first_name?: string | null;
          invitation_id?: string;
          invitation_last_name?: string | null;
          invitation_membership_role: Database['public']['Enums']['membership_role'];
          invitation_status?: Database['public']['Enums']['invitation_status'];
          invitation_token_hash: string;
          invitation_updated_at?: string;
          person_id?: string | null;
          tenant_id: string;
          unit_id?: string | null;
        };
        Update: {
          client_event_id?: string;
          invitation_accepted_at?: string | null;
          invitation_accepted_by_user_id?: string | null;
          invitation_admin_permissions?: Database['public']['Enums']['admin_permission'][];
          invitation_created_at?: string;
          invitation_created_by_user_id?: string;
          invitation_delivered_at?: string | null;
          invitation_email?: string;
          invitation_expires_at?: string;
          invitation_first_name?: string | null;
          invitation_id?: string;
          invitation_last_name?: string | null;
          invitation_membership_role?: Database['public']['Enums']['membership_role'];
          invitation_status?: Database['public']['Enums']['invitation_status'];
          invitation_token_hash?: string;
          invitation_updated_at?: string;
          person_id?: string | null;
          tenant_id?: string;
          unit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'invitation_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'invitation_tenant_id_person_id_fkey';
            columns: ['tenant_id', 'person_id'];
            isOneToOne: false;
            referencedRelation: 'person';
            referencedColumns: ['tenant_id', 'person_id'];
          },
          {
            foreignKeyName: 'invitation_tenant_id_unit_id_fkey';
            columns: ['tenant_id', 'unit_id'];
            isOneToOne: false;
            referencedRelation: 'unit';
            referencedColumns: ['tenant_id', 'unit_id'];
          },
        ];
      };
      membership: {
        Row: {
          membership_created_at: string;
          membership_id: string;
          membership_role: Database['public']['Enums']['membership_role'];
          membership_status: Database['public']['Enums']['membership_status'];
          membership_updated_at: string;
          membership_valid_from: string;
          membership_valid_to: string | null;
          person_id: string;
          tenant_id: string;
          unit_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          membership_created_at?: string;
          membership_id?: string;
          membership_role: Database['public']['Enums']['membership_role'];
          membership_status?: Database['public']['Enums']['membership_status'];
          membership_updated_at?: string;
          membership_valid_from?: string;
          membership_valid_to?: string | null;
          person_id: string;
          tenant_id: string;
          unit_id?: string | null;
        };
        Update: {
          membership_created_at?: string;
          membership_id?: string;
          membership_role?: Database['public']['Enums']['membership_role'];
          membership_status?: Database['public']['Enums']['membership_status'];
          membership_updated_at?: string;
          membership_valid_from?: string;
          membership_valid_to?: string | null;
          person_id?: string;
          tenant_id?: string;
          unit_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'membership_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'membership_tenant_id_person_id_fkey';
            columns: ['tenant_id', 'person_id'];
            isOneToOne: false;
            referencedRelation: 'person';
            referencedColumns: ['tenant_id', 'person_id'];
          },
          {
            foreignKeyName: 'membership_tenant_id_unit_id_fkey';
            columns: ['tenant_id', 'unit_id'];
            isOneToOne: false;
            referencedRelation: 'unit';
            referencedColumns: ['tenant_id', 'unit_id'];
          },
        ];
      };
      membership_household_permission: {
        Row: {
          membership_household_permission_created_at: string;
          membership_household_permission_id: string;
          membership_household_permission_permission: Database['public']['Enums']['household_permission'];
          membership_household_permission_updated_at: string;
          membership_id: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          membership_household_permission_created_at?: string;
          membership_household_permission_id?: string;
          membership_household_permission_permission: Database['public']['Enums']['household_permission'];
          membership_household_permission_updated_at?: string;
          membership_id: string;
          tenant_id: string;
        };
        Update: {
          membership_household_permission_created_at?: string;
          membership_household_permission_id?: string;
          membership_household_permission_permission?: Database['public']['Enums']['household_permission'];
          membership_household_permission_updated_at?: string;
          membership_id?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'membership_household_permission_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'membership_household_permission_tenant_id_membership_id_fkey';
            columns: ['tenant_id', 'membership_id'];
            isOneToOne: false;
            referencedRelation: 'membership';
            referencedColumns: ['tenant_id', 'membership_id'];
          },
        ];
      };
      membership_permission: {
        Row: {
          membership_id: string;
          membership_permission_admin_permission: Database['public']['Enums']['admin_permission'];
          membership_permission_created_at: string;
          membership_permission_id: string;
          membership_permission_updated_at: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          membership_id: string;
          membership_permission_admin_permission: Database['public']['Enums']['admin_permission'];
          membership_permission_created_at?: string;
          membership_permission_id?: string;
          membership_permission_updated_at?: string;
          tenant_id: string;
        };
        Update: {
          membership_id?: string;
          membership_permission_admin_permission?: Database['public']['Enums']['admin_permission'];
          membership_permission_created_at?: string;
          membership_permission_id?: string;
          membership_permission_updated_at?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'membership_permission_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'membership_permission_tenant_id_membership_id_fkey';
            columns: ['tenant_id', 'membership_id'];
            isOneToOne: false;
            referencedRelation: 'membership';
            referencedColumns: ['tenant_id', 'membership_id'];
          },
        ];
      };
      person: {
        Row: {
          person_birth_date: string | null;
          person_created_at: string;
          person_document_number: string | null;
          person_document_type:
            Database['public']['Enums']['person_document_type'] | null;
          person_email: string | null;
          person_first_name: string;
          person_id: string;
          person_last_name: string;
          person_phone: string | null;
          person_updated_at: string;
          tenant_id: string;
          user_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          person_birth_date?: string | null;
          person_created_at?: string;
          person_document_number?: string | null;
          person_document_type?:
            Database['public']['Enums']['person_document_type'] | null;
          person_email?: string | null;
          person_first_name: string;
          person_id?: string;
          person_last_name: string;
          person_phone?: string | null;
          person_updated_at?: string;
          tenant_id: string;
          user_id?: string | null;
        };
        Update: {
          person_birth_date?: string | null;
          person_created_at?: string;
          person_document_number?: string | null;
          person_document_type?:
            Database['public']['Enums']['person_document_type'] | null;
          person_email?: string | null;
          person_first_name?: string;
          person_id?: string;
          person_last_name?: string;
          person_phone?: string | null;
          person_updated_at?: string;
          tenant_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'person_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
        ];
      };
      pet: {
        Row: {
          pet_archived_at: string | null;
          pet_breed_name: string | null;
          pet_created_at: string;
          pet_id: string;
          pet_name: string;
          pet_photo_path: string | null;
          pet_species_name: string;
          pet_updated_at: string;
          tenant_id: string;
          unit_id: string;
        };
        ComputedFields: never;
        Insert: {
          pet_archived_at?: string | null;
          pet_breed_name?: string | null;
          pet_created_at?: string;
          pet_id?: string;
          pet_name: string;
          pet_photo_path?: string | null;
          pet_species_name: string;
          pet_updated_at?: string;
          tenant_id: string;
          unit_id: string;
        };
        Update: {
          pet_archived_at?: string | null;
          pet_breed_name?: string | null;
          pet_created_at?: string;
          pet_id?: string;
          pet_name?: string;
          pet_photo_path?: string | null;
          pet_species_name?: string;
          pet_updated_at?: string;
          tenant_id?: string;
          unit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'pet_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'pet_tenant_id_unit_id_fkey';
            columns: ['tenant_id', 'unit_id'];
            isOneToOne: false;
            referencedRelation: 'unit';
            referencedColumns: ['tenant_id', 'unit_id'];
          },
        ];
      };
      platform_admin: {
        Row: {
          platform_admin_created_at: string;
          platform_admin_id: string;
          platform_admin_is_active: boolean;
          platform_admin_updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          platform_admin_created_at?: string;
          platform_admin_id?: string;
          platform_admin_is_active?: boolean;
          platform_admin_updated_at?: string;
          user_id: string;
        };
        Update: {
          platform_admin_created_at?: string;
          platform_admin_id?: string;
          platform_admin_is_active?: boolean;
          platform_admin_updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      registry_import: {
        Row: {
          client_event_id: string;
          registry_import_created_at: string;
          registry_import_created_by_user_id: string;
          registry_import_error_count: number;
          registry_import_id: string;
          registry_import_resident_count: number;
          registry_import_row_count: number;
          registry_import_status: Database['public']['Enums']['registry_import_status'];
          registry_import_unit_count: number;
          registry_import_updated_at: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          client_event_id: string;
          registry_import_created_at?: string;
          registry_import_created_by_user_id: string;
          registry_import_error_count: number;
          registry_import_id?: string;
          registry_import_resident_count?: number;
          registry_import_row_count: number;
          registry_import_status?: Database['public']['Enums']['registry_import_status'];
          registry_import_unit_count?: number;
          registry_import_updated_at?: string;
          tenant_id: string;
        };
        Update: {
          client_event_id?: string;
          registry_import_created_at?: string;
          registry_import_created_by_user_id?: string;
          registry_import_error_count?: number;
          registry_import_id?: string;
          registry_import_resident_count?: number;
          registry_import_row_count?: number;
          registry_import_status?: Database['public']['Enums']['registry_import_status'];
          registry_import_unit_count?: number;
          registry_import_updated_at?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'registry_import_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
        ];
      };
      registry_import_row: {
        Row: {
          registry_import_id: string;
          registry_import_row_created_at: string;
          registry_import_row_data: NonNullable<Json>;
          registry_import_row_errors: NonNullable<Json>;
          registry_import_row_id: string;
          registry_import_row_number: number;
          registry_import_row_updated_at: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          registry_import_id: string;
          registry_import_row_created_at?: string;
          registry_import_row_data: NonNullable<Json>;
          registry_import_row_errors: NonNullable<Json>;
          registry_import_row_id?: string;
          registry_import_row_number: number;
          registry_import_row_updated_at?: string;
          tenant_id: string;
        };
        Update: {
          registry_import_id?: string;
          registry_import_row_created_at?: string;
          registry_import_row_data?: NonNullable<Json>;
          registry_import_row_errors?: NonNullable<Json>;
          registry_import_row_id?: string;
          registry_import_row_number?: number;
          registry_import_row_updated_at?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'registry_import_row_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'registry_import_row_tenant_id_registry_import_id_fkey';
            columns: ['tenant_id', 'registry_import_id'];
            isOneToOne: false;
            referencedRelation: 'registry_import';
            referencedColumns: ['tenant_id', 'registry_import_id'];
          },
        ];
      };
      support_session: {
        Row: {
          client_event_id: string;
          support_session_actor_user_id: string;
          support_session_created_at: string;
          support_session_duration_minutes_count: number;
          support_session_ended_at: string | null;
          support_session_ended_by_user_id: string | null;
          support_session_expires_at: string;
          support_session_id: string;
          support_session_reason: string;
          support_session_revocation_reason: string | null;
          support_session_started_at: string;
          support_session_status: Database['public']['Enums']['support_session_status'];
          support_session_target_user_id: string;
          support_session_updated_at: string;
          tenant_id: string;
        };
        ComputedFields: never;
        Insert: {
          client_event_id: string;
          support_session_actor_user_id: string;
          support_session_created_at?: string;
          support_session_duration_minutes_count?: number;
          support_session_ended_at?: string | null;
          support_session_ended_by_user_id?: string | null;
          support_session_expires_at: string;
          support_session_id?: string;
          support_session_reason: string;
          support_session_revocation_reason?: string | null;
          support_session_started_at?: string;
          support_session_status?: Database['public']['Enums']['support_session_status'];
          support_session_target_user_id: string;
          support_session_updated_at?: string;
          tenant_id: string;
        };
        Update: {
          client_event_id?: string;
          support_session_actor_user_id?: string;
          support_session_created_at?: string;
          support_session_duration_minutes_count?: number;
          support_session_ended_at?: string | null;
          support_session_ended_by_user_id?: string | null;
          support_session_expires_at?: string;
          support_session_id?: string;
          support_session_reason?: string;
          support_session_revocation_reason?: string | null;
          support_session_started_at?: string;
          support_session_status?: Database['public']['Enums']['support_session_status'];
          support_session_target_user_id?: string;
          support_session_updated_at?: string;
          tenant_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'support_session_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'support_session_tenant_id_target_user_id_fkey';
            columns: ['tenant_id', 'support_session_target_user_id'];
            isOneToOne: false;
            referencedRelation: 'person';
            referencedColumns: ['tenant_id', 'user_id'];
          },
        ];
      };
      tenant: {
        Row: {
          client_event_id: string;
          tenant_address: string | null;
          tenant_billable_unit_statuses: Database['public']['Enums']['unit_status'][];
          tenant_created_at: string;
          tenant_id: string;
          tenant_logo_path: string | null;
          tenant_name: string;
          tenant_settings: NonNullable<Json>;
          tenant_slug: string;
          tenant_subscription_status: Database['public']['Enums']['tenant_subscription_status'];
          tenant_time_zone: string;
          tenant_updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          client_event_id?: string;
          tenant_address?: string | null;
          tenant_billable_unit_statuses?: Database['public']['Enums']['unit_status'][];
          tenant_created_at?: string;
          tenant_id?: string;
          tenant_logo_path?: string | null;
          tenant_name: string;
          tenant_settings?: NonNullable<Json>;
          tenant_slug: string;
          tenant_subscription_status?: Database['public']['Enums']['tenant_subscription_status'];
          tenant_time_zone?: string;
          tenant_updated_at?: string;
        };
        Update: {
          client_event_id?: string;
          tenant_address?: string | null;
          tenant_billable_unit_statuses?: Database['public']['Enums']['unit_status'][];
          tenant_created_at?: string;
          tenant_id?: string;
          tenant_logo_path?: string | null;
          tenant_name?: string;
          tenant_settings?: NonNullable<Json>;
          tenant_slug?: string;
          tenant_subscription_status?: Database['public']['Enums']['tenant_subscription_status'];
          tenant_time_zone?: string;
          tenant_updated_at?: string;
        };
        Relationships: [];
      };
      unit: {
        Row: {
          tenant_id: string;
          unit_archived_at: string | null;
          unit_backup_phone: string | null;
          unit_block_code: string | null;
          unit_code: string;
          unit_coefficient: number;
          unit_contact_phone: string | null;
          unit_created_at: string;
          unit_id: string;
          unit_is_billable: boolean | null;
          unit_lot_number: string | null;
          unit_status: Database['public']['Enums']['unit_status'];
          unit_updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          tenant_id: string;
          unit_archived_at?: string | null;
          unit_backup_phone?: string | null;
          unit_block_code?: string | null;
          unit_code: string;
          unit_coefficient?: number;
          unit_contact_phone?: string | null;
          unit_created_at?: string;
          unit_id?: string;
          unit_is_billable?: boolean | null;
          unit_lot_number?: string | null;
          unit_status?: Database['public']['Enums']['unit_status'];
          unit_updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          unit_archived_at?: string | null;
          unit_backup_phone?: string | null;
          unit_block_code?: string | null;
          unit_code?: string;
          unit_coefficient?: number;
          unit_contact_phone?: string | null;
          unit_created_at?: string;
          unit_id?: string;
          unit_is_billable?: boolean | null;
          unit_lot_number?: string | null;
          unit_status?: Database['public']['Enums']['unit_status'];
          unit_updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'unit_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
        ];
      };
      unit_join_code: {
        Row: {
          tenant_id: string;
          unit_id: string;
          unit_join_code_created_at: string;
          unit_join_code_hash: string;
          unit_join_code_id: string;
          unit_join_code_rotated_by_user_id: string;
          unit_join_code_updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          tenant_id: string;
          unit_id: string;
          unit_join_code_created_at?: string;
          unit_join_code_hash: string;
          unit_join_code_id?: string;
          unit_join_code_rotated_by_user_id: string;
          unit_join_code_updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          unit_id?: string;
          unit_join_code_created_at?: string;
          unit_join_code_hash?: string;
          unit_join_code_id?: string;
          unit_join_code_rotated_by_user_id?: string;
          unit_join_code_updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'unit_join_code_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'unit_join_code_tenant_id_unit_id_fkey';
            columns: ['tenant_id', 'unit_id'];
            isOneToOne: true;
            referencedRelation: 'unit';
            referencedColumns: ['tenant_id', 'unit_id'];
          },
        ];
      };
      unit_join_request: {
        Row: {
          client_event_id: string;
          invitation_id: string | null;
          tenant_id: string;
          unit_id: string;
          unit_join_request_birth_date: string | null;
          unit_join_request_created_at: string;
          unit_join_request_decided_at: string | null;
          unit_join_request_decided_by_user_id: string | null;
          unit_join_request_document_number: string | null;
          unit_join_request_document_type:
            Database['public']['Enums']['person_document_type'] | null;
          unit_join_request_email: string;
          unit_join_request_first_name: string;
          unit_join_request_id: string;
          unit_join_request_last_name: string;
          unit_join_request_status: Database['public']['Enums']['unit_join_request_status'];
          unit_join_request_updated_at: string;
          unit_join_request_user_id: string;
        };
        ComputedFields: never;
        Insert: {
          client_event_id: string;
          invitation_id?: string | null;
          tenant_id: string;
          unit_id: string;
          unit_join_request_birth_date?: string | null;
          unit_join_request_created_at?: string;
          unit_join_request_decided_at?: string | null;
          unit_join_request_decided_by_user_id?: string | null;
          unit_join_request_document_number?: string | null;
          unit_join_request_document_type?:
            Database['public']['Enums']['person_document_type'] | null;
          unit_join_request_email: string;
          unit_join_request_first_name: string;
          unit_join_request_id?: string;
          unit_join_request_last_name: string;
          unit_join_request_status?: Database['public']['Enums']['unit_join_request_status'];
          unit_join_request_updated_at?: string;
          unit_join_request_user_id: string;
        };
        Update: {
          client_event_id?: string;
          invitation_id?: string | null;
          tenant_id?: string;
          unit_id?: string;
          unit_join_request_birth_date?: string | null;
          unit_join_request_created_at?: string;
          unit_join_request_decided_at?: string | null;
          unit_join_request_decided_by_user_id?: string | null;
          unit_join_request_document_number?: string | null;
          unit_join_request_document_type?:
            Database['public']['Enums']['person_document_type'] | null;
          unit_join_request_email?: string;
          unit_join_request_first_name?: string;
          unit_join_request_id?: string;
          unit_join_request_last_name?: string;
          unit_join_request_status?: Database['public']['Enums']['unit_join_request_status'];
          unit_join_request_updated_at?: string;
          unit_join_request_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'unit_join_request_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'unit_join_request_tenant_id_invitation_id_fkey';
            columns: ['tenant_id', 'invitation_id'];
            isOneToOne: false;
            referencedRelation: 'invitation';
            referencedColumns: ['tenant_id', 'invitation_id'];
          },
          {
            foreignKeyName: 'unit_join_request_tenant_id_unit_id_fkey';
            columns: ['tenant_id', 'unit_id'];
            isOneToOne: false;
            referencedRelation: 'unit';
            referencedColumns: ['tenant_id', 'unit_id'];
          },
        ];
      };
      unit_resident: {
        Row: {
          person_id: string;
          tenant_id: string;
          unit_id: string;
          unit_resident_created_at: string;
          unit_resident_id: string;
          unit_resident_is_holder: boolean;
          unit_resident_is_minor: boolean;
          unit_resident_relationship: Database['public']['Enums']['unit_resident_relationship'];
          unit_resident_updated_at: string;
          unit_resident_valid_from_at: string;
          unit_resident_valid_to_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          person_id: string;
          tenant_id: string;
          unit_id: string;
          unit_resident_created_at?: string;
          unit_resident_id?: string;
          unit_resident_is_holder?: boolean;
          unit_resident_is_minor?: boolean;
          unit_resident_relationship?: Database['public']['Enums']['unit_resident_relationship'];
          unit_resident_updated_at?: string;
          unit_resident_valid_from_at?: string;
          unit_resident_valid_to_at?: string | null;
        };
        Update: {
          person_id?: string;
          tenant_id?: string;
          unit_id?: string;
          unit_resident_created_at?: string;
          unit_resident_id?: string;
          unit_resident_is_holder?: boolean;
          unit_resident_is_minor?: boolean;
          unit_resident_relationship?: Database['public']['Enums']['unit_resident_relationship'];
          unit_resident_updated_at?: string;
          unit_resident_valid_from_at?: string;
          unit_resident_valid_to_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'unit_resident_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'unit_resident_tenant_id_person_id_fkey';
            columns: ['tenant_id', 'person_id'];
            isOneToOne: false;
            referencedRelation: 'person';
            referencedColumns: ['tenant_id', 'person_id'];
          },
          {
            foreignKeyName: 'unit_resident_tenant_id_unit_id_fkey';
            columns: ['tenant_id', 'unit_id'];
            isOneToOne: false;
            referencedRelation: 'unit';
            referencedColumns: ['tenant_id', 'unit_id'];
          },
        ];
      };
      vehicle: {
        Row: {
          tenant_id: string;
          unit_id: string;
          vehicle_archived_at: string | null;
          vehicle_color_name: string | null;
          vehicle_created_at: string;
          vehicle_id: string;
          vehicle_make_name: string | null;
          vehicle_model_name: string | null;
          vehicle_plate_code: string;
          vehicle_updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          tenant_id: string;
          unit_id: string;
          vehicle_archived_at?: string | null;
          vehicle_color_name?: string | null;
          vehicle_created_at?: string;
          vehicle_id?: string;
          vehicle_make_name?: string | null;
          vehicle_model_name?: string | null;
          vehicle_plate_code: string;
          vehicle_updated_at?: string;
        };
        Update: {
          tenant_id?: string;
          unit_id?: string;
          vehicle_archived_at?: string | null;
          vehicle_color_name?: string | null;
          vehicle_created_at?: string;
          vehicle_id?: string;
          vehicle_make_name?: string | null;
          vehicle_model_name?: string | null;
          vehicle_plate_code?: string;
          vehicle_updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vehicle_tenant_id_fkey';
            columns: ['tenant_id'];
            isOneToOne: false;
            referencedRelation: 'tenant';
            referencedColumns: ['tenant_id'];
          },
          {
            foreignKeyName: 'vehicle_tenant_id_unit_id_fkey';
            columns: ['tenant_id', 'unit_id'];
            isOneToOne: false;
            referencedRelation: 'unit';
            referencedColumns: ['tenant_id', 'unit_id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { token: string }; Returns: string };
      archive_unit: {
        Args: {
          client_event_id: string;
          target_tenant_id: string;
          target_unit_id: string;
        };
        Returns: undefined;
      };
      assign_guard_gate: {
        Args: {
          assigned: boolean;
          client_event_id: string;
          target_gate_id: string;
          target_membership_id: string;
          target_tenant_id: string;
        };
        Returns: undefined;
      };
      billable_unit_count: {
        Args: { target_tenant_id: string };
        Returns: number;
      };
      confirm_registry_import: {
        Args: {
          client_event_id: string;
          target_import_id: string;
          target_tenant_id: string;
        };
        Returns: Json;
      };
      create_device_pairing: {
        Args: {
          client_event_id: string;
          target_gate_id: string;
          target_tenant_id: string;
        };
        Returns: {
          device_pairing_id: string;
          expires_at: string;
          pairing_code: string;
        }[];
      };
      create_invitation: {
        Args: {
          admin_permissions?: Database['public']['Enums']['admin_permission'][];
          client_event_id: string;
          first_name?: string;
          invited_email: string;
          last_name?: string;
          target_person_id?: string;
          target_role: Database['public']['Enums']['membership_role'];
          target_tenant_id: string;
        };
        Returns: {
          invitation_id: string;
          invitation_token: string;
        }[];
      };
      create_membership: {
        Args: {
          target_person_id: string;
          target_role: Database['public']['Enums']['membership_role'];
          valid_from?: string;
          valid_to?: string;
        };
        Returns: string;
      };
      create_platform_admin: {
        Args: { target_user_id: string };
        Returns: string;
      };
      create_registry_import: {
        Args: { client_event_id: string; rows: Json; target_tenant_id: string };
        Returns: string;
      };
      create_resident_invitation: {
        Args: {
          client_event_id: string;
          invited_email: string;
          target_person_id: string;
          target_role: Database['public']['Enums']['membership_role'];
          target_tenant_id: string;
          target_unit_id: string;
        };
        Returns: {
          invitation_id: string;
          invitation_token: string;
        }[];
      };
      create_tenant: {
        Args: {
          client_event_id?: string;
          tenant_address?: string;
          tenant_logo_path?: string;
          tenant_name: string;
          tenant_slug: string;
          tenant_subscription_status?: Database['public']['Enums']['tenant_subscription_status'];
          tenant_time_zone?: string;
        };
        Returns: string;
      };
      current_household_permissions: {
        Args: { target_tenant_id: string; target_unit_id: string };
        Returns: Database['public']['Enums']['household_permission'][];
      };
      current_user_cancelled_tenants: {
        Args: Record<PropertyKey, never>;
        Returns: {
          tenant_id: string;
          tenant_name: string;
        }[];
      };
      current_user_is_platform_admin: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      decide_unit_join_request: {
        Args: {
          approve: boolean;
          client_event_id: string;
          target_request_id: string;
          target_role?: Database['public']['Enums']['membership_role'];
          target_tenant_id: string;
          target_unit_id: string;
        };
        Returns: Json;
      };
      delete_membership: {
        Args: { target_membership_id: string };
        Returns: undefined;
      };
      delete_platform_admin: {
        Args: { target_platform_admin_id: string };
        Returns: undefined;
      };
      end_support_session: {
        Args: { target_support_session_id: string };
        Returns: undefined;
      };
      grant_admin_permission: {
        Args: {
          target_membership_id: string;
          target_permission: Database['public']['Enums']['admin_permission'];
        };
        Returns: undefined;
      };
      guard_backup_contact: {
        Args: {
          operation_code: string;
          target_tenant_id: string;
          target_unit_id: string;
        };
        Returns: string;
      };
      guard_registry: {
        Args: { search?: string; target_tenant_id: string };
        Returns: {
          person_id: string;
          resident_display_name: string;
          unit_code: string;
          unit_id: string;
          unit_resident_is_holder: boolean;
          unit_resident_is_minor: boolean;
        }[];
      };
      list_support_targets: {
        Args: { search?: string; target_tenant_id: string };
        Returns: {
          membership_role: Database['public']['Enums']['membership_role'];
          person_first_name: string;
          person_last_name: string;
          user_id: string;
        }[];
      };
      mark_invitation_delivered: {
        Args: { target_invitation_id: string };
        Returns: undefined;
      };
      mark_resident_invitation_delivered: {
        Args: {
          target_invitation_id: string;
          target_tenant_id: string;
          target_unit_id: string;
        };
        Returns: undefined;
      };
      preview_invitation: {
        Args: { token: string };
        Returns: {
          invitation_membership_role: Database['public']['Enums']['membership_role'];
          tenant_name: string;
        }[];
      };
      preview_registry_import: {
        Args: { target_import_id: string; target_tenant_id: string };
        Returns: Json;
      };
      redeem_device_pairing: {
        Args: {
          device_name: string;
          pairing_code: string;
          target_tenant_id: string;
        };
        Returns: Json;
      };
      revoke_admin_permission: {
        Args: {
          target_membership_id: string;
          target_permission: Database['public']['Enums']['admin_permission'];
        };
        Returns: undefined;
      };
      revoke_device: {
        Args: {
          client_event_id: string;
          target_device_id: string;
          target_tenant_id: string;
        };
        Returns: undefined;
      };
      revoke_invitation: {
        Args: { target_invitation_id: string };
        Returns: undefined;
      };
      revoke_membership: {
        Args: { target_membership_id: string };
        Returns: undefined;
      };
      revoke_resident_invitation: {
        Args: {
          target_invitation_id: string;
          target_tenant_id: string;
          target_unit_id: string;
        };
        Returns: undefined;
      };
      revoke_support_session: {
        Args: { reason: string; target_support_session_id: string };
        Returns: undefined;
      };
      rotate_unit_join_code: {
        Args: { target_tenant_id: string; target_unit_id: string };
        Returns: string;
      };
      save_gate: {
        Args: {
          client_event_id: string;
          gate_data: Json;
          target_tenant_id: string;
        };
        Returns: string;
      };
      save_pet: {
        Args: {
          client_event_id: string;
          pet_data: Json;
          target_tenant_id: string;
          target_unit_id: string;
        };
        Returns: string;
      };
      save_resident: {
        Args: {
          client_event_id: string;
          person_data: Json;
          resident_data: Json;
          target_tenant_id: string;
          target_unit_id: string;
        };
        Returns: string;
      };
      save_unit: {
        Args: {
          client_event_id: string;
          residents?: Json;
          target_tenant_id: string;
          unit_data: Json;
        };
        Returns: string;
      };
      save_vehicle: {
        Args: {
          client_event_id: string;
          target_tenant_id: string;
          target_unit_id: string;
          vehicle_data: Json;
        };
        Returns: string;
      };
      search_registry: {
        Args: {
          result_limit?: number;
          search: string;
          target_tenant_id: string;
        };
        Returns: {
          display_name: string;
          email: string;
          entity_id: string;
          entity_kind: string;
          plate_code: string;
          unit_code: string;
          unit_id: string;
        }[];
      };
      set_household_permissions: {
        Args: {
          client_event_id: string;
          permissions: Database['public']['Enums']['household_permission'][];
          target_membership_id: string;
          target_tenant_id: string;
          target_unit_id: string;
        };
        Returns: undefined;
      };
      start_support_session: {
        Args: {
          client_event_id: string;
          duration_minutes?: number;
          reason: string;
          target_tenant_id: string;
          target_user_id: string;
        };
        Returns: {
          client_event_id: string;
          support_session_actor_user_id: string;
          support_session_created_at: string;
          support_session_duration_minutes_count: number;
          support_session_ended_at: string | null;
          support_session_ended_by_user_id: string | null;
          support_session_expires_at: string;
          support_session_id: string;
          support_session_reason: string;
          support_session_revocation_reason: string | null;
          support_session_started_at: string;
          support_session_status: Database['public']['Enums']['support_session_status'];
          support_session_target_user_id: string;
          support_session_updated_at: string;
          tenant_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'support_session';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      submit_unit_join_request: {
        Args: {
          client_event_id: string;
          join_code: string;
          person_data: Json;
          target_tenant_id: string;
        };
        Returns: Json;
      };
      sync_device: {
        Args: {
          device_token: string;
          target_device_id: string;
          target_tenant_id: string;
        };
        Returns: Json;
      };
      unit_sheet: {
        Args: { target_tenant_id: string; target_unit_id: string };
        Returns: Json;
      };
      update_membership: {
        Args: {
          target_membership_id: string;
          target_role: Database['public']['Enums']['membership_role'];
          target_status: Database['public']['Enums']['membership_status'];
          valid_from: string;
          valid_to?: string;
        };
        Returns: undefined;
      };
      update_platform_admin: {
        Args: { is_active: boolean; target_platform_admin_id: string };
        Returns: undefined;
      };
      update_tenant_platform_settings: {
        Args: {
          new_slug: string;
          new_subscription_status: Database['public']['Enums']['tenant_subscription_status'];
          target_tenant_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      admin_permission:
        | 'registry'
        | 'access_config'
        | 'access_audit'
        | 'communication'
        | 'complaints'
        | 'amenities'
        | 'finance'
        | 'guards'
        | 'tenant_settings'
        | 'admin_management';
      audit_event_action: 'insert' | 'update' | 'delete';
      device_status: 'active' | 'revoked';
      gate_kind: 'vehicular' | 'pedestrian';
      household_permission:
        'view_unit_finance' | 'book_amenities' | 'manage_access_authorizations';
      invitation_status: 'pending' | 'accepted' | 'revoked' | 'expired';
      membership_role:
        'tenant_admin' | 'guard' | 'unit_holder' | 'household_member';
      membership_status: 'active' | 'suspended' | 'revoked';
      person_document_type: 'dni' | 'passport' | 'other';
      registry_import_status: 'preview' | 'confirmed';
      support_session_status: 'active' | 'ended' | 'revoked' | 'expired';
      tenant_subscription_status:
        'pilot' | 'active' | 'suspended' | 'cancelled';
      unit_join_request_status: 'pending' | 'approved' | 'rejected';
      unit_resident_relationship: 'owner' | 'tenant' | 'family' | 'other';
      unit_status: 'occupied' | 'under_construction' | 'vacant';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      admin_permission: [
        'registry',
        'access_config',
        'access_audit',
        'communication',
        'complaints',
        'amenities',
        'finance',
        'guards',
        'tenant_settings',
        'admin_management',
      ],
      audit_event_action: ['insert', 'update', 'delete'],
      device_status: ['active', 'revoked'],
      gate_kind: ['vehicular', 'pedestrian'],
      household_permission: [
        'view_unit_finance',
        'book_amenities',
        'manage_access_authorizations',
      ],
      invitation_status: ['pending', 'accepted', 'revoked', 'expired'],
      membership_role: [
        'tenant_admin',
        'guard',
        'unit_holder',
        'household_member',
      ],
      membership_status: ['active', 'suspended', 'revoked'],
      person_document_type: ['dni', 'passport', 'other'],
      registry_import_status: ['preview', 'confirmed'],
      support_session_status: ['active', 'ended', 'revoked', 'expired'],
      tenant_subscription_status: ['pilot', 'active', 'suspended', 'cancelled'],
      unit_join_request_status: ['pending', 'approved', 'rejected'],
      unit_resident_relationship: ['owner', 'tenant', 'family', 'other'],
      unit_status: ['occupied', 'under_construction', 'vacant'],
    },
  },
} as const;
