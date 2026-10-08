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
      business_settings: {
        Row: {
          address: string | null
          allow_scheduled_orders: boolean
          business_id: string
          closed_message: string | null
          created_at: string
          delivery_options: string[]
          facebook_url: string | null
          header_image_url: string | null
          header_image_x: number
          header_image_y: number
          instagram_url: string | null
          logo_url: string | null
          menu_pdf_url: string | null
          payment_options: string[]
          preorder_cutoffs: Json
          preorders_enabled: boolean
          primary_color: string
          published: boolean
          reopens_on: string | null
          schedule: Json
          scheduled_lead_minutes: number
          secondary_color: string
          show_default_images: boolean
          tagline: string | null
          template: string
          temporarily_closed: boolean
          theme: string
          transfer_alias: string | null
          transfer_cbu: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          allow_scheduled_orders?: boolean
          business_id: string
          closed_message?: string | null
          created_at?: string
          delivery_options?: string[]
          facebook_url?: string | null
          header_image_url?: string | null
          header_image_x?: number
          header_image_y?: number
          instagram_url?: string | null
          logo_url?: string | null
          menu_pdf_url?: string | null
          payment_options?: string[]
          preorder_cutoffs?: Json
          preorders_enabled?: boolean
          primary_color?: string
          published?: boolean
          reopens_on?: string | null
          schedule?: Json
          scheduled_lead_minutes?: number
          secondary_color?: string
          show_default_images?: boolean
          tagline?: string | null
          template?: string
          temporarily_closed?: boolean
          theme?: string
          transfer_alias?: string | null
          transfer_cbu?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          allow_scheduled_orders?: boolean
          business_id?: string
          closed_message?: string | null
          created_at?: string
          delivery_options?: string[]
          facebook_url?: string | null
          header_image_url?: string | null
          header_image_x?: number
          header_image_y?: number
          instagram_url?: string | null
          logo_url?: string | null
          menu_pdf_url?: string | null
          payment_options?: string[]
          preorder_cutoffs?: Json
          preorders_enabled?: boolean
          primary_color?: string
          published?: boolean
          reopens_on?: string | null
          schedule?: Json
          scheduled_lead_minutes?: number
          secondary_color?: string
          show_default_images?: boolean
          tagline?: string | null
          template?: string
          temporarily_closed?: boolean
          theme?: string
          transfer_alias?: string | null
          transfer_cbu?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      business_users: {
        Row: {
          business_id: string
          created_at: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          business_id: string
          created_at?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          business_id?: string
          created_at?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_users_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_users_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          active: boolean
          created_at: string | null
          id: string
          logo_url: string | null
          name: string
          plan_completo: boolean
          plan_pdf: boolean
          plan_web: boolean
          slug: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan_completo?: boolean
          plan_pdf?: boolean
          plan_web?: boolean
          slug: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan_completo?: boolean
          plan_pdf?: boolean
          plan_web?: boolean
          slug?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      categories: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          description: string | null
          description_en: string | null
          description_pt: string | null
          id: string
          name: string
          name_en: string | null
          name_pt: string | null
          slug: string | null
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          description?: string | null
          description_en?: string | null
          description_pt?: string | null
          id?: string
          name: string
          name_en?: string | null
          name_pt?: string | null
          slug?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          description?: string | null
          description_en?: string | null
          description_pt?: string | null
          id?: string
          name?: string
          name_en?: string | null
          name_pt?: string | null
          slug?: string | null
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      default_images: {
        Row: {
          active: boolean
          created_at: string
          id: string
          image_url: string
          keywords: string[]
          name: string
          priority: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          image_url: string
          keywords?: string[]
          name: string
          priority?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          image_url?: string
          keywords?: string[]
          name?: string
          priority?: number
        }
        Relationships: []
      }
      option_groups: {
        Row: {
          active: boolean
          allow_repeat: boolean
          business_id: string
          created_at: string
          id: string
          max_select: number
          min_select: number
          name: string
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          allow_repeat?: boolean
          business_id: string
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name: string
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          allow_repeat?: boolean
          business_id?: string
          created_at?: string
          id?: string
          max_select?: number
          min_select?: number
          name?: string
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "option_groups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      options: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          group_id: string
          id: string
          name: string
          price_delta: number
          sold_out: boolean
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          group_id: string
          id?: string
          name: string
          price_delta?: number
          sold_out?: boolean
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          group_id?: string
          id?: string
          name?: string
          price_delta?: number
          sold_out?: boolean
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "options_group_id_business_id_fkey"
            columns: ["group_id", "business_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      order_counters: {
        Row: {
          business_id: string
          last_number: number
        }
        Insert: {
          business_id: string
          last_number?: number
        }
        Update: {
          business_id?: string
          last_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_counters_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      order_events: {
        Row: {
          business_id: string
          changed_by: string | null
          created_at: string
          id: string
          kind: string
          note: string | null
          order_id: string
          status: string
        }
        Insert: {
          business_id: string
          changed_by?: string | null
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          order_id: string
          status: string
        }
        Update: {
          business_id?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          kind?: string
          note?: string | null
          order_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_events_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_events_order_id_business_id_fkey"
            columns: ["order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      order_items: {
        Row: {
          business_id: string
          id: string
          name: string
          options: Json | null
          order_id: string
          product_id: string | null
          promotion_id: string | null
          quantity: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          business_id: string
          id?: string
          name: string
          options?: Json | null
          order_id: string
          product_id?: string | null
          promotion_id?: string | null
          quantity: number
          sort_order?: number
          unit_price: number
        }
        Update: {
          business_id?: string
          id?: string
          name?: string
          options?: Json | null
          order_id?: string
          product_id?: string | null
          promotion_id?: string | null
          quantity?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_business_id_fkey"
            columns: ["order_id", "business_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          active: boolean
          business_id: string
          code: string
          created_at: string
          customer_name: string | null
          delivery: string | null
          id: string
          mp_payment_id: string | null
          notes: string | null
          order_number: string
          payment: string | null
          payment_status: string
          preorder: boolean
          scheduled_for: string | null
          source: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          code?: string
          created_at?: string
          customer_name?: string | null
          delivery?: string | null
          id?: string
          mp_payment_id?: string | null
          notes?: string | null
          order_number: string
          payment?: string | null
          payment_status?: string
          preorder?: boolean
          scheduled_for?: string | null
          source?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          code?: string
          created_at?: string
          customer_name?: string | null
          delivery?: string | null
          id?: string
          mp_payment_id?: string | null
          notes?: string | null
          order_number?: string
          payment?: string | null
          payment_status?: string
          preorder?: boolean
          scheduled_for?: string | null
          source?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_credentials: {
        Row: {
          business_id: string
          created_at: string
          enabled: boolean
          mp_access_token: string
          mp_webhook_secret: string
        }
        Insert: {
          business_id: string
          created_at?: string
          enabled?: boolean
          mp_access_token: string
          mp_webhook_secret: string
        }
        Update: {
          business_id?: string
          created_at?: string
          enabled?: boolean
          mp_access_token?: string
          mp_webhook_secret?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_credentials_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_groups: {
        Row: {
          business_id: string
          group_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          business_id: string
          group_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          business_id?: string
          group_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_option_groups_group_id_business_id_fkey"
            columns: ["group_id", "business_id"]
            isOneToOne: false
            referencedRelation: "option_groups"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "product_option_groups_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          business_id: string
          category_id: string | null
          created_at: string
          description: string | null
          description_en: string | null
          description_pt: string | null
          featured: boolean | null
          id: string
          image_url: string | null
          name: string
          name_en: string | null
          name_pt: string | null
          price: number
          sold_out: boolean
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          description_en?: string | null
          description_pt?: string | null
          featured?: boolean | null
          id?: string
          image_url?: string | null
          name: string
          name_en?: string | null
          name_pt?: string | null
          price?: number
          sold_out?: boolean
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          category_id?: string | null
          created_at?: string
          description?: string | null
          description_en?: string | null
          description_pt?: string | null
          featured?: boolean | null
          id?: string
          image_url?: string | null
          name?: string
          name_en?: string | null
          name_pt?: string | null
          price?: number
          sold_out?: boolean
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id", "business_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      promotion_items: {
        Row: {
          business_id: string
          product_id: string
          promotion_id: string
          sort_order: number
        }
        Insert: {
          business_id: string
          product_id: string
          promotion_id: string
          sort_order?: number
        }
        Update: {
          business_id?: string
          product_id?: string
          promotion_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "promotion_items_product_id_business_id_fkey"
            columns: ["product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "promotion_items_promotion_id_business_id_fkey"
            columns: ["promotion_id", "business_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      promotions: {
        Row: {
          active: boolean
          business_id: string
          created_at: string
          description: string | null
          discount_percent: number
          id: string
          name: string
          price: number | null
          slug: string | null
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          name: string
          price?: number | null
          slug?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          name?: string
          price?: number | null
          slug?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "super_admins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
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
      confirm_order_payment: {
        Args: {
          p_amount: number
          p_order_id: string
          p_payment_id: string
          p_status: string
        }
        Returns: string
      }
      create_business_with_owner: {
        Args: {
          p_name: string
          p_owner_id: string
          p_plan_completo: boolean
          p_plan_pdf: boolean
          p_plan_web: boolean
          p_slug: string
          p_whatsapp: string
        }
        Returns: string
      }
      create_manual_order: {
        Args: {
          p_business_id: string
          p_customer_name: string
          p_delivery: string
          p_items: Json
          p_notes: string
          p_payment: string
          p_scheduled_for?: string
        }
        Returns: Json
      }
      create_public_order: {
        Args: {
          p_customer_name: string
          p_delivery: string
          p_items: Json
          p_notes: string
          p_payment: string
          p_preorder?: boolean
          p_scheduled_for?: string
          p_slug: string
        }
        Returns: Json
      }
      default_images_unmatched: {
        Args: never
        Returns: {
          business_count: number
          example_name: string
          normalized_name: string
          product_count: number
        }[]
      }
      is_open_now: {
        Args: { p_at: string; p_schedule: Json }
        Returns: boolean
      }
      is_schedulable_at: {
        Args: {
          p_at: string
          p_lead_minutes: number
          p_now: string
          p_schedule: Json
        }
        Returns: boolean
      }
      is_super_admin: { Args: never; Returns: boolean }
      is_valid_preorder_cutoffs: { Args: { p_cutoffs: Json }; Returns: boolean }
      is_valid_schedule: { Args: { p_schedule: Json }; Returns: boolean }
      new_tracking_code: { Args: never; Returns: string }
      next_order_number: { Args: { p_business_id: string }; Returns: number }
      normalize_words: { Args: { p_text: string }; Returns: string[] }
      preorder_window: {
        Args: { p_cutoffs: Json; p_now: string; p_schedule: Json }
        Returns: {
          cutoff_at: string
          opens_at: string
        }[]
      }
      product_has_required_group: {
        Args: { p_product_id: string }
        Returns: boolean
      }
      product_in_promotion: { Args: { p_product_id: string }; Returns: boolean }
      public_business_pdf: {
        Args: { p_slug: string; p_via_path?: boolean }
        Returns: Json
      }
      public_menu: {
        Args: { p_slug: string; p_static?: boolean; p_via_path?: boolean }
        Returns: Json
      }
      public_order_tracking: { Args: { p_code: string }; Returns: Json }
      resolve_order_options: {
        Args: { p_business_id: string; p_options: Json; p_product_id: string }
        Returns: Json
      }
      save_business_settings: {
        Args: {
          p_address: string
          p_allow_scheduled_orders: boolean
          p_business_id: string
          p_closed_message: string
          p_delivery_options: string[]
          p_facebook_url: string
          p_header_image_url: string
          p_header_image_x: number
          p_header_image_y: number
          p_instagram_url: string
          p_logo_url: string
          p_menu_pdf_url: string
          p_payment_options: string[]
          p_preorder_cutoffs: Json
          p_preorders_enabled: boolean
          p_primary_color: string
          p_published: boolean
          p_reopens_on: string
          p_schedule: Json
          p_scheduled_lead_minutes: number
          p_secondary_color: string
          p_show_default_images?: boolean
          p_tagline: string
          p_template: string
          p_temporarily_closed: boolean
          p_theme: string
          p_transfer_alias: string
          p_transfer_cbu: string
          p_whatsapp: string
        }
        Returns: undefined
      }
      save_option_group: {
        Args: {
          p_active: boolean
          p_allow_repeat: boolean
          p_business_id: string
          p_id: string
          p_max_select: number
          p_min_select: number
          p_name: string
          p_options: Json
        }
        Returns: string
      }
      save_promotion: {
        Args: {
          p_active: boolean
          p_business_id: string
          p_description: string
          p_discount_percent: number
          p_id: string
          p_name: string
          p_price: number
          p_product_ids: string[]
          p_type: string
        }
        Returns: string
      }
      set_order_status: {
        Args: { p_note?: string; p_order_id: string; p_status: string }
        Returns: undefined
      }
      set_product_option_groups: {
        Args: {
          p_business_id: string
          p_group_ids: string[]
          p_product_id: string
        }
        Returns: undefined
      }
      suggest_default_image: {
        Args: { p_category?: string; p_name: string }
        Returns: {
          by_category: boolean
          id: string
          image_url: string
          keyword: string
          name: string
        }[]
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
    Enums: {},
  },
} as const
