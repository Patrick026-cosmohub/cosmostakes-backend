export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          game_id: string | null
          id: string
          is_active: boolean
          pinned: boolean
          push_enabled: boolean
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          game_id?: string | null
          id?: string
          is_active?: boolean
          pinned?: boolean
          push_enabled?: boolean
          starts_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          game_id?: string | null
          id?: string
          is_active?: boolean
          pinned?: boolean
          push_enabled?: boolean
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          new_value: Json | null
          prev_value: Json | null
          staff_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          prev_value?: Json | null
          staff_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          prev_value?: Json | null
          staff_id?: string | null
        }
        Relationships: []
      }
      bonus_claims: {
        Row: {
          amount: number
          bonus_id: string
          claimed_at: string
          id: string
          player_id: string
        }
        Insert: {
          amount: number
          bonus_id: string
          claimed_at?: string
          id?: string
          player_id: string
        }
        Update: {
          amount?: number
          bonus_id?: string
          claimed_at?: string
          id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonus_claims_bonus_id_fkey"
            columns: ["bonus_id"]
            isOneToOne: false
            referencedRelation: "bonuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonus_claims_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      bonuses: {
        Row: {
          created_at: string
          description: string | null
          expires_at: string | null
          game_id: string | null
          id: string
          is_active: boolean
          max_bonus: number
          min_deposit: number
          name: string
          percentage: number
          starts_at: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          expires_at?: string | null
          game_id?: string | null
          id?: string
          is_active?: boolean
          max_bonus?: number
          min_deposit?: number
          name: string
          percentage?: number
          starts_at?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          expires_at?: string | null
          game_id?: string | null
          id?: string
          is_active?: boolean
          max_bonus?: number
          min_deposit?: number
          name?: string
          percentage?: number
          starts_at?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonuses_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      cashout_requests: {
        Row: {
          amount: number
          created_at: string
          destination: string | null
          id: string
          notes: string | null
          payment_method_id: string | null
          player_id: string
          processed_at: string | null
          processed_by: string | null
          requested_at: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          destination?: string | null
          id?: string
          notes?: string | null
          payment_method_id?: string | null
          player_id: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          destination?: string | null
          id?: string
          notes?: string | null
          payment_method_id?: string | null
          player_id?: string
          processed_at?: string | null
          processed_by?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashout_requests_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashout_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_requests: {
        Row: {
          amount: number
          created_at: string
          id: string
          notes: string | null
          payment_method_id: string | null
          player_id: string
          processed_at: string | null
          processed_by: string | null
          reference: string | null
          requested_at: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_method_id?: string | null
          player_id: string
          processed_at?: string | null
          processed_by?: string | null
          reference?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          payment_method_id?: string | null
          player_id?: string
          processed_at?: string | null
          processed_by?: string | null
          reference?: string | null
          requested_at?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_requests_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_requests_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          card_style: Json
          created_at: string
          description: string | null
          display_title: string | null
          featured: boolean
          id: string
          is_active: boolean
          logo_url: string | null
          maintenance_mode: boolean
          name: string
          provider: string
          sort_order: number
          sync_frequency_seconds: number
          thumbnail_url: string | null
        }
        Insert: {
          card_style?: Json
          created_at?: string
          description?: string | null
          display_title?: string | null
          featured?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          maintenance_mode?: boolean
          name: string
          provider: string
          sort_order?: number
          sync_frequency_seconds?: number
          thumbnail_url?: string | null
        }
        Update: {
          card_style?: Json
          created_at?: string
          description?: string | null
          display_title?: string | null
          featured?: boolean
          id?: string
          is_active?: boolean
          logo_url?: string | null
          maintenance_mode?: boolean
          name?: string
          provider?: string
          sort_order?: number
          sync_frequency_seconds?: number
          thumbnail_url?: string | null
        }
        Relationships: []
      }
      general_settings: {
        Row: {
          company_logo_url: string | null
          created_at: string
          currency: string
          date_format: string
          id: boolean
          platform_name: string
          support_email: string | null
          support_phone: string | null
          time_format: string
          timezone: string
          updated_at: string
        }
        Insert: {
          company_logo_url?: string | null
          created_at?: string
          currency?: string
          date_format?: string
          id?: boolean
          platform_name?: string
          support_email?: string | null
          support_phone?: string | null
          time_format?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          company_logo_url?: string | null
          created_at?: string
          currency?: string
          date_format?: string
          id?: boolean
          platform_name?: string
          support_email?: string | null
          support_phone?: string | null
          time_format?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      juwa_debug_log: {
        Row: {
          created_at: string
          endpoint: string | null
          error_message: string | null
          id: string
          juwa_code: number | null
          juwa_msg: string | null
          platform: string | null
          response_body: string | null
          response_status: number | null
          sent_fields: Json | null
        }
        Insert: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          juwa_code?: number | null
          juwa_msg?: string | null
          platform?: string | null
          response_body?: string | null
          response_status?: number | null
          sent_fields?: Json | null
        }
        Update: {
          created_at?: string
          endpoint?: string | null
          error_message?: string | null
          id?: string
          juwa_code?: number | null
          juwa_msg?: string | null
          platform?: string | null
          response_body?: string | null
          response_status?: number | null
          sent_fields?: Json | null
        }
        Relationships: []
      }
      music_settings: {
        Row: {
          autoplay: boolean
          default_volume: number
          enabled: boolean
          id: number
          updated_at: string
        }
        Insert: {
          autoplay?: boolean
          default_volume?: number
          enabled?: boolean
          id?: number
          updated_at?: string
        }
        Update: {
          autoplay?: boolean
          default_volume?: number
          enabled?: boolean
          id?: number
          updated_at?: string
        }
        Relationships: []
      }
      music_tracks: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          sort_order: number
          title: string
          url: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title: string
          url: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          sort_order?: number
          title?: string
          url?: string
        }
        Relationships: []
      }
      notification_settings: {
        Row: {
          email_enabled: boolean
          from_email: string | null
          from_name: string | null
          id: number
          push_enabled: boolean
          sms_enabled: boolean
          updated_at: string
        }
        Insert: {
          email_enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          id?: number
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
        }
        Update: {
          email_enabled?: boolean
          from_email?: string | null
          from_name?: string | null
          id?: number
          push_enabled?: boolean
          sms_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string
          details: string | null
          id: string
          is_active: boolean
          kind: string
          name: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          kind: string
          name: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          name?: string
        }
        Relationships: []
      }
      platform_credentials: {
        Row: {
          agent_id: string
          base_url: string
          created_at: string
          platform: string
          secret_key: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          base_url: string
          created_at?: string
          platform: string
          secret_key: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          base_url?: string
          created_at?: string
          platform?: string
          secret_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      platform_integrations: {
        Row: {
          api_endpoint: string | null
          api_key: string | null
          connection_status: string
          created_at: string
          game_id: string
          id: string
          last_synced_at: string | null
          last_test_at: string | null
          last_test_message: string | null
          secret_key: string | null
          updated_at: string
          webhook_url: string | null
        }
        Insert: {
          api_endpoint?: string | null
          api_key?: string | null
          connection_status?: string
          created_at?: string
          game_id: string
          id?: string
          last_synced_at?: string | null
          last_test_at?: string | null
          last_test_message?: string | null
          secret_key?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Update: {
          api_endpoint?: string | null
          api_key?: string | null
          connection_status?: string
          created_at?: string
          game_id?: string
          id?: string
          last_synced_at?: string | null
          last_test_at?: string | null
          last_test_message?: string | null
          secret_key?: string | null
          updated_at?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_integrations_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_players: {
        Row: {
          created_at: string
          id: string
          juwa_password: string
          juwa_user_id: string
          juwa_username: string
          platform: string
          site_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          juwa_password: string
          juwa_user_id: string
          juwa_username: string
          platform: string
          site_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          juwa_password?: string
          juwa_user_id?: string
          juwa_username?: string
          platform?: string
          site_user_id?: string
        }
        Relationships: []
      }
      platform_sync_logs: {
        Row: {
          created_at: string
          duration_ms: number | null
          game_id: string
          id: string
          message: string | null
          status: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          game_id: string
          id?: string
          message?: string | null
          status: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          game_id?: string
          id?: string
          message?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_sync_logs_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_transactions: {
        Row: {
          amount: number
          created_at: string
          error: string | null
          id: string
          juwa_transaction_id: string | null
          order_id: string
          platform: string
          site_user_id: string
          status: string
          type: string
          user_balance: number | null
        }
        Insert: {
          amount: number
          created_at?: string
          error?: string | null
          id?: string
          juwa_transaction_id?: string | null
          order_id: string
          platform: string
          site_user_id: string
          status?: string
          type: string
          user_balance?: number | null
        }
        Update: {
          amount?: number
          created_at?: string
          error?: string | null
          id?: string
          juwa_transaction_id?: string | null
          order_id?: string
          platform?: string
          site_user_id?: string
          status?: string
          type?: string
          user_balance?: number | null
        }
        Relationships: []
      }
      player_logins: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          player_id: string
          success: boolean
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          player_id: string
          success?: boolean
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          player_id?: string
          success?: boolean
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_logins_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          balance: number
          created_at: string
          email: string | null
          full_name: string | null
          game_id: string | null
          game_ref_id: string | null
          id: string
          kyc_status: string
          last_login_at: string | null
          login_count: number
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["player_status"]
          suspended_at: string | null
          updated_at: string
          username: string
          vip_tier_id: string | null
        }
        Insert: {
          balance?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          game_id?: string | null
          game_ref_id?: string | null
          id?: string
          kyc_status?: string
          last_login_at?: string | null
          login_count?: number
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          suspended_at?: string | null
          updated_at?: string
          username: string
          vip_tier_id?: string | null
        }
        Update: {
          balance?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          game_id?: string | null
          game_ref_id?: string | null
          id?: string
          kyc_status?: string
          last_login_at?: string | null
          login_count?: number
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          suspended_at?: string | null
          updated_at?: string
          username?: string
          vip_tier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "players_game_ref_id_fkey"
            columns: ["game_ref_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_vip_tier_fk"
            columns: ["vip_tier_id"]
            isOneToOne: false
            referencedRelation: "vip_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      security_settings: {
        Row: {
          enforce_2fa_super_admin: boolean
          id: number
          ip_whitelist: Json
          min_password_length: number
          require_number: boolean
          require_symbol: boolean
          require_uppercase: boolean
          session_timeout_minutes: number
          updated_at: string
        }
        Insert: {
          enforce_2fa_super_admin?: boolean
          id?: number
          ip_whitelist?: Json
          min_password_length?: number
          require_number?: boolean
          require_symbol?: boolean
          require_uppercase?: boolean
          session_timeout_minutes?: number
          updated_at?: string
        }
        Update: {
          enforce_2fa_super_admin?: boolean
          id?: number
          ip_whitelist?: Json
          min_password_length?: number
          require_number?: boolean
          require_symbol?: boolean
          require_uppercase?: boolean
          session_timeout_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      site_theme: {
        Row: {
          accent_color: string
          background_image: string | null
          banner_image: string | null
          id: number
          logo_url: string | null
          mode: string
          primary_color: string
          updated_at: string
          updated_by: string | null
          widgets: Json
        }
        Insert: {
          accent_color?: string
          background_image?: string | null
          banner_image?: string | null
          id?: number
          logo_url?: string | null
          mode?: string
          primary_color?: string
          updated_at?: string
          updated_by?: string | null
          widgets?: Json
        }
        Update: {
          accent_color?: string
          background_image?: string | null
          banner_image?: string | null
          id?: number
          logo_url?: string | null
          mode?: string
          primary_color?: string
          updated_at?: string
          updated_by?: string | null
          widgets?: Json
        }
        Relationships: []
      }
      staff_profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          updated_at: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          updated_at?: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vip_tiers: {
        Row: {
          cashback_pct: number
          color: string
          created_at: string
          deposit_required: number
          icon: string | null
          id: string
          is_active: boolean
          monthly_activity_required: number
          name: string
          perks: Json
          priority_support: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          cashback_pct?: number
          color?: string
          created_at?: string
          deposit_required?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          monthly_activity_required?: number
          name: string
          perks?: Json
          priority_support?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cashback_pct?: number
          color?: string
          created_at?: string
          deposit_required?: number
          icon?: string | null
          id?: string
          is_active?: boolean
          monthly_activity_required?: number
          name?: string
          perks?: Json
          priority_support?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      wallet_ledger: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          id: string
          player_id: string
          reason: string | null
          related_cashout: string | null
          related_deposit: string | null
          staff_id: string | null
          type: Database["public"]["Enums"]["ledger_type"]
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          id?: string
          player_id: string
          reason?: string | null
          related_cashout?: string | null
          related_deposit?: string | null
          staff_id?: string | null
          type: Database["public"]["Enums"]["ledger_type"]
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          id?: string
          player_id?: string
          reason?: string | null
          related_cashout?: string | null
          related_deposit?: string | null
          staff_id?: string | null
          type?: Database["public"]["Enums"]["ledger_type"]
        }
        Relationships: [
          {
            foreignKeyName: "wallet_ledger_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_related_cashout_fkey"
            columns: ["related_cashout"]
            isOneToOne: false
            referencedRelation: "cashout_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wallet_ledger_related_deposit_fkey"
            columns: ["related_deposit"]
            isOneToOne: false
            referencedRelation: "deposit_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_handle_finance: { Args: { _user_id: string }; Returns: boolean }
      has_any_staff_role: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "finance_agent" | "support_agent"
      ledger_type:
        | "deposit"
        | "cashout"
        | "manual_credit"
        | "manual_debit"
        | "adjustment"
        | "bonus"
      player_status: "active" | "suspended" | "blocked" | "pending_kyc"
      request_status:
        | "pending"
        | "approved"
        | "rejected"
        | "failed"
        | "uncertain"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["super_admin", "admin", "finance_agent", "support_agent"],
      ledger_type: [
        "deposit",
        "cashout",
        "manual_credit",
        "manual_debit",
        "adjustment",
        "bonus",
      ],
      player_status: ["active", "suspended", "blocked", "pending_kyc"],
      request_status: [
        "pending",
        "approved",
        "rejected",
        "failed",
        "uncertain",
      ],
    },
  },
} as const
