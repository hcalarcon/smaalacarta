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
    PostgrestVersion: "14.17"
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
      business_delivery_zones: {
        Row: {
          business_id: string
          zone_id: string
        }
        Insert: {
          business_id: string
          zone_id: string
        }
        Update: {
          business_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_delivery_zones_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_delivery_zones_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          address: string | null
          allow_item_notes: boolean
          allow_scheduled_orders: boolean
          business_id: string
          closed_message: string | null
          created_at: string
          default_prep_minutes: number
          delivery_options: string[]
          facebook_url: string | null
          favorite_courier_id: string | null
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
          show_prep_time: boolean
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
          allow_item_notes?: boolean
          allow_scheduled_orders?: boolean
          business_id: string
          closed_message?: string | null
          created_at?: string
          default_prep_minutes?: number
          delivery_options?: string[]
          facebook_url?: string | null
          favorite_courier_id?: string | null
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
          show_prep_time?: boolean
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
          allow_item_notes?: boolean
          allow_scheduled_orders?: boolean
          business_id?: string
          closed_message?: string | null
          created_at?: string
          default_prep_minutes?: number
          delivery_options?: string[]
          facebook_url?: string | null
          favorite_courier_id?: string | null
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
          show_prep_time?: boolean
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
          {
            foreignKeyName: "business_settings_favorite_courier_id_fkey"
            columns: ["favorite_courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
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
          courier_delivery: boolean
          created_at: string | null
          id: string
          logo_url: string | null
          mp_oauth_enabled: boolean
          name: string
          plan_completo: boolean
          plan_pdf: boolean
          plan_web: boolean
          slug: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          courier_delivery?: boolean
          created_at?: string | null
          id?: string
          logo_url?: string | null
          mp_oauth_enabled?: boolean
          name: string
          plan_completo?: boolean
          plan_pdf?: boolean
          plan_web?: boolean
          slug: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          courier_delivery?: boolean
          created_at?: string | null
          id?: string
          logo_url?: string | null
          mp_oauth_enabled?: boolean
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
      courier_offers: {
        Row: {
          closed_at: string | null
          courier_id: string
          created_at: string
          id: string
          order_id: string
          price: number
          reason: string | null
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          courier_id: string
          created_at?: string
          id?: string
          order_id: string
          price: number
          reason?: string | null
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          courier_id?: string
          created_at?: string
          id?: string
          order_id?: string
          price?: number
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_offers_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_offers_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_order_declines: {
        Row: {
          courier_id: string
          created_at: string
          kind: string
          order_id: string
          reason: string | null
        }
        Insert: {
          courier_id: string
          created_at?: string
          kind: string
          order_id: string
          reason?: string | null
        }
        Update: {
          courier_id?: string
          created_at?: string
          kind?: string
          order_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courier_order_declines_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_order_declines_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_users: {
        Row: {
          courier_id: string
          user_id: string
        }
        Insert: {
          courier_id: string
          user_id: string
        }
        Update: {
          courier_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_users_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
        ]
      }
      courier_zone_coverage: {
        Row: {
          courier_id: string
          zone_id: string
        }
        Insert: {
          courier_id: string
          zone_id: string
        }
        Update: {
          courier_id?: string
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courier_zone_coverage_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courier_zone_coverage_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      couriers: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          whatsapp: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          whatsapp?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          whatsapp?: string | null
        }
        Relationships: []
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
      delivery_zones: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          price: number
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          price: number
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          price?: number
          sort_order?: number
        }
        Relationships: []
      }
      mp_oauth_states: {
        Row: {
          business_id: string
          code_verifier_enc: string
          created_at: string
          expires_at: string
          id: string
          state_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          business_id: string
          code_verifier_enc: string
          created_at?: string
          expires_at: string
          id?: string
          state_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          business_id?: string
          code_verifier_enc?: string
          created_at?: string
          expires_at?: string
          id?: string
          state_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mp_oauth_states_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
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
          free: boolean
          id: string
          name: string
          note: string | null
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
          free?: boolean
          id?: string
          name: string
          note?: string | null
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
          free?: boolean
          id?: string
          name?: string
          note?: string | null
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
          courier_id: string | null
          courier_note: string | null
          courier_requested_at: string | null
          courier_responded_at: string | null
          courier_status: string | null
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          delivery: string | null
          delivery_address: string | null
          delivery_fee: number | null
          delivery_fee_changed_at: string | null
          delivery_fee_changed_by: string | null
          delivery_fee_list: number | null
          delivery_fee_reason: string | null
          delivery_mode: string | null
          delivery_zone_id: string | null
          delivery_zone_name: string | null
          id: string
          mp_payment_id: string | null
          new_order_reminded_at: string | null
          new_order_reminders: number
          no_offers_alerted_at: string | null
          notes: string | null
          offered_at: string | null
          order_number: string
          payment: string | null
          payment_status: string
          preorder: boolean
          prep_ready_at: string | null
          prep_reason: string | null
          prep_updated_at: string | null
          scheduled_for: string | null
          settled_at: string | null
          settled_by: string | null
          settlement_received_at: string | null
          settlement_received_by: string | null
          source: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          business_id: string
          code?: string
          courier_id?: string | null
          courier_note?: string | null
          courier_requested_at?: string | null
          courier_responded_at?: string | null
          courier_status?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivery?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          delivery_fee_changed_at?: string | null
          delivery_fee_changed_by?: string | null
          delivery_fee_list?: number | null
          delivery_fee_reason?: string | null
          delivery_mode?: string | null
          delivery_zone_id?: string | null
          delivery_zone_name?: string | null
          id?: string
          mp_payment_id?: string | null
          new_order_reminded_at?: string | null
          new_order_reminders?: number
          no_offers_alerted_at?: string | null
          notes?: string | null
          offered_at?: string | null
          order_number: string
          payment?: string | null
          payment_status?: string
          preorder?: boolean
          prep_ready_at?: string | null
          prep_reason?: string | null
          prep_updated_at?: string | null
          scheduled_for?: string | null
          settled_at?: string | null
          settled_by?: string | null
          settlement_received_at?: string | null
          settlement_received_by?: string | null
          source?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          business_id?: string
          code?: string
          courier_id?: string | null
          courier_note?: string | null
          courier_requested_at?: string | null
          courier_responded_at?: string | null
          courier_status?: string | null
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          delivery?: string | null
          delivery_address?: string | null
          delivery_fee?: number | null
          delivery_fee_changed_at?: string | null
          delivery_fee_changed_by?: string | null
          delivery_fee_list?: number | null
          delivery_fee_reason?: string | null
          delivery_mode?: string | null
          delivery_zone_id?: string | null
          delivery_zone_name?: string | null
          id?: string
          mp_payment_id?: string | null
          new_order_reminded_at?: string | null
          new_order_reminders?: number
          no_offers_alerted_at?: string | null
          notes?: string | null
          offered_at?: string | null
          order_number?: string
          payment?: string | null
          payment_status?: string
          preorder?: boolean
          prep_ready_at?: string | null
          prep_reason?: string | null
          prep_updated_at?: string | null
          scheduled_for?: string | null
          settled_at?: string | null
          settled_by?: string | null
          settlement_received_at?: string | null
          settlement_received_by?: string | null
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
          {
            foreignKeyName: "orders_courier_id_fkey"
            columns: ["courier_id"]
            isOneToOne: false
            referencedRelation: "couriers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "delivery_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_connections: {
        Row: {
          access_token_enc: string | null
          business_id: string
          connected_at: string
          connected_by: string | null
          expires_at: string | null
          key_version: number
          mp_user_id: number
          refresh_token_enc: string | null
          refreshing_until: string | null
          scope: string | null
          status: string
          updated_at: string
        }
        Insert: {
          access_token_enc?: string | null
          business_id: string
          connected_at?: string
          connected_by?: string | null
          expires_at?: string | null
          key_version: number
          mp_user_id: number
          refresh_token_enc?: string | null
          refreshing_until?: string | null
          scope?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          access_token_enc?: string | null
          business_id?: string
          connected_at?: string
          connected_by?: string | null
          expires_at?: string | null
          key_version?: number
          mp_user_id?: number
          refresh_token_enc?: string | null
          refreshing_until?: string | null
          scope?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_connections_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: true
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
          image_product_id: string | null
          image_url: string | null
          name: string
          price: number | null
          slug: string | null
          stock: number | null
          stock_set_at: string | null
          type: string
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          active?: boolean
          business_id: string
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          image_product_id?: string | null
          image_url?: string | null
          name: string
          price?: number | null
          slug?: string | null
          stock?: number | null
          stock_set_at?: string | null
          type?: string
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          active?: boolean
          business_id?: string
          created_at?: string
          description?: string | null
          discount_percent?: number
          id?: string
          image_product_id?: string | null
          image_url?: string | null
          name?: string
          price?: number | null
          slug?: string | null
          stock?: number | null
          stock_set_at?: string | null
          type?: string
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_image_product_fkey"
            columns: ["image_product_id", "business_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      platform_settings: {
        Row: {
          delivery_mode: string
          id: boolean
          updated_at: string
        }
        Insert: {
          delivery_mode?: string
          id?: boolean
          updated_at?: string
        }
        Update: {
          delivery_mode?: string
          id?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
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
      apply_courier_choice: {
        Args: { p_automatic: boolean; p_offer_id: string; p_order_id: string }
        Returns: boolean
      }
      assert_my_favorite_courier: {
        Args: { p_courier_id: string }
        Returns: undefined
      }
      assert_valid_favorite_courier: {
        Args: { p_business_id: string; p_courier_id: string }
        Returns: undefined
      }
      build_public_menu: { Args: { p_business_id: string }; Returns: Json }
      business_assign_courier: {
        Args: { p_courier_id: string; p_note?: string; p_order_id: string }
        Returns: undefined
      }
      business_confirm_settlement: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      business_delivery_options: { Args: never; Returns: Json }
      business_has_mp: { Args: { p_business_id: string }; Returns: boolean }
      business_order_offers: { Args: never; Returns: Json }
      business_self_delivery: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      clean_item_note: { Args: { p_note: string }; Returns: string }
      confirm_order_payment: {
        Args: {
          p_amount: number
          p_order_id: string
          p_payment_id: string
          p_status: string
        }
        Returns: string
      }
      courier_available_orders: { Args: never; Returns: Json }
      courier_covers_my_zones: {
        Args: { p_courier_id: string }
        Returns: boolean
      }
      courier_decline_order: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      courier_make_offer: {
        Args: { p_order_id: string; p_price: number; p_reason?: string }
        Returns: undefined
      }
      courier_mark_settled: { Args: { p_order_id: string }; Returns: undefined }
      courier_offers_deadline: { Args: { p_order_id: string }; Returns: string }
      courier_offers_notice_window: { Args: never; Returns: string }
      courier_offers_window: { Args: never; Returns: string }
      courier_orders: { Args: { p_since?: string }; Returns: Json }
      courier_return_order: {
        Args: { p_order_id: string; p_reason: string }
        Returns: undefined
      }
      courier_take_order: { Args: { p_order_id: string }; Returns: undefined }
      courier_sees_order: {
        Args: { p_courier_id: string; p_order_id: string }
        Returns: boolean
      }
      courier_set_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: undefined
      }
      courier_withdraw_offer: {
        Args: { p_order_id: string }
        Returns: undefined
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
      create_courier_with_user: {
        Args: { p_name: string; p_user_id: string; p_whatsapp: string }
        Returns: string
      }
      create_manual_order: {
        Args: {
          p_business_id: string
          p_courier_mode?: string
          p_customer_name: string
          p_customer_phone?: string
          p_delivery: string
          p_delivery_address?: string
          p_delivery_zone?: string
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
          p_customer_phone?: string
          p_delivery: string
          p_delivery_address?: string
          p_delivery_zone?: string
          p_items: Json
          p_notes: string
          p_payment: string
          p_preorder?: boolean
          p_scheduled_for?: string
          p_slug: string
        }
        Returns: Json
      }
      create_public_order_base: {
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
      default_courier_id: { Args: never; Returns: string }
      default_images_unmatched: {
        Args: never
        Returns: {
          business_count: number
          example_name: string
          normalized_name: string
          product_count: number
        }[]
      }
      delete_delivery_zone: { Args: { p_zone_id: string }; Returns: string }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      effective_delivery_mode: { Args: { p_business_id: string }; Returns: string }
      effective_favorite_courier: {
        Args: { p_business: string }
        Returns: string
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
      menu_preview: { Args: { p_business_id: string }; Returns: Json }
      my_courier_business_id: { Args: never; Returns: string }
      my_courier_id: { Args: never; Returns: string }
      new_order_reminder_interval: { Args: never; Returns: string }
      new_order_reminder_max: { Args: never; Returns: number }
      new_tracking_code: { Args: never; Returns: string }
      next_order_number: { Args: { p_business_id: string }; Returns: number }
      no_offers_alert_window: { Args: never; Returns: string }
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
      promotion_remaining: { Args: { p_promotion_id: string }; Returns: number }
      promotion_sold: { Args: { p_promotion_id: string }; Returns: number }
      promotion_stock_stats: {
        Args: { p_business_id: string }
        Returns: {
          promotion_id: string
          remaining: number
          sold: number
        }[]
      }
      public_business_pdf: {
        Args: { p_slug: string; p_via_path?: boolean }
        Returns: Json
      }
      platform_searching_orders: { Args: never; Returns: number }
      public_choose_courier: {
        Args: { p_code: string; p_offer_id: string; p_price?: number }
        Returns: undefined
      }
      public_delivery_zones: { Args: { p_slug: string }; Returns: Json }
      public_menu: {
        Args: { p_slug: string; p_static?: boolean; p_via_path?: boolean }
        Returns: Json
      }
      public_order_delivery: { Args: { p_code: string }; Returns: Json }
      public_order_tracking: { Args: { p_code: string }; Returns: Json }
      resolve_order_lines: {
        Args: {
          p_allow_free: boolean
          p_allow_notes: boolean
          p_business_id: string
          p_items: Json
          p_max_quantity: number
        }
        Returns: Json
      }
      resolve_order_options: {
        Args: { p_business_id: string; p_options: Json; p_product_id: string }
        Returns: Json
      }
      run_order_timers: { Args: never; Returns: undefined }
      save_business_settings: {
        Args: {
          p_address: string
          p_allow_item_notes?: boolean
          p_allow_scheduled_orders: boolean
          p_business_id: string
          p_closed_message: string
          p_default_prep_minutes?: number
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
          p_show_prep_time?: boolean
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
      save_delivery_preferences: {
        Args: { p_favorite: string; p_zone_ids: string[] }
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
          p_image_product_id?: string
          p_image_url?: string
          p_name: string
          p_price: number
          p_product_ids: string[]
          p_stock?: number
          p_type: string
          p_valid_until?: string
        }
        Returns: string
      }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_p256dh: string
          p_user_agent?: string
        }
        Returns: undefined
      }
      set_courier_preferences: {
        Args: { p_favorite: string }
        Returns: undefined
      }
      set_order_prep: {
        Args: {
          p_order_id: string
          p_ready_in_minutes: number
          p_reason?: string
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
      settle_courier_offers: {
        Args: { p_order_id: string }
        Returns: undefined
      }
      settle_due_courier_offers: { Args: never; Returns: undefined }
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
      suggested_prep_minutes: {
        Args: { p_business_id: string }
        Returns: number
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
