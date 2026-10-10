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
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { token: string }; Returns: string };
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
      preview_invitation: {
        Args: { token: string };
        Returns: {
          invitation_membership_role: Database['public']['Enums']['membership_role'];
          tenant_name: string;
        }[];
      };
      revoke_admin_permission: {
        Args: {
          target_membership_id: string;
          target_permission: Database['public']['Enums']['admin_permission'];
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
      revoke_support_session: {
        Args: { reason: string; target_support_session_id: string };
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
      invitation_status: 'pending' | 'accepted' | 'revoked' | 'expired';
      membership_role:
        'tenant_admin' | 'guard' | 'unit_holder' | 'household_member';
      membership_status: 'active' | 'suspended' | 'revoked';
      person_document_type: 'dni' | 'passport' | 'other';
      support_session_status: 'active' | 'ended' | 'revoked' | 'expired';
      tenant_subscription_status:
        'pilot' | 'active' | 'suspended' | 'cancelled';
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
      invitation_status: ['pending', 'accepted', 'revoked', 'expired'],
      membership_role: [
        'tenant_admin',
        'guard',
        'unit_holder',
        'household_member',
      ],
      membership_status: ['active', 'suspended', 'revoked'],
      person_document_type: ['dni', 'passport', 'other'],
      support_session_status: ['active', 'ended', 'revoked', 'expired'],
      tenant_subscription_status: ['pilot', 'active', 'suspended', 'cancelled'],
      unit_status: ['occupied', 'under_construction', 'vacant'],
    },
  },
} as const;
