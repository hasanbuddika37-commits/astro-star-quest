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
      ad_blocks: {
        Row: {
          button_lock_seconds: number
          buttons_count: number
          cooldown_seconds: number
          created_at: string
          id: string
          is_enabled: boolean
          label: string
          logo_url: string | null
          network: string
          reward_max: number
          reward_min: number
          sdk_extra: Json | null
          sort_order: number
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          button_lock_seconds?: number
          buttons_count?: number
          cooldown_seconds?: number
          created_at?: string
          id?: string
          is_enabled?: boolean
          label: string
          logo_url?: string | null
          network: string
          reward_max?: number
          reward_min?: number
          sdk_extra?: Json | null
          sort_order?: number
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          button_lock_seconds?: number
          buttons_count?: number
          cooldown_seconds?: number
          created_at?: string
          id?: string
          is_enabled?: boolean
          label?: string
          logo_url?: string | null
          network?: string
          reward_max?: number
          reward_min?: number
          sdk_extra?: Json | null
          sort_order?: number
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: []
      }
      ad_button_views: {
        Row: {
          button_index: number
          created_at: string
          id: string
          network: string
          reward: number
          tg_id: number
        }
        Insert: {
          button_index: number
          created_at?: string
          id?: string
          network: string
          reward?: number
          tg_id: number
        }
        Update: {
          button_index?: number
          created_at?: string
          id?: string
          network?: string
          reward?: number
          tg_id?: number
        }
        Relationships: []
      }
      ad_views: {
        Row: {
          created_at: string
          id: string
          network: string | null
          reward: number
          slot: string
          tg_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          network?: string | null
          reward?: number
          slot: string
          tg_id: number
        }
        Update: {
          created_at?: string
          id?: string
          network?: string | null
          reward?: number
          slot?: string
          tg_id?: number
        }
        Relationships: []
      }
      admin_sessions: {
        Row: {
          admin_id: string
          created_at: string
          expires_at: string
          token: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          expires_at: string
          token: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          expires_at?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_sessions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string
          email: string
          id: string
          is_super: boolean
          password_hash: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          is_super?: boolean
          password_hash: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          is_super?: boolean
          password_hash?: string
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      broadcasts: {
        Row: {
          button_text: string | null
          button_url: string | null
          created_at: string
          failed_count: number
          finished_at: string | null
          id: string
          image_url: string | null
          message: string
          sent_count: number
          status: string
        }
        Insert: {
          button_text?: string | null
          button_url?: string | null
          created_at?: string
          failed_count?: number
          finished_at?: string | null
          id?: string
          image_url?: string | null
          message: string
          sent_count?: number
          status?: string
        }
        Update: {
          button_text?: string | null
          button_url?: string | null
          created_at?: string
          failed_count?: number
          finished_at?: string | null
          id?: string
          image_url?: string | null
          message?: string
          sent_count?: number
          status?: string
        }
        Relationships: []
      }
      challenge_claims: {
        Row: {
          challenge_id: string
          created_at: string
          id: string
          period_key: string
          tg_id: number
        }
        Insert: {
          challenge_id: string
          created_at?: string
          id?: string
          period_key: string
          tg_id: number
        }
        Update: {
          challenge_id?: string
          created_at?: string
          id?: string
          period_key?: string
          tg_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "challenge_claims_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      challenges: {
        Row: {
          created_at: string
          description: string | null
          goal: number
          id: string
          is_active: boolean
          kind: string
          period: string
          reward: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          goal: number
          id?: string
          is_active?: boolean
          kind: string
          period?: string
          reward: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          goal?: number
          id?: string
          is_active?: boolean
          kind?: string
          period?: string
          reward?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      coin_ledger: {
        Row: {
          created_at: string
          delta: number
          id: string
          meta: Json | null
          reason: string
          tg_id: number
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          meta?: Json | null
          reason: string
          tg_id: number
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          meta?: Json | null
          reason?: string
          tg_id?: number
        }
        Relationships: []
      }
      game_plays: {
        Row: {
          coins_earned: number
          created_at: string
          id: string
          level_reached: number
          revived: boolean
          tg_id: number
        }
        Insert: {
          coins_earned: number
          created_at?: string
          id?: string
          level_reached: number
          revived?: boolean
          tg_id: number
        }
        Update: {
          coins_earned?: number
          created_at?: string
          id?: string
          level_reached?: number
          revived?: boolean
          tg_id?: number
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          created_at: string
          id: string
          kind: string
          payload: Json | null
          tg_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          payload?: Json | null
          tg_id: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          payload?: Json | null
          tg_id?: number
        }
        Relationships: []
      }
      price_cache: {
        Row: {
          symbol: string
          updated_at: string
          usd: number
        }
        Insert: {
          symbol: string
          updated_at?: string
          usd: number
        }
        Update: {
          symbol?: string
          updated_at?: string
          usd?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          ads_watched: number
          best_score: number
          coins: number
          created_at: string
          day1_ads: number
          day1_date: string | null
          day2_ads: number
          day2_date: string | null
          device_fingerprint: string | null
          first_name: string | null
          game_level: number
          id: string
          is_suspended: boolean
          joined_date: string | null
          language_code: string | null
          last_ip: string | null
          last_name: string | null
          notifications_enabled: boolean
          onboarded: boolean
          photo_url: string | null
          refer_bonus_paid: boolean
          refer_code: string
          refer_count: number
          refer_stage: number
          referrer_tg_id: number | null
          suspend_reason: string | null
          tg_id: number
          total_withdraw: number
          updated_at: string
          username: string | null
          verified_refer_count: number
          wallet_ton: string | null
          wallet_usdt_bep20: string | null
        }
        Insert: {
          ads_watched?: number
          best_score?: number
          coins?: number
          created_at?: string
          day1_ads?: number
          day1_date?: string | null
          day2_ads?: number
          day2_date?: string | null
          device_fingerprint?: string | null
          first_name?: string | null
          game_level?: number
          id?: string
          is_suspended?: boolean
          joined_date?: string | null
          language_code?: string | null
          last_ip?: string | null
          last_name?: string | null
          notifications_enabled?: boolean
          onboarded?: boolean
          photo_url?: string | null
          refer_bonus_paid?: boolean
          refer_code: string
          refer_count?: number
          refer_stage?: number
          referrer_tg_id?: number | null
          suspend_reason?: string | null
          tg_id: number
          total_withdraw?: number
          updated_at?: string
          username?: string | null
          verified_refer_count?: number
          wallet_ton?: string | null
          wallet_usdt_bep20?: string | null
        }
        Update: {
          ads_watched?: number
          best_score?: number
          coins?: number
          created_at?: string
          day1_ads?: number
          day1_date?: string | null
          day2_ads?: number
          day2_date?: string | null
          device_fingerprint?: string | null
          first_name?: string | null
          game_level?: number
          id?: string
          is_suspended?: boolean
          joined_date?: string | null
          language_code?: string | null
          last_ip?: string | null
          last_name?: string | null
          notifications_enabled?: boolean
          onboarded?: boolean
          photo_url?: string | null
          refer_bonus_paid?: boolean
          refer_code?: string
          refer_count?: number
          refer_stage?: number
          referrer_tg_id?: number | null
          suspend_reason?: string | null
          tg_id?: number
          total_withdraw?: number
          updated_at?: string
          username?: string | null
          verified_refer_count?: number
          wallet_ton?: string | null
          wallet_usdt_bep20?: string | null
        }
        Relationships: []
      }
      referral_commissions: {
        Row: {
          amount: number
          created_at: string
          id: string
          referee_tg_id: number
          referrer_tg_id: number
          source: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          referee_tg_id: number
          referrer_tg_id: number
          source: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          referee_tg_id?: number
          referrer_tg_id?: number
          source?: string
        }
        Relationships: []
      }
      support_tickets: {
        Row: {
          created_at: string
          id: string
          status: string
          subject: string
          tg_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          status?: string
          subject: string
          tg_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          status?: string
          subject?: string
          tg_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      task_completions: {
        Row: {
          created_at: string
          id: string
          task_id: string
          tg_id: number
        }
        Insert: {
          created_at?: string
          id?: string
          task_id: string
          tg_id: number
        }
        Update: {
          created_at?: string
          id?: string
          task_id?: string
          tg_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          channel_username: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          kind: string
          reward: number
          sort_order: number
          target: string | null
          task_type: string
          title: string
          updated_at: string
          url: string | null
          verify_via_join: boolean
        }
        Insert: {
          channel_username?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          reward?: number
          sort_order?: number
          target?: string | null
          task_type?: string
          title: string
          updated_at?: string
          url?: string | null
          verify_via_join?: boolean
        }
        Update: {
          channel_username?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          kind?: string
          reward?: number
          sort_order?: number
          target?: string | null
          task_type?: string
          title?: string
          updated_at?: string
          url?: string | null
          verify_via_join?: boolean
        }
        Relationships: []
      }
      ticket_messages: {
        Row: {
          author: string
          body: string
          created_at: string
          id: string
          ticket_id: string
        }
        Insert: {
          author: string
          body: string
          created_at?: string
          id?: string
          ticket_id: string
        }
        Update: {
          author?: string
          body?: string
          created_at?: string
          id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_actions: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          delta: number | null
          id: string
          meta: Json | null
          note: string | null
          tg_id: number
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          delta?: number | null
          id?: string
          meta?: Json | null
          note?: string | null
          tg_id: number
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          delta?: number | null
          id?: string
          meta?: Json | null
          note?: string | null
          tg_id?: number
        }
        Relationships: []
      }
      withdrawals: {
        Row: {
          address: string
          admin_note: string | null
          amount_native: number
          amount_usd: number
          coins: number
          created_at: string
          currency: string
          fee_pct: number
          id: string
          net_amount: number
          processed_at: string | null
          status: string
          tg_id: number
          tx_id: string | null
        }
        Insert: {
          address: string
          admin_note?: string | null
          amount_native: number
          amount_usd: number
          coins: number
          created_at?: string
          currency: string
          fee_pct?: number
          id?: string
          net_amount: number
          processed_at?: string | null
          status?: string
          tg_id: number
          tx_id?: string | null
        }
        Update: {
          address?: string
          admin_note?: string | null
          amount_native?: number
          amount_usd?: number
          coins?: number
          created_at?: string
          currency?: string
          fee_pct?: number
          id?: string
          net_amount?: number
          processed_at?: string | null
          status?: string
          tg_id?: number
          tx_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_adjust_balance: {
        Args: {
          p_admin_id: string
          p_delta: number
          p_note: string
          p_tg_id: number
        }
        Returns: number
      }
      credit_coins: {
        Args: {
          p_delta: number
          p_meta?: Json
          p_reason: string
          p_tg_id: number
        }
        Returns: number
      }
      maybe_verify_referral: {
        Args: { p_referee_tg_id: number }
        Returns: undefined
      }
      progress_referral: {
        Args: { p_referee_tg_id: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
