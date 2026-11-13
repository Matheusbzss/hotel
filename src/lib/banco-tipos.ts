// Tipos das tabelas do banco (Supabase), gerados pelo próprio Supabase a partir das migrações.
// Não edite à mão: depois de cada migração nova, gere de novo pelo conector do Supabase.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      avaliacoes: {
        Row: {
          cidade: string | null
          criado_em: string
          data_avaliacao: string
          foto: string | null
          id: string
          idioma: string | null
          lugar: string | null
          nome: string
          nota: number | null
          origem: string
          origem_url: string | null
          pais: string | null
          produto_slug: string | null
          publicada: boolean
          sobre: string
          texto: string
          titulo: string | null
        }
        Insert: {
          cidade?: string | null
          criado_em?: string
          data_avaliacao: string
          foto?: string | null
          id?: string
          idioma?: string | null
          lugar?: string | null
          nome: string
          nota?: number | null
          origem: string
          origem_url?: string | null
          pais?: string | null
          produto_slug?: string | null
          publicada?: boolean
          sobre?: string
          texto: string
          titulo?: string | null
        }
        Update: {
          cidade?: string | null
          criado_em?: string
          data_avaliacao?: string
          foto?: string | null
          id?: string
          idioma?: string | null
          lugar?: string | null
          nome?: string
          nota?: number | null
          origem?: string
          origem_url?: string | null
          pais?: string | null
          produto_slug?: string | null
          publicada?: boolean
          sobre?: string
          texto?: string
          titulo?: string | null
        }
        Relationships: []
      }
      cambio_dolar: {
        Row: {
          buscado_em: string
          data_ptax: string
          fonte: string
          id: string
          taxa: number
        }
        Insert: {
          buscado_em?: string
          data_ptax: string
          fonte: string
          id?: string
          taxa: number
        }
        Update: {
          buscado_em?: string
          data_ptax?: string
          fonte?: string
          id?: string
          taxa?: number
        }
        Relationships: []
      }
      carrinhos: {
        Row: {
          atualizado_em: string
          checkout_em: string | null
          criado_em: string
          email: string | null
          id: string
          idioma: string
          itens: Json
          origem_utm: Json
          pedido_id: string | null
          token: string
        }
        Insert: {
          atualizado_em?: string
          checkout_em?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          idioma?: string
          itens?: Json
          origem_utm?: Json
          pedido_id?: string | null
          token: string
        }
        Update: {
          atualizado_em?: string
          checkout_em?: string | null
          criado_em?: string
          email?: string | null
          id?: string
          idioma?: string
          itens?: Json
          origem_utm?: Json
          pedido_id?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "carrinhos_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      carrinhos_lembretes: {
        Row: {
          carrinho_id: string
          criado_em: string
          lembrete_1_em: string | null
          lembrete_2_em: string | null
          voltou_em: string | null
          voltou_lembrete: number | null
        }
        Insert: {
          carrinho_id: string
          criado_em?: string
          lembrete_1_em?: string | null
          lembrete_2_em?: string | null
          voltou_em?: string | null
          voltou_lembrete?: number | null
        }
        Update: {
          carrinho_id?: string
          criado_em?: string
          lembrete_1_em?: string | null
          lembrete_2_em?: string | null
          voltou_em?: string | null
          voltou_lembrete?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "carrinhos_lembretes_carrinho_id_fkey"
            columns: ["carrinho_id"]
            isOneToOne: true
            referencedRelation: "carrinhos"
            referencedColumns: ["id"]
          },
        ]
      }
      casas: {
        Row: {
          ativo: boolean
          atualizado_em: string
          bairro: Json | null
          banheiros: number | null
          camas: Json
          cancelamento: Json
          capacidade: number
          caucao_centavos: number | null
          check_in: string | null
          check_out: string | null
          cidade: string
          comodidades: Json
          criado_em: string
          descricao: Json | null
          diaria_base_centavos: number | null
          endereco: string | null
          fotos: Json
          ical_erro: string | null
          ical_sincronizado_em: string | null
          ical_token: string
          ical_url: string | null
          id: string
          lat_aprox: number | null
          lng_aprox: number | null
          minimo_noites: number
          nome: Json
          quartos: number
          regras: Json
          resumo: Json | null
          slug: string
          suites: number | null
          taxa_limpeza_centavos: number | null
        }
        Insert: {
          ativo?: boolean
          atualizado_em?: string
          bairro?: Json | null
          banheiros?: number | null
          camas?: Json
          cancelamento?: Json
          capacidade: number
          caucao_centavos?: number | null
          check_in?: string | null
          check_out?: string | null
          cidade: string
          comodidades?: Json
          criado_em?: string
          descricao?: Json | null
          diaria_base_centavos?: number | null
          endereco?: string | null
          fotos?: Json
          ical_erro?: string | null
          ical_sincronizado_em?: string | null
          ical_token?: string
          ical_url?: string | null
          id?: string
          lat_aprox?: number | null
          lng_aprox?: number | null
          minimo_noites?: number
          nome: Json
          quartos: number
          regras?: Json
          resumo?: Json | null
          slug: string
          suites?: number | null
          taxa_limpeza_centavos?: number | null
        }
        Update: {
          ativo?: boolean
          atualizado_em?: string
          bairro?: Json | null
          banheiros?: number | null
          camas?: Json
          cancelamento?: Json
          capacidade?: number
          caucao_centavos?: number | null
          check_in?: string | null
          check_out?: string | null
          cidade?: string
          comodidades?: Json
          criado_em?: string
          descricao?: Json | null
          diaria_base_centavos?: number | null
          endereco?: string | null
          fotos?: Json
          ical_erro?: string | null
          ical_sincronizado_em?: string | null
          ical_token?: string
          ical_url?: string | null
          id?: string
          lat_aprox?: number | null
          lng_aprox?: number | null
          minimo_noites?: number
          nome?: Json
          quartos?: number
          regras?: Json
          resumo?: Json | null
          slug?: string
          suites?: number | null
          taxa_limpeza_centavos?: number | null
        }
        Relationships: []
      }
      casas_bloqueios: {
        Row: {
          casa_id: string
          criado_em: string
          fim: string
          id: string
          inicio: string
          item_pedido_id: string | null
          origem: string
          referencia: string | null
        }
        Insert: {
          casa_id: string
          criado_em?: string
          fim: string
          id?: string
          inicio: string
          item_pedido_id?: string | null
          origem: string
          referencia?: string | null
        }
        Update: {
          casa_id?: string
          criado_em?: string
          fim?: string
          id?: string
          inicio?: string
          item_pedido_id?: string | null
          origem?: string
          referencia?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "casas_bloqueios_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "casas_bloqueios_item_pedido_id_fkey"
            columns: ["item_pedido_id"]
            isOneToOne: false
            referencedRelation: "itens_pedido"
            referencedColumns: ["id"]
          },
        ]
      }
      casas_tarifas: {
        Row: {
          casa_id: string
          diaria_centavos: number
          fim: string
          id: string
          inicio: string
          minimo_noites: number | null
          nome: Json | null
          tipo: string
        }
        Insert: {
          casa_id: string
          diaria_centavos: number
          fim: string
          id?: string
          inicio: string
          minimo_noites?: number | null
          nome?: Json | null
          tipo?: string
        }
        Update: {
          casa_id?: string
          diaria_centavos?: number
          fim?: string
          id?: string
          inicio?: string
          minimo_noites?: number | null
          nome?: Json | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "casas_tarifas_casa_id_fkey"
            columns: ["casa_id"]
            isOneToOne: false
            referencedRelation: "casas"
            referencedColumns: ["id"]
          },
        ]
      }
      cotacoes: {
        Row: {
          atualizado_em: string
          criado_em: string
          dados: Json
          email: string
          id: string
          idioma: string
          mensagem: string | null
          nome: string
          origem_utm: Json
          status: string
          telefone: string | null
          tipo: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          dados?: Json
          email: string
          id?: string
          idioma?: string
          mensagem?: string | null
          nome: string
          origem_utm?: Json
          status?: string
          telefone?: string | null
          tipo: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          dados?: Json
          email?: string
          id?: string
          idioma?: string
          mensagem?: string | null
          nome?: string
          origem_utm?: Json
          status?: string
          telefone?: string | null
          tipo?: string
        }
        Relationships: []
      }
      emails_sem_lembrete: {
        Row: {
          criado_em: string
          email: string
        }
        Insert: {
          criado_em?: string
          email: string
        }
        Update: {
          criado_em?: string
          email?: string
        }
        Relationships: []
      }
      itens_pedido: {
        Row: {
          cidade: string | null
          criado_em: string
          data: string
          data_fim: string | null
          detalhes: Json
          horario: string | null
          id: string
          opcao: Json | null
          pedido_id: string
          pessoas: Json
          preco_centavos: number
          produto_nome: string
          produto_slug: string
          sinal_centavos: number | null
          status: string
          tipo: string
          unidades: number
          voucher_codigo: string | null
        }
        Insert: {
          cidade?: string | null
          criado_em?: string
          data: string
          data_fim?: string | null
          detalhes?: Json
          horario?: string | null
          id?: string
          opcao?: Json | null
          pedido_id: string
          pessoas?: Json
          preco_centavos: number
          produto_nome: string
          produto_slug: string
          sinal_centavos?: number | null
          status?: string
          tipo: string
          unidades?: number
          voucher_codigo?: string | null
        }
        Update: {
          cidade?: string | null
          criado_em?: string
          data?: string
          data_fim?: string | null
          detalhes?: Json
          horario?: string | null
          id?: string
          opcao?: Json | null
          pedido_id?: string
          pessoas?: Json
          preco_centavos?: number
          produto_nome?: string
          produto_slug?: string
          sinal_centavos?: number | null
          status?: string
          tipo?: string
          unidades?: number
          voucher_codigo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itens_pedido_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      limites_ip: {
        Row: {
          chave: string
          contagem: number
          janela_inicio: string
        }
        Insert: {
          chave: string
          contagem?: number
          janela_inicio?: string
        }
        Update: {
          chave?: string
          contagem?: number
          janela_inicio?: string
        }
        Relationships: []
      }
      pagamentos_eventos: {
        Row: {
          id: string
          payload: Json | null
          pedido_codigo: string | null
          processado_em: string | null
          recebido_em: string
          tipo: string
        }
        Insert: {
          id: string
          payload?: Json | null
          pedido_codigo?: string | null
          processado_em?: string | null
          recebido_em?: string
          tipo: string
        }
        Update: {
          id?: string
          payload?: Json | null
          pedido_codigo?: string | null
          processado_em?: string | null
          recebido_em?: string
          tipo?: string
        }
        Relationships: []
      }
      pedidos: {
        Row: {
          atualizado_em: string
          cliente_documento: string | null
          cliente_documento_tipo: string | null
          cliente_email: string
          cliente_nome: string
          cliente_pais: string | null
          cliente_telefone: string
          codigo: string
          criado_em: string
          desconto_centavos: number
          id: string
          idioma: string
          metodo_pagamento: string | null
          moeda: string
          observacoes: string | null
          origem_utm: Json
          pagamento: Json
          pagamento_externo_id: string | null
          pago_em: string | null
          payment_intent_id: string | null
          provedor: string
          reembolso_centavos: number
          status: string
          subtotal_centavos: number
          token: string
          total_centavos: number
          total_pix_centavos: number | null
        }
        Insert: {
          atualizado_em?: string
          cliente_documento?: string | null
          cliente_documento_tipo?: string | null
          cliente_email: string
          cliente_nome: string
          cliente_pais?: string | null
          cliente_telefone: string
          codigo: string
          criado_em?: string
          desconto_centavos?: number
          id?: string
          idioma?: string
          metodo_pagamento?: string | null
          moeda?: string
          observacoes?: string | null
          origem_utm?: Json
          pagamento?: Json
          pagamento_externo_id?: string | null
          pago_em?: string | null
          payment_intent_id?: string | null
          provedor: string
          reembolso_centavos?: number
          status?: string
          subtotal_centavos: number
          token: string
          total_centavos: number
          total_pix_centavos?: number | null
        }
        Update: {
          atualizado_em?: string
          cliente_documento?: string | null
          cliente_documento_tipo?: string | null
          cliente_email?: string
          cliente_nome?: string
          cliente_pais?: string | null
          cliente_telefone?: string
          codigo?: string
          criado_em?: string
          desconto_centavos?: number
          id?: string
          idioma?: string
          metodo_pagamento?: string | null
          moeda?: string
          observacoes?: string | null
          origem_utm?: Json
          pagamento?: Json
          pagamento_externo_id?: string | null
          pago_em?: string | null
          payment_intent_id?: string | null
          provedor?: string
          reembolso_centavos?: number
          status?: string
          subtotal_centavos?: number
          token?: string
          total_centavos?: number
          total_pix_centavos?: number | null
        }
        Relationships: []
      }
      pedidos_historico: {
        Row: {
          em: string
          evento: string
          id: string
          item_pedido_id: string | null
          pedido_id: string
        }
        Insert: {
          em?: string
          evento: string
          id?: string
          item_pedido_id?: string | null
          pedido_id: string
        }
        Update: {
          em?: string
          evento?: string
          id?: string
          item_pedido_id?: string | null
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_historico_item_pedido_id_fkey"
            columns: ["item_pedido_id"]
            isOneToOne: false
            referencedRelation: "itens_pedido"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_historico_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
        ]
      }
      saude: {
        Row: {
          criado_em: string
          id: string
        }
        Insert: {
          criado_em?: string
          id?: string
        }
        Update: {
          criado_em?: string
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      atualizar_item: {
        Args: { p_evento: string; p_status: string; p_voucher: string }
        Returns: boolean
      }
      atualizar_reserva: {
        Args: {
          p_historico: Json
          p_item: Json
          p_pedido: Json
          p_versao: string
        }
        Returns: boolean
      }
      contar_limite: {
        Args: { p_chave: string; p_janela_segundos: number }
        Returns: number
      }
      criar_pedido: {
        Args: { p_historico: Json; p_itens: Json; p_pedido: Json }
        Returns: boolean
      }
      criar_reserva: {
        Args: { p_historico: Json; p_item: Json; p_pedido: Json }
        Returns: boolean
      }
      trocar_bloqueios_airbnb: {
        Args: { p_bloqueios: Json; p_casa: string }
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
  public: {
    Enums: {},
  },
} as const
