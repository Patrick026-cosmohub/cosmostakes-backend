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
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
          staff_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          staff_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
          staff_id?: string | null
        }
        Relationships: []
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
          created_at: string
          id: string
          is_active: boolean
          name: string
          provider: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          provider: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          provider?: string
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
      players: {
        Row: {
          balance: number
          created_at: string
          email: string | null
          full_name: string | null
          game_id: string | null
          game_ref_id: string | null
          id: string
          notes: string | null
          phone: string | null
          status: Database["public"]["Enums"]["player_status"]
          updated_at: string
          username: string
        }
        Insert: {
          balance?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          game_id?: string | null
          game_ref_id?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          updated_at?: string
          username: string
        }
        Update: {
          balance?: number
          created_at?: string
          email?: string | null
          full_name?: string | null
          game_id?: string | null
          game_ref_id?: string | null
          id?: string
          notes?: string | null
          phone?: string | null
          status?: Database["public"]["Enums"]["player_status"]
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "players_game_ref_id_fkey"
            columns: ["game_ref_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
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
