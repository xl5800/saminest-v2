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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name_en: string | null
          name_zh: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_en?: string | null
          name_zh: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name_en?: string | null
          name_zh?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      conversation_members: {
        Row: {
          conversation_id: string
          is_muted: boolean
          joined_at: string
          last_read_at: string | null
          left_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          is_muted?: boolean
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          last_message_at: string | null
          post_id: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          last_message_at?: string | null
          post_id?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          last_message_at?: string | null
          post_id?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorites_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          country_code: string
          created_at: string
          id: string
          is_active: boolean
          latitude: number | null
          longitude: number | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          state_code: string | null
          type: string
          updated_at: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          state_code?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          country_code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          state_code?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          message_type: string
          reply_to_id: string | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          reply_to_id?: string | null
          sender_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          reply_to_id?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_actions: {
        Row: {
          action_type: string
          actor_id: string
          created_at: string
          id: string
          metadata: Json
          note: string | null
          reason_code: string | null
          target_id: string
          target_type: string
        }
        Insert: {
          action_type: string
          actor_id: string
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          reason_code?: string | null
          target_id: string
          target_type: string
        }
        Update: {
          action_type?: string
          actor_id?: string
          created_at?: string
          id?: string
          metadata?: Json
          note?: string | null
          reason_code?: string | null
          target_id?: string
          target_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      post_images: {
        Row: {
          alt_text: string | null
          created_at: string
          deleted_at: string | null
          height: number | null
          id: string
          mime_type: string | null
          owner_id: string
          post_id: string
          public_url: string | null
          size_bytes: number | null
          sort_order: number
          storage_path: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          deleted_at?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          owner_id: string
          post_id: string
          public_url?: string | null
          size_bytes?: number | null
          sort_order?: number
          storage_path: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          deleted_at?: string | null
          height?: number | null
          id?: string
          mime_type?: string | null
          owner_id?: string
          post_id?: string
          public_url?: string | null
          size_bytes?: number | null
          sort_order?: number
          storage_path?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "post_images_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_images_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          archived_at: string | null
          author_id: string
          category_id: string
          contact_method: string | null
          contact_value: string | null
          created_at: string
          currency_code: string
          deleted_at: string | null
          description: string
          expires_at: string | null
          favorite_count: number
          id: string
          location_id: string | null
          price_amount: number | null
          price_label: string | null
          published_at: string | null
          status: string
          title: string
          updated_at: string
          view_count: number
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          author_id: string
          category_id: string
          contact_method?: string | null
          contact_value?: string | null
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          description: string
          expires_at?: string | null
          favorite_count?: number
          id?: string
          location_id?: string | null
          price_amount?: number | null
          price_label?: string | null
          published_at?: string | null
          status?: string
          title: string
          updated_at?: string
          view_count?: number
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          author_id?: string
          category_id?: string
          contact_method?: string | null
          contact_value?: string | null
          created_at?: string
          currency_code?: string
          deleted_at?: string | null
          description?: string
          expires_at?: string | null
          favorite_count?: number
          id?: string
          location_id?: string | null
          price_amount?: number | null
          price_label?: string | null
          published_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          view_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          account_status: string
          avatar_url: string | null
          bio: string | null
          created_at: string
          deleted_at: string | null
          display_name: string
          id: string
          is_verified: boolean
          last_active_at: string | null
          location_id: string | null
          role: string
          updated_at: string
        }
        Insert: {
          account_status?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name: string
          id: string
          is_verified?: boolean
          last_active_at?: string | null
          location_id?: string | null
          role?: string
          updated_at?: string
        }
        Update: {
          account_status?: string
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          id?: string
          is_verified?: boolean
          last_active_at?: string | null
          location_id?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string
          description: string | null
          id: string
          reason_code: string
          reporter_id: string
          resolution_note: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          status: string
          target_id: string
          target_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          reason_code: string
          reporter_id: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          target_id: string
          target_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          reason_code?: string
          reporter_id?: string
          resolution_note?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          status?: string
          target_id?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_post: { Args: { target_post_id: string }; Returns: undefined }
      create_direct_conversation: {
        Args: { target_post_id: string }
        Returns: string
      }
      dismiss_report: {
        Args: { resolution_note: string; target_report_id: string }
        Returns: undefined
      }
      is_active_conversation_member: {
        Args: { target_conversation_id: string }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_conversation_member: {
        Args: { target_conversation_id: string }
        Returns: boolean
      }
      reject_post: {
        Args: { rejection_note: string; target_post_id: string }
        Returns: undefined
      }
      resolve_report: {
        Args: { resolution_note: string; target_report_id: string }
        Returns: undefined
      }
    }
    Enums: {
      post_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "archived"
        | "deleted"
      report_status: "pending" | "reviewing" | "resolved" | "dismissed"
      report_target_type: "post" | "user" | "message"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      post_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "archived",
        "deleted",
      ],
      report_status: ["pending", "reviewing", "resolved", "dismissed"],
      report_target_type: ["post", "user", "message"],
    },
  },
} as const
