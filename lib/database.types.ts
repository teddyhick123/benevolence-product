export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      acknowledgment_letters: {
        Row: {
          body: string
          contribution_ids: string[]
          created_at: string
          delivery_method: string
          donor_id: string
          id: string
          letter_date: string
          letter_type: string
          notes: string | null
          org_id: string
          recipient_email: string | null
          sent_at: string | null
          sent_by: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
          subject: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          body: string
          contribution_ids?: string[]
          created_at?: string
          delivery_method?: string
          donor_id: string
          id?: string
          letter_date?: string
          letter_type?: string
          notes?: string | null
          org_id: string
          recipient_email?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          subject?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          contribution_ids?: string[]
          created_at?: string
          delivery_method?: string
          donor_id?: string
          id?: string
          letter_date?: string
          letter_type?: string
          notes?: string | null
          org_id?: string
          recipient_email?: string | null
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          subject?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "acknowledgment_letters_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acknowledgment_letters_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "v_contribution_with_donor"
            referencedColumns: ["donor_id"]
          },
          {
            foreignKeyName: "acknowledgment_letters_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["donor_id"]
          },
          {
            foreignKeyName: "acknowledgment_letters_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acknowledgment_letters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acknowledgment_letters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acknowledgment_letters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "acknowledgment_letters_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "acknowledgment_letters_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "letter_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_actions: {
        Row: {
          action_type: string
          ai_reasoning: string | null
          batch_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          initiated_by: string
          operation_data: Json
          portfolio_id: string
          sequence_order: number
          session_id: string
          source: string | null
          status: string
          updated_at: string
          user_id: string
          user_prompt: string | null
        }
        Insert: {
          action_type: string
          ai_reasoning?: string | null
          batch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          initiated_by?: string
          operation_data?: Json
          portfolio_id: string
          sequence_order?: number
          session_id: string
          source?: string | null
          status?: string
          updated_at?: string
          user_id: string
          user_prompt?: string | null
        }
        Update: {
          action_type?: string
          ai_reasoning?: string | null
          batch_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          initiated_by?: string
          operation_data?: Json
          portfolio_id?: string
          sequence_order?: number
          session_id?: string
          source?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          user_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_actions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_actions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "ai_actions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_messages: {
        Row: {
          content: Json
          content_blocks: Json | null
          created_at: string
          id: string
          portfolio_id: string
          role: string
          sequence_no: number
          session_id: string
          turn_id: string
          user_id: string
          widgets: Json | null
        }
        Insert: {
          content: Json
          content_blocks?: Json | null
          created_at?: string
          id?: string
          portfolio_id: string
          role: string
          sequence_no?: never
          session_id: string
          turn_id: string
          user_id: string
          widgets?: Json | null
        }
        Update: {
          content?: Json
          content_blocks?: Json | null
          created_at?: string
          id?: string
          portfolio_id?: string
          role?: string
          sequence_no?: never
          session_id?: string
          turn_id?: string
          user_id?: string
          widgets?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_turn_id_session_id_portfolio_id_user_id_fkey"
            columns: ["turn_id", "session_id", "portfolio_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_turns"
            referencedColumns: ["id", "session_id", "portfolio_id", "user_id"]
          },
        ]
      }
      ai_sessions: {
        Row: {
          context: Json
          created_at: string
          ended_at: string | null
          id: string
          portfolio_id: string
          started_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: Json
          created_at?: string
          ended_at?: string | null
          id?: string
          portfolio_id: string
          started_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: Json
          created_at?: string
          ended_at?: string | null
          id?: string
          portfolio_id?: string
          started_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_sessions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_sessions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      ai_turns: {
        Row: {
          completed_at: string | null
          created_at: string
          execution_plan: Json | null
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          portfolio_id: string
          request_id: string
          response: Json | null
          session_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          execution_plan?: Json | null
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          portfolio_id: string
          request_id: string
          response?: Json | null
          session_id: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          execution_plan?: Json | null
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          portfolio_id?: string
          request_id?: string
          response?: Json | null
          session_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_turns_session_id_portfolio_id_user_id_fkey"
            columns: ["session_id", "portfolio_id", "user_id"]
            isOneToOne: false
            referencedRelation: "ai_sessions"
            referencedColumns: ["id", "portfolio_id", "user_id"]
          },
        ]
      }
      ai_usage_log: {
        Row: {
          audio_input_tokens: number
          audio_output_tokens: number
          cached_input_tokens: number
          completed_at: string
          connection_id: string | null
          connector: string
          cost_currency: string | null
          created_at: string
          deployment_id: string | null
          error_code: string | null
          id: string
          input_tokens: number
          latency_ms: number
          model_vendor: string | null
          operation: string
          org_id: string | null
          output_tokens: number
          policy_hash: string | null
          policy_snapshot: Json
          portfolio_id: string | null
          provider_request_id: string | null
          reasoning_tokens: number
          reported_cost: number | null
          requested_model: string
          resolved_model: string | null
          resolved_provider: string | null
          route_id: string | null
          scope_kind: string
          session_id: string | null
          started_at: string
          status: string
          target_position: number
          total_tokens: number | null
          turn_id: string | null
          user_id: string | null
          workload_id: string
        }
        Insert: {
          audio_input_tokens?: number
          audio_output_tokens?: number
          cached_input_tokens?: number
          completed_at?: string
          connection_id?: string | null
          connector?: string
          cost_currency?: string | null
          created_at?: string
          deployment_id?: string | null
          error_code?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number
          model_vendor?: string | null
          operation?: string
          org_id?: string | null
          output_tokens?: number
          policy_hash?: string | null
          policy_snapshot?: Json
          portfolio_id?: string | null
          provider_request_id?: string | null
          reasoning_tokens?: number
          reported_cost?: number | null
          requested_model: string
          resolved_model?: string | null
          resolved_provider?: string | null
          route_id?: string | null
          scope_kind?: string
          session_id?: string | null
          started_at?: string
          status?: string
          target_position?: number
          total_tokens?: number | null
          turn_id?: string | null
          user_id?: string | null
          workload_id?: string
        }
        Update: {
          audio_input_tokens?: number
          audio_output_tokens?: number
          cached_input_tokens?: number
          completed_at?: string
          connection_id?: string | null
          connector?: string
          cost_currency?: string | null
          created_at?: string
          deployment_id?: string | null
          error_code?: string | null
          id?: string
          input_tokens?: number
          latency_ms?: number
          model_vendor?: string | null
          operation?: string
          org_id?: string | null
          output_tokens?: number
          policy_hash?: string | null
          policy_snapshot?: Json
          portfolio_id?: string | null
          provider_request_id?: string | null
          reasoning_tokens?: number
          reported_cost?: number | null
          requested_model?: string
          resolved_model?: string | null
          resolved_provider?: string | null
          route_id?: string | null
          scope_kind?: string
          session_id?: string | null
          started_at?: string
          status?: string
          target_position?: number
          total_tokens?: number | null
          turn_id?: string | null
          user_id?: string | null
          workload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "org_ai_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "org_ai_deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "ai_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "ai_usage_log_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "ai_usage_log_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "org_ai_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "ai_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_insights: {
        Row: {
          action_taken: boolean
          action_taken_at: string | null
          category: string
          change_percent: number | null
          comparison_value: number | null
          created_at: string
          data_context: Json
          description: string
          dismissed_at: string | null
          dismissed_by: string | null
          expires_at: string | null
          holding_id: string | null
          id: string
          insight_type: string
          is_active: boolean
          metric_code: string | null
          metric_value: number | null
          portfolio_id: string
          severity: string | null
          suggested_actions: Json
          title: string
          updated_at: string
        }
        Insert: {
          action_taken?: boolean
          action_taken_at?: string | null
          category: string
          change_percent?: number | null
          comparison_value?: number | null
          created_at?: string
          data_context?: Json
          description: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          expires_at?: string | null
          holding_id?: string | null
          id?: string
          insight_type: string
          is_active?: boolean
          metric_code?: string | null
          metric_value?: number | null
          portfolio_id: string
          severity?: string | null
          suggested_actions?: Json
          title: string
          updated_at?: string
        }
        Update: {
          action_taken?: boolean
          action_taken_at?: string | null
          category?: string
          change_percent?: number | null
          comparison_value?: number | null
          created_at?: string
          data_context?: Json
          description?: string
          dismissed_at?: string | null
          dismissed_by?: string | null
          expires_at?: string | null
          holding_id?: string | null
          id?: string
          insight_type?: string
          is_active?: boolean
          metric_code?: string | null
          metric_value?: number | null
          portfolio_id?: string
          severity?: string | null
          suggested_actions?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "analytics_insights_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_insights_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          created_at: string
          id: number
          ip_address: unknown
          metadata: Json | null
          new_values: Json | null
          old_values: Json | null
          org_id: string | null
          portfolio_id: string | null
          record_id: string | null
          table_name: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: number
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          org_id?: string | null
          portfolio_id?: string | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          created_at?: string
          id?: number
          ip_address?: unknown
          metadata?: Json | null
          new_values?: Json | null
          old_values?: Json | null
          org_id?: string | null
          portfolio_id?: string | null
          record_id?: string | null
          table_name?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      benchmark_data: {
        Row: {
          benchmark_key: string
          benchmark_name: string
          benchmark_type: string
          confidence_level: string | null
          created_at: string
          data_source: string | null
          data_year: number
          id: string
          last_updated_at: string
          metric_code: string
          metric_value: number
          percentile_25: number | null
          percentile_50: number | null
          percentile_75: number | null
          period_end: string | null
          period_start: string | null
          sample_size: number | null
          std_deviation: number | null
          unit: string | null
        }
        Insert: {
          benchmark_key: string
          benchmark_name: string
          benchmark_type: string
          confidence_level?: string | null
          created_at?: string
          data_source?: string | null
          data_year: number
          id?: string
          last_updated_at?: string
          metric_code: string
          metric_value: number
          percentile_25?: number | null
          percentile_50?: number | null
          percentile_75?: number | null
          period_end?: string | null
          period_start?: string | null
          sample_size?: number | null
          std_deviation?: number | null
          unit?: string | null
        }
        Update: {
          benchmark_key?: string
          benchmark_name?: string
          benchmark_type?: string
          confidence_level?: string | null
          created_at?: string
          data_source?: string | null
          data_year?: number
          id?: string
          last_updated_at?: string
          metric_code?: string
          metric_value?: number
          percentile_25?: number | null
          percentile_50?: number | null
          percentile_75?: number | null
          period_end?: string | null
          period_start?: string | null
          sample_size?: number | null
          std_deviation?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      builder_delivery_records: {
        Row: {
          branch_name: string | null
          commit_sha: string | null
          created_at: string
          environment: string | null
          id: string
          payload_hash: string | null
          pr_number: number | null
          pr_url: string | null
          proposal_id: string
          provider: string
          provider_event_id: string | null
          revision_id: string
          status: string
          updated_at: string
        }
        Insert: {
          branch_name?: string | null
          commit_sha?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          payload_hash?: string | null
          pr_number?: number | null
          pr_url?: string | null
          proposal_id: string
          provider: string
          provider_event_id?: string | null
          revision_id: string
          status: string
          updated_at?: string
        }
        Update: {
          branch_name?: string | null
          commit_sha?: string | null
          created_at?: string
          environment?: string | null
          id?: string
          payload_hash?: string | null
          pr_number?: number | null
          pr_url?: string | null
          proposal_id?: string
          provider?: string
          provider_event_id?: string | null
          revision_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_delivery_records_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "builder_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_delivery_records_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "builder_proposal_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          org_id: string
          payload: Json | null
          request_text: string | null
          tool_name: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          org_id: string
          payload?: Json | null
          request_text?: string | null
          tool_name?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          org_id?: string
          payload?: Json | null
          request_text?: string | null
          tool_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "builder_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "builder_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      builder_proposal_revisions: {
        Row: {
          artifact_prefix: string
          authoritative_diff_artifact_key: string | null
          authoritative_diff_hash: string | null
          base_commit_sha: string | null
          context_hash: string | null
          created_at: string
          created_by: string | null
          diff_hash: string | null
          file_count: number | null
          head_commit_sha: string | null
          id: string
          kind: string
          manifest_hash: string | null
          parent_revision_id: string | null
          progress: Json | null
          proposal_id: string
          revision_number: number
          total_bytes: number | null
          updated_at: string
        }
        Insert: {
          artifact_prefix: string
          authoritative_diff_artifact_key?: string | null
          authoritative_diff_hash?: string | null
          base_commit_sha?: string | null
          context_hash?: string | null
          created_at?: string
          created_by?: string | null
          diff_hash?: string | null
          file_count?: number | null
          head_commit_sha?: string | null
          id?: string
          kind: string
          manifest_hash?: string | null
          parent_revision_id?: string | null
          progress?: Json | null
          proposal_id: string
          revision_number: number
          total_bytes?: number | null
          updated_at?: string
        }
        Update: {
          artifact_prefix?: string
          authoritative_diff_artifact_key?: string | null
          authoritative_diff_hash?: string | null
          base_commit_sha?: string | null
          context_hash?: string | null
          created_at?: string
          created_by?: string | null
          diff_hash?: string | null
          file_count?: number | null
          head_commit_sha?: string | null
          id?: string
          kind?: string
          manifest_hash?: string | null
          parent_revision_id?: string | null
          progress?: Json | null
          proposal_id?: string
          revision_number?: number
          total_bytes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_proposal_revisions_parent_revision_id_fkey"
            columns: ["parent_revision_id"]
            isOneToOne: false
            referencedRelation: "builder_proposal_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_proposal_revisions_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "builder_proposals"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_proposals: {
        Row: {
          code_state: string | null
          config_patch: Json | null
          created_at: string
          current_revision_id: string | null
          id: string
          org_id: string
          plan_content: Json | null
          proposal_type: string
          rejected_reason: string | null
          request_text: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_notes: string | null
          status: string | null
          updated_at: string
        }
        Insert: {
          code_state?: string | null
          config_patch?: Json | null
          created_at?: string
          current_revision_id?: string | null
          id?: string
          org_id: string
          plan_content?: Json | null
          proposal_type: string
          rejected_reason?: string | null
          request_text: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          code_state?: string | null
          config_patch?: Json | null
          created_at?: string
          current_revision_id?: string | null
          id?: string
          org_id?: string
          plan_content?: Json | null
          proposal_type?: string
          rejected_reason?: string | null
          request_text?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_notes?: string | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_proposals_current_revision_fkey"
            columns: ["current_revision_id"]
            isOneToOne: false
            referencedRelation: "builder_proposal_revisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "builder_proposals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      builder_review_attempts: {
        Row: {
          attempt_number: number
          completed_at: string | null
          decision_reason: string | null
          id: string
          policy_version: string
          proposal_id: string
          required_check_keys: string[]
          revision_id: string
          started_at: string
          status: string
          summary_score: number | null
          trigger: string
        }
        Insert: {
          attempt_number: number
          completed_at?: string | null
          decision_reason?: string | null
          id?: string
          policy_version: string
          proposal_id: string
          required_check_keys?: string[]
          revision_id: string
          started_at?: string
          status?: string
          summary_score?: number | null
          trigger: string
        }
        Update: {
          attempt_number?: number
          completed_at?: string | null
          decision_reason?: string | null
          id?: string
          policy_version?: string
          proposal_id?: string
          required_check_keys?: string[]
          revision_id?: string
          started_at?: string
          status?: string
          summary_score?: number | null
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_review_attempts_proposal_id_fkey"
            columns: ["proposal_id"]
            isOneToOne: false
            referencedRelation: "builder_proposals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_review_attempts_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "builder_proposal_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_review_findings: {
        Row: {
          category: string | null
          created_at: string
          evidence: string
          file_path: string | null
          id: string
          line_end: number | null
          line_start: number | null
          recommendation: string | null
          review_attempt_id: string
          reviewer_kind: string
          rule_id: string | null
          severity: string
          state: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          evidence: string
          file_path?: string | null
          id?: string
          line_end?: number | null
          line_start?: number | null
          recommendation?: string | null
          review_attempt_id: string
          reviewer_kind: string
          rule_id?: string | null
          severity: string
          state?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          evidence?: string
          file_path?: string | null
          id?: string
          line_end?: number | null
          line_start?: number | null
          recommendation?: string | null
          review_attempt_id?: string
          reviewer_kind?: string
          rule_id?: string | null
          severity?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_review_findings_review_attempt_id_fkey"
            columns: ["review_attempt_id"]
            isOneToOne: false
            referencedRelation: "builder_review_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      builder_sessions: {
        Row: {
          created_at: string
          id: string
          messages: Json
          org_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages?: Json
          org_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages?: Json
          org_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "builder_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      builder_verification_runs: {
        Row: {
          check_key: string
          command_version: string | null
          completed_at: string | null
          created_at: string
          duration_ms: number | null
          evidence_hash: string | null
          exit_code: number | null
          id: string
          log_artifact_key: string | null
          review_attempt_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          check_key: string
          command_version?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          evidence_hash?: string | null
          exit_code?: number | null
          id?: string
          log_artifact_key?: string | null
          review_attempt_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          check_key?: string
          command_version?: string | null
          completed_at?: string | null
          created_at?: string
          duration_ms?: number | null
          evidence_hash?: string | null
          exit_code?: number | null
          id?: string
          log_artifact_key?: string | null
          review_attempt_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "builder_verification_runs_review_attempt_id_fkey"
            columns: ["review_attempt_id"]
            isOneToOne: false
            referencedRelation: "builder_review_attempts"
            referencedColumns: ["id"]
          },
        ]
      }
      charities: {
        Row: {
          address_line1: string | null
          also_known_as: string | null
          candid_seal: string | null
          charity_navigator_rating: number | null
          charity_navigator_score: number | null
          city: string | null
          country: string | null
          created_at: string
          deductibility_code: string | null
          ein: string
          email: string | null
          fiscal_year: number | null
          foundation_code: string | null
          give_well_top_charity: boolean | null
          id: string
          is_active: boolean | null
          latitude: number | null
          longitude: number | null
          mission: string | null
          name: string
          net_assets: number | null
          ntee_code: string | null
          phone: string | null
          propublica_score: number | null
          ruling_year: number | null
          search_vector: unknown
          state: string | null
          subsection_code: string | null
          total_expenses: number | null
          total_revenue: number | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          also_known_as?: string | null
          candid_seal?: string | null
          charity_navigator_rating?: number | null
          charity_navigator_score?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          deductibility_code?: string | null
          ein: string
          email?: string | null
          fiscal_year?: number | null
          foundation_code?: string | null
          give_well_top_charity?: boolean | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          mission?: string | null
          name: string
          net_assets?: number | null
          ntee_code?: string | null
          phone?: string | null
          propublica_score?: number | null
          ruling_year?: number | null
          search_vector?: unknown
          state?: string | null
          subsection_code?: string | null
          total_expenses?: number | null
          total_revenue?: number | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          also_known_as?: string | null
          candid_seal?: string | null
          charity_navigator_rating?: number | null
          charity_navigator_score?: number | null
          city?: string | null
          country?: string | null
          created_at?: string
          deductibility_code?: string | null
          ein?: string
          email?: string | null
          fiscal_year?: number | null
          foundation_code?: string | null
          give_well_top_charity?: boolean | null
          id?: string
          is_active?: boolean | null
          latitude?: number | null
          longitude?: number | null
          mission?: string | null
          name?: string
          net_assets?: number | null
          ntee_code?: string | null
          phone?: string | null
          propublica_score?: number | null
          ruling_year?: number | null
          search_vector?: unknown
          state?: string | null
          subsection_code?: string | null
          total_expenses?: number | null
          total_revenue?: number | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      charity_rating_cache: {
        Row: {
          charity_id: string
          created_at: string
          expires_at: string
          id: string
          provider: string
          rating_data: Json
          updated_at: string
        }
        Insert: {
          charity_id: string
          created_at?: string
          expires_at?: string
          id?: string
          provider: string
          rating_data?: Json
          updated_at?: string
        }
        Update: {
          charity_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          provider?: string
          rating_data?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "charity_rating_cache_charity_id_fkey"
            columns: ["charity_id"]
            isOneToOne: false
            referencedRelation: "charities"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_profiles: {
        Row: {
          auto_flag_self_dealing: boolean
          created_at: string
          er_grant_tracking: boolean
          fiscal_year_end_day: number | null
          fiscal_year_end_month: number | null
          foundation_type: string | null
          id: string
          notes: string | null
          org_id: string
          registered_states: string[]
          state_of_incorporation: string | null
          updated_at: string
        }
        Insert: {
          auto_flag_self_dealing?: boolean
          created_at?: string
          er_grant_tracking?: boolean
          fiscal_year_end_day?: number | null
          fiscal_year_end_month?: number | null
          foundation_type?: string | null
          id?: string
          notes?: string | null
          org_id: string
          registered_states?: string[]
          state_of_incorporation?: string | null
          updated_at?: string
        }
        Update: {
          auto_flag_self_dealing?: boolean
          created_at?: string
          er_grant_tracking?: boolean
          fiscal_year_end_day?: number | null
          fiscal_year_end_month?: number | null
          foundation_type?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          registered_states?: string[]
          state_of_incorporation?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "compliance_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      contributions_received: {
        Row: {
          acknowledged_at: string | null
          acknowledgment_sent: boolean
          amount: number
          campaign: string | null
          contribution_date: string
          created_at: string
          currency: string
          donor_id: string
          external_id: string | null
          fund_designation: string | null
          gift_type: string
          id: string
          is_pledge: boolean
          is_restricted: boolean
          notes: string | null
          org_id: string
          payment_reference: string | null
          pledge_amount: number | null
          pledge_fulfilled_at: string | null
          pledge_id: string | null
          pledge_installment_id: string | null
          quid_pro_quo_value: number
          receipt_generated_at: string | null
          receipt_number: string | null
          receipt_sent_at: string | null
          receipt_status: string
          receipt_url: string | null
          restriction_purpose: string | null
          source_system: string | null
          tax_deductible_amount: number | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledgment_sent?: boolean
          amount: number
          campaign?: string | null
          contribution_date: string
          created_at?: string
          currency?: string
          donor_id: string
          external_id?: string | null
          fund_designation?: string | null
          gift_type?: string
          id?: string
          is_pledge?: boolean
          is_restricted?: boolean
          notes?: string | null
          org_id: string
          payment_reference?: string | null
          pledge_amount?: number | null
          pledge_fulfilled_at?: string | null
          pledge_id?: string | null
          pledge_installment_id?: string | null
          quid_pro_quo_value?: number
          receipt_generated_at?: string | null
          receipt_number?: string | null
          receipt_sent_at?: string | null
          receipt_status?: string
          receipt_url?: string | null
          restriction_purpose?: string | null
          source_system?: string | null
          tax_deductible_amount?: number | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledgment_sent?: boolean
          amount?: number
          campaign?: string | null
          contribution_date?: string
          created_at?: string
          currency?: string
          donor_id?: string
          external_id?: string | null
          fund_designation?: string | null
          gift_type?: string
          id?: string
          is_pledge?: boolean
          is_restricted?: boolean
          notes?: string | null
          org_id?: string
          payment_reference?: string | null
          pledge_amount?: number | null
          pledge_fulfilled_at?: string | null
          pledge_id?: string | null
          pledge_installment_id?: string | null
          quid_pro_quo_value?: number
          receipt_generated_at?: string | null
          receipt_number?: string | null
          receipt_sent_at?: string | null
          receipt_status?: string
          receipt_url?: string | null
          restriction_purpose?: string | null
          source_system?: string | null
          tax_deductible_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contributions_received_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_received_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "v_contribution_with_donor"
            referencedColumns: ["donor_id"]
          },
          {
            foreignKeyName: "contributions_received_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["donor_id"]
          },
          {
            foreignKeyName: "contributions_received_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_received_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_received_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_received_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "contributions_received_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "contributions_received_pledge_fk"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "pledges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_received_pledge_fk"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "v_pledge_pipeline"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_received_pledge_installment_fk"
            columns: ["pledge_installment_id"]
            isOneToOne: false
            referencedRelation: "pledge_installments"
            referencedColumns: ["id"]
          },
        ]
      }
      cpa_access_logs: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          resource: string | null
          share_link_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          resource?: string | null
          share_link_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          resource?: string | null
          share_link_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cpa_access_logs_share_link_id_fkey"
            columns: ["share_link_id"]
            isOneToOne: false
            referencedRelation: "cpa_share_links"
            referencedColumns: ["id"]
          },
        ]
      }
      cpa_share_links: {
        Row: {
          access_count: number
          cpa_email: string | null
          cpa_firm: string | null
          cpa_name: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          max_accesses: number | null
          notes: string | null
          org_id: string
          permissions: Json
          portfolio_id: string
          revoked_at: string | null
          share_token: string
          tax_years: number[]
          updated_at: string
        }
        Insert: {
          access_count?: number
          cpa_email?: string | null
          cpa_firm?: string | null
          cpa_name?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_accesses?: number | null
          notes?: string | null
          org_id: string
          permissions?: Json
          portfolio_id: string
          revoked_at?: string | null
          share_token: string
          tax_years?: number[]
          updated_at?: string
        }
        Update: {
          access_count?: number
          cpa_email?: string | null
          cpa_firm?: string | null
          cpa_name?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          max_accesses?: number | null
          notes?: string | null
          org_id?: string
          permissions?: Json
          portfolio_id?: string
          revoked_at?: string | null
          share_token?: string
          tax_years?: number[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cpa_share_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpa_share_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpa_share_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "cpa_share_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "cpa_share_links_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cpa_share_links_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      daf_grants: {
        Row: {
          contribution_amount: number
          contribution_date: string
          contribution_type: string | null
          created_at: string
          daf_account_number: string | null
          daf_name: string
          grant_amount: number | null
          grant_date: string | null
          grant_recipient: string | null
          grant_recipient_ein: string | null
          holding_id: string | null
          id: string
          notes: string | null
          org_id: string
          portfolio_id: string
          status: string
          tax_contribution_id: string | null
          updated_at: string
        }
        Insert: {
          contribution_amount: number
          contribution_date: string
          contribution_type?: string | null
          created_at?: string
          daf_account_number?: string | null
          daf_name: string
          grant_amount?: number | null
          grant_date?: string | null
          grant_recipient?: string | null
          grant_recipient_ein?: string | null
          holding_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          portfolio_id: string
          status?: string
          tax_contribution_id?: string | null
          updated_at?: string
        }
        Update: {
          contribution_amount?: number
          contribution_date?: string
          contribution_type?: string | null
          created_at?: string
          daf_account_number?: string | null
          daf_name?: string
          grant_amount?: number | null
          grant_date?: string | null
          grant_recipient?: string | null
          grant_recipient_ein?: string | null
          holding_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          portfolio_id?: string
          status?: string
          tax_contribution_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daf_grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daf_grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "daf_grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "daf_grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daf_grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daf_grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "daf_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daf_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daf_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "daf_grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "daf_grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daf_grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "daf_grants_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "tax_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daf_grants_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "daf_grants_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_with_limits"
            referencedColumns: ["id"]
          },
        ]
      }
      disqualified_persons: {
        Row: {
          created_at: string
          end_date: string | null
          full_name: string
          id: string
          is_active: boolean
          notes: string | null
          org_id: string
          ownership_pct: number | null
          relationship_type: string
          start_date: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date?: string | null
          full_name: string
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id: string
          ownership_pct?: number | null
          relationship_type: string
          start_date?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          org_id?: string
          ownership_pct?: number | null
          relationship_type?: string
          start_date?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disqualified_persons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disqualified_persons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "disqualified_persons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "disqualified_persons_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      donor_communications: {
        Row: {
          comm_type: string
          created_at: string
          direction: string
          donor_id: string
          follow_up_completed: boolean
          follow_up_date: string | null
          follow_up_required: boolean
          id: string
          linked_contribution_id: string | null
          logged_by: string | null
          occurred_at: string
          org_id: string
          subject: string | null
          summary: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          comm_type: string
          created_at?: string
          direction?: string
          donor_id: string
          follow_up_completed?: boolean
          follow_up_date?: string | null
          follow_up_required?: boolean
          id?: string
          linked_contribution_id?: string | null
          logged_by?: string | null
          occurred_at?: string
          org_id: string
          subject?: string | null
          summary?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          comm_type?: string
          created_at?: string
          direction?: string
          donor_id?: string
          follow_up_completed?: boolean
          follow_up_date?: string | null
          follow_up_required?: boolean
          id?: string
          linked_contribution_id?: string | null
          logged_by?: string | null
          occurred_at?: string
          org_id?: string
          subject?: string | null
          summary?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "donor_communications_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_communications_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "v_contribution_with_donor"
            referencedColumns: ["donor_id"]
          },
          {
            foreignKeyName: "donor_communications_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["donor_id"]
          },
          {
            foreignKeyName: "donor_communications_donor_id_fkey"
            columns: ["donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_communications_linked_contribution_id_fkey"
            columns: ["linked_contribution_id"]
            isOneToOne: false
            referencedRelation: "contributions_received"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_communications_linked_contribution_id_fkey"
            columns: ["linked_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_contribution_with_donor"
            referencedColumns: ["contribution_id"]
          },
          {
            foreignKeyName: "donor_communications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_communications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donor_communications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "donor_communications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      donors: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          city: string | null
          communication_preference: string
          contact_name: string | null
          country: string | null
          created_at: string
          custom_fields: Json
          deleted_at: string | null
          deleted_by: string | null
          do_not_contact: boolean
          email: string | null
          external_id: string | null
          first_gift_date: string | null
          first_name: string | null
          gift_count: number
          id: string
          is_anonymous: boolean
          is_organization: boolean
          largest_gift: number | null
          last_gift_date: string | null
          last_name: string | null
          lifetime_giving: number
          notes: string | null
          org_id: string
          organization_name: string | null
          phone: string | null
          preferred_name: string | null
          recency_status: Database["public"]["Enums"]["donor_recency_enum"]
          relationship_manager: string | null
          source: string | null
          state: string | null
          tags: string[] | null
          tier: Database["public"]["Enums"]["donor_tier_enum"]
          updated_at: string
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          communication_preference?: string
          contact_name?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json
          deleted_at?: string | null
          deleted_by?: string | null
          do_not_contact?: boolean
          email?: string | null
          external_id?: string | null
          first_gift_date?: string | null
          first_name?: string | null
          gift_count?: number
          id?: string
          is_anonymous?: boolean
          is_organization?: boolean
          largest_gift?: number | null
          last_gift_date?: string | null
          last_name?: string | null
          lifetime_giving?: number
          notes?: string | null
          org_id: string
          organization_name?: string | null
          phone?: string | null
          preferred_name?: string | null
          recency_status?: Database["public"]["Enums"]["donor_recency_enum"]
          relationship_manager?: string | null
          source?: string | null
          state?: string | null
          tags?: string[] | null
          tier?: Database["public"]["Enums"]["donor_tier_enum"]
          updated_at?: string
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          city?: string | null
          communication_preference?: string
          contact_name?: string | null
          country?: string | null
          created_at?: string
          custom_fields?: Json
          deleted_at?: string | null
          deleted_by?: string | null
          do_not_contact?: boolean
          email?: string | null
          external_id?: string | null
          first_gift_date?: string | null
          first_name?: string | null
          gift_count?: number
          id?: string
          is_anonymous?: boolean
          is_organization?: boolean
          largest_gift?: number | null
          last_gift_date?: string | null
          last_name?: string | null
          lifetime_giving?: number
          notes?: string | null
          org_id?: string
          organization_name?: string | null
          phone?: string | null
          preferred_name?: string | null
          recency_status?: Database["public"]["Enums"]["donor_recency_enum"]
          relationship_manager?: string | null
          source?: string | null
          state?: string | null
          tags?: string[] | null
          tier?: Database["public"]["Enums"]["donor_tier_enum"]
          updated_at?: string
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      events: {
        Row: {
          created_at: string
          event_date: string
          event_type: string | null
          headline: string
          id: string
          investee_id: string | null
          org_id: string | null
          severity: string
          source_link: string | null
          summary: string | null
        }
        Insert: {
          created_at?: string
          event_date: string
          event_type?: string | null
          headline: string
          id?: string
          investee_id?: string | null
          org_id?: string | null
          severity?: string
          source_link?: string | null
          summary?: string | null
        }
        Update: {
          created_at?: string
          event_date?: string
          event_type?: string | null
          headline?: string
          id?: string
          investee_id?: string | null
          org_id?: string | null
          severity?: string
          source_link?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_investee_id_fkey"
            columns: ["investee_id"]
            isOneToOne: false
            referencedRelation: "investees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      expenditure_responsibility_grants: {
        Row: {
          created_at: string
          er_agreement_signed_date: string | null
          er_agreement_url: string | null
          er_report_frequency: string | null
          er_reports_received_count: number
          er_reports_required: boolean
          er_reports_required_count: number
          er_status: string
          grant_id: string
          grantee_501c3_verified: boolean
          grantee_501c3_verified_at: string | null
          grantee_ein: string | null
          grantee_is_public_charity: boolean
          id: string
          notes: string | null
          portfolio_id: string
          terminal_report_date: string | null
          terminal_report_received: boolean
          terminal_report_required: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          er_agreement_signed_date?: string | null
          er_agreement_url?: string | null
          er_report_frequency?: string | null
          er_reports_received_count?: number
          er_reports_required?: boolean
          er_reports_required_count?: number
          er_status?: string
          grant_id: string
          grantee_501c3_verified?: boolean
          grantee_501c3_verified_at?: string | null
          grantee_ein?: string | null
          grantee_is_public_charity?: boolean
          id?: string
          notes?: string | null
          portfolio_id: string
          terminal_report_date?: string | null
          terminal_report_received?: boolean
          terminal_report_required?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          er_agreement_signed_date?: string | null
          er_agreement_url?: string | null
          er_report_frequency?: string | null
          er_reports_received_count?: number
          er_reports_required?: boolean
          er_reports_required_count?: number
          er_status?: string
          grant_id?: string
          grantee_501c3_verified?: boolean
          grantee_501c3_verified_at?: string | null
          grantee_ein?: string | null
          grantee_is_public_charity?: boolean
          id?: string
          notes?: string | null
          portfolio_id?: string
          terminal_report_date?: string | null
          terminal_report_received?: boolean
          terminal_report_required?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenditure_responsibility_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      filing_calendar: {
        Row: {
          attachments: Json | null
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          created_at: string
          description: string | null
          due_date: string
          extension_due_date: string | null
          filing_reference: string | null
          filing_type: string
          id: string
          is_recurring: boolean
          jurisdiction: string | null
          last_reminded_at: string | null
          notes: string | null
          org_id: string
          period_end: string | null
          period_start: string | null
          recurrence_rule: string | null
          reminder_days: number[] | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          extension_due_date?: string | null
          filing_reference?: string | null
          filing_type: string
          id?: string
          is_recurring?: boolean
          jurisdiction?: string | null
          last_reminded_at?: string | null
          notes?: string | null
          org_id: string
          period_end?: string | null
          period_start?: string | null
          recurrence_rule?: string | null
          reminder_days?: number[] | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          extension_due_date?: string | null
          filing_reference?: string | null
          filing_type?: string
          id?: string
          is_recurring?: boolean
          jurisdiction?: string | null
          last_reminded_at?: string | null
          notes?: string | null
          org_id?: string
          period_end?: string | null
          period_start?: string | null
          recurrence_rule?: string | null
          reminder_days?: number[] | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filing_calendar_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_calendar_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_calendar_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "filing_calendar_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      financial_analysis_cache: {
        Row: {
          analysis_type: string
          created_at: string
          expires_at: string
          generated_at: string
          id: string
          model_version: string | null
          portfolio_id: string
          result: Json
          updated_at: string
        }
        Insert: {
          analysis_type: string
          created_at?: string
          expires_at?: string
          generated_at?: string
          id?: string
          model_version?: string | null
          portfolio_id: string
          result: Json
          updated_at?: string
        }
        Update: {
          analysis_type?: string
          created_at?: string
          expires_at?: string
          generated_at?: string
          id?: string
          model_version?: string | null
          portfolio_id?: string
          result?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_analysis_cache_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_analysis_cache_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      foundation_990pf_data: {
        Row: {
          acquisition_indebtedness: number
          actual_payout: number | null
          avg_fair_market_value: number | null
          created_at: string
          excise_tax_amount: number | null
          excise_tax_rate: number
          exempt_use_assets: number
          fair_market_value_assets: number | null
          has_self_dealing: boolean
          id: string
          net_investment_income: number
          org_id: string
          payout_deficit: number
          portfolio_id: string
          required_payout: number | null
          self_dealing_notes: string | null
          tax_year: number
          total_expenses: number
          total_grants: number
          updated_at: string
        }
        Insert: {
          acquisition_indebtedness?: number
          actual_payout?: number | null
          avg_fair_market_value?: number | null
          created_at?: string
          excise_tax_amount?: number | null
          excise_tax_rate?: number
          exempt_use_assets?: number
          fair_market_value_assets?: number | null
          has_self_dealing?: boolean
          id?: string
          net_investment_income?: number
          org_id: string
          payout_deficit?: number
          portfolio_id: string
          required_payout?: number | null
          self_dealing_notes?: string | null
          tax_year: number
          total_expenses?: number
          total_grants?: number
          updated_at?: string
        }
        Update: {
          acquisition_indebtedness?: number
          actual_payout?: number | null
          avg_fair_market_value?: number | null
          created_at?: string
          excise_tax_amount?: number | null
          excise_tax_rate?: number
          exempt_use_assets?: number
          fair_market_value_assets?: number | null
          has_self_dealing?: boolean
          id?: string
          net_investment_income?: number
          org_id?: string
          payout_deficit?: number
          portfolio_id?: string
          required_payout?: number | null
          self_dealing_notes?: string | null
          tax_year?: number
          total_expenses?: number
          total_grants?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "foundation_990pf_data_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foundation_990pf_data_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foundation_990pf_data_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "foundation_990pf_data_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "foundation_990pf_data_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "foundation_990pf_data_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      generated_documents: {
        Row: {
          config: Json
          content: Json | null
          created_at: string
          document_type: string
          expires_at: string | null
          file_size_bytes: number | null
          format: string
          generated_at: string
          generated_by: string | null
          holding_id: string | null
          id: string
          is_public: boolean
          portfolio_id: string
          scope: string
          sector: string | null
          share_token: string | null
          status: string
          template_id: string | null
          title: string
          version: number
        }
        Insert: {
          config?: Json
          content?: Json | null
          created_at?: string
          document_type?: string
          expires_at?: string | null
          file_size_bytes?: number | null
          format?: string
          generated_at?: string
          generated_by?: string | null
          holding_id?: string | null
          id?: string
          is_public?: boolean
          portfolio_id: string
          scope?: string
          sector?: string | null
          share_token?: string | null
          status?: string
          template_id?: string | null
          title: string
          version?: number
        }
        Update: {
          config?: Json
          content?: Json | null
          created_at?: string
          document_type?: string
          expires_at?: string | null
          file_size_bytes?: number | null
          format?: string
          generated_at?: string
          generated_by?: string | null
          holding_id?: string | null
          id?: string
          is_public?: boolean
          portfolio_id?: string
          scope?: string
          sector?: string | null
          share_token?: string | null
          status?: string
          template_id?: string | null
          title?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "generated_documents_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "generated_documents_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "generated_documents_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "generated_documents_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_documents_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "generated_documents_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      generated_financial_analyses: {
        Row: {
          analysis_content: Json
          charity_id: string | null
          created_at: string
          financial_snapshot: Json
          generated_at: string
          generated_by: string | null
          holding_id: string | null
          id: string
          version: number
        }
        Insert: {
          analysis_content?: Json
          charity_id?: string | null
          created_at?: string
          financial_snapshot?: Json
          generated_at?: string
          generated_by?: string | null
          holding_id?: string | null
          id?: string
          version?: number
        }
        Update: {
          analysis_content?: Json
          charity_id?: string | null
          created_at?: string
          financial_snapshot?: Json
          generated_at?: string
          generated_by?: string | null
          holding_id?: string | null
          id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "generated_financial_analyses_charity_id_fkey"
            columns: ["charity_id"]
            isOneToOne: false
            referencedRelation: "charities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_financial_analyses_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_financial_analyses_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "generated_financial_analyses_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "generated_financial_analyses_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_financial_analyses_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_financial_analyses_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
        ]
      }
      geocode_cache: {
        Row: {
          cached_at: string
          error: string | null
          expires_at: string
          id: string
          location_key: string
          result: Json | null
        }
        Insert: {
          cached_at?: string
          error?: string | null
          expires_at?: string
          id?: string
          location_key: string
          result?: Json | null
        }
        Update: {
          cached_at?: string
          error?: string | null
          expires_at?: string
          id?: string
          location_key?: string
          result?: Json | null
        }
        Relationships: []
      }
      grant_budget_items: {
        Row: {
          actual_amount: number | null
          budgeted_amount: number
          category: string
          created_at: string
          description: string
          grant_id: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          actual_amount?: number | null
          budgeted_amount: number
          category: string
          created_at?: string
          description: string
          grant_id: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          actual_amount?: number | null
          budgeted_amount?: number
          category?: string
          created_at?: string
          description?: string
          grant_id?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_budget_items_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_budget_items_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_budget_items_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_budget_items_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_checklist_completions: {
        Row: {
          checklist_item_key: string
          completed_at: string
          completed_by: string
          grant_id: string
          id: string
          org_id: string
          stage_key: string
          workflow_config_id: string
        }
        Insert: {
          checklist_item_key: string
          completed_at?: string
          completed_by: string
          grant_id: string
          id?: string
          org_id: string
          stage_key: string
          workflow_config_id: string
        }
        Update: {
          checklist_item_key?: string
          completed_at?: string
          completed_by?: string
          grant_id?: string
          id?: string
          org_id?: string
          stage_key?: string
          workflow_config_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_checklist_completions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_checklist_completions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_checklist_completions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_checklist_completions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_checklist_completions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_checklist_completions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_checklist_completions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "grant_checklist_completions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "grant_checklist_completions_workflow_config_id_fkey"
            columns: ["workflow_config_id"]
            isOneToOne: false
            referencedRelation: "org_workflow_config"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_communications: {
        Row: {
          comm_type: string
          contact_email: string | null
          contact_name: string | null
          created_at: string
          direction: string
          follow_up_date: string | null
          follow_up_notes: string | null
          follow_up_required: boolean
          full_content: string | null
          grant_id: string
          id: string
          occurred_at: string
          subject: string | null
          summary: string
          tags: string[]
          updated_at: string
        }
        Insert: {
          comm_type?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          direction?: string
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean
          full_content?: string | null
          grant_id: string
          id?: string
          occurred_at?: string
          subject?: string | null
          summary: string
          tags?: string[]
          updated_at?: string
        }
        Update: {
          comm_type?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          direction?: string
          follow_up_date?: string | null
          follow_up_notes?: string | null
          follow_up_required?: boolean
          full_content?: string | null
          grant_id?: string
          id?: string
          occurred_at?: string
          subject?: string | null
          summary?: string
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_communications_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_communications_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_communications_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_communications_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_contacts: {
        Row: {
          created_at: string
          email: string | null
          grant_id: string
          id: string
          is_primary: boolean
          name: string
          notes: string | null
          organization: string | null
          phone: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          grant_id: string
          id?: string
          is_primary?: boolean
          name: string
          notes?: string | null
          organization?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          grant_id?: string
          id?: string
          is_primary?: boolean
          name?: string
          notes?: string | null
          organization?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_contacts_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_contacts_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_contacts_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_contacts_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_decisions: {
        Row: {
          amount: number | null
          board_meeting_date: string | null
          conditions: string | null
          created_at: string
          decided_by: string | null
          decision: string
          decision_date: string
          decision_type: string
          grant_id: string
          id: string
          metadata: Json | null
          org_id: string
          rationale: string | null
        }
        Insert: {
          amount?: number | null
          board_meeting_date?: string | null
          conditions?: string | null
          created_at?: string
          decided_by?: string | null
          decision: string
          decision_date: string
          decision_type: string
          grant_id: string
          id?: string
          metadata?: Json | null
          org_id: string
          rationale?: string | null
        }
        Update: {
          amount?: number | null
          board_meeting_date?: string | null
          conditions?: string | null
          created_at?: string
          decided_by?: string | null
          decision?: string
          decision_date?: string
          decision_type?: string
          grant_id?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          rationale?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grant_decisions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_decisions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_decisions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_decisions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "grant_decisions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      grant_documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_size: number
          grant_id: string
          id: string
          mime_type: string | null
          storage_path: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          document_type?: string
          file_name: string
          file_size?: number
          grant_id: string
          id?: string
          mime_type?: string | null
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_size?: number
          grant_id?: string
          id?: string
          mime_type?: string | null
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "grant_documents_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_documents_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_documents_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_documents_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_milestones: {
        Row: {
          completed_date: string | null
          created_at: string
          description: string | null
          due_date: string | null
          grant_id: string
          id: string
          milestone_name: string
          notes: string | null
          status: string
          updated_at: string
        }
        Insert: {
          completed_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          grant_id: string
          id?: string
          milestone_name: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          completed_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          grant_id?: string
          id?: string
          milestone_name?: string
          notes?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_milestones_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_milestones_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_milestones_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_milestones_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_payments: {
        Row: {
          actual_date: string | null
          amount: number
          condition_notes: string | null
          conditions_met: boolean
          created_at: string
          grant_id: string
          id: string
          notes: string | null
          paid_date: string | null
          payment_method: string | null
          payment_number: number
          payment_type: string
          reference_number: string | null
          scheduled_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          actual_date?: string | null
          amount: number
          condition_notes?: string | null
          conditions_met?: boolean
          created_at?: string
          grant_id: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_number?: number
          payment_type?: string
          reference_number?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          actual_date?: string | null
          amount?: number
          condition_notes?: string | null
          conditions_met?: boolean
          created_at?: string
          grant_id?: string
          id?: string
          notes?: string | null
          paid_date?: string | null
          payment_method?: string | null
          payment_number?: number
          payment_type?: string
          reference_number?: string | null
          scheduled_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_payments_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_payments_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_payments_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_payments_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_reports: {
        Row: {
          attachments: Json | null
          content: string | null
          created_at: string
          document_url: string | null
          due_date: string | null
          grant_id: string
          id: string
          notes: string | null
          received_at: string | null
          report_date: string | null
          report_period_end: string | null
          report_period_start: string | null
          report_type: string
          submitted_date: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          content?: string | null
          created_at?: string
          document_url?: string | null
          due_date?: string | null
          grant_id: string
          id?: string
          notes?: string | null
          received_at?: string | null
          report_date?: string | null
          report_period_end?: string | null
          report_period_start?: string | null
          report_type?: string
          submitted_date?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          content?: string | null
          created_at?: string
          document_url?: string | null
          due_date?: string | null
          grant_id?: string
          id?: string
          notes?: string | null
          received_at?: string | null
          report_date?: string | null
          report_period_end?: string | null
          report_period_start?: string | null
          report_type?: string
          submitted_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_reports_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_reports_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_reports_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_reports_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      grant_status_history: {
        Row: {
          actor_id: string | null
          created_at: string
          from_stage: string | null
          grant_id: string
          id: string
          metadata: Json | null
          org_id: string
          reason: string | null
          to_stage: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_stage?: string | null
          grant_id: string
          id?: string
          metadata?: Json | null
          org_id: string
          reason?: string | null
          to_stage: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_stage?: string | null
          grant_id?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          reason?: string | null
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "grant_status_history_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_status_history_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_status_history_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "grant_status_history_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_status_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_status_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grant_status_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "grant_status_history_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      grants: {
        Row: {
          approved_amount: number | null
          created_at: string
          currency: string
          deleted_at: string | null
          deliverables: string | null
          grant_period_end: string | null
          grant_period_start: string | null
          grant_type: string | null
          holding_id: string
          id: string
          internal_owner_id: string | null
          lifecycle_stage: string
          next_report_due: string | null
          org_id: string
          portfolio_id: string
          purpose: string | null
          qb_exported_at: string | null
          qb_journal_entry_id: string | null
          renewal_date: string | null
          renewal_eligible: boolean
          reporting_frequency: string | null
          requested_amount: number | null
          risk_level: string | null
          updated_at: string
        }
        Insert: {
          approved_amount?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          deliverables?: string | null
          grant_period_end?: string | null
          grant_period_start?: string | null
          grant_type?: string | null
          holding_id: string
          id?: string
          internal_owner_id?: string | null
          lifecycle_stage?: string
          next_report_due?: string | null
          org_id: string
          portfolio_id: string
          purpose?: string | null
          qb_exported_at?: string | null
          qb_journal_entry_id?: string | null
          renewal_date?: string | null
          renewal_eligible?: boolean
          reporting_frequency?: string | null
          requested_amount?: number | null
          risk_level?: string | null
          updated_at?: string
        }
        Update: {
          approved_amount?: number | null
          created_at?: string
          currency?: string
          deleted_at?: string | null
          deliverables?: string | null
          grant_period_end?: string | null
          grant_period_start?: string | null
          grant_type?: string | null
          holding_id?: string
          id?: string
          internal_owner_id?: string | null
          lifecycle_stage?: string
          next_report_due?: string | null
          org_id?: string
          portfolio_id?: string
          purpose?: string | null
          qb_exported_at?: string | null
          qb_journal_entry_id?: string | null
          renewal_date?: string | null
          renewal_eligible?: boolean
          reporting_frequency?: string | null
          requested_amount?: number | null
          risk_level?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: true
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: true
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: true
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: true
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: true
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: true
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      holding_co_investors: {
        Row: {
          committed_amount: number | null
          created_at: string
          currency: string
          holding_id: string
          id: string
          investor_name: string
          notes: string | null
          relationship: string | null
        }
        Insert: {
          committed_amount?: number | null
          created_at?: string
          currency?: string
          holding_id: string
          id?: string
          investor_name: string
          notes?: string | null
          relationship?: string | null
        }
        Update: {
          committed_amount?: number | null
          created_at?: string
          currency?: string
          holding_id?: string
          id?: string
          investor_name?: string
          notes?: string | null
          relationship?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holding_co_investors_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_co_investors_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_co_investors_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_co_investors_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_co_investors_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_co_investors_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
        ]
      }
      holding_contacts: {
        Row: {
          created_at: string
          email: string | null
          holding_id: string
          id: string
          is_primary: boolean
          name: string | null
          notes: string | null
          organization: string | null
          phone: string | null
          photo_path: string | null
          role: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          holding_id: string
          id?: string
          is_primary?: boolean
          name?: string | null
          notes?: string | null
          organization?: string | null
          phone?: string | null
          photo_path?: string | null
          role?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          holding_id?: string
          id?: string
          is_primary?: boolean
          name?: string | null
          notes?: string | null
          organization?: string | null
          phone?: string | null
          photo_path?: string | null
          role?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_contacts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contacts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_contacts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_contacts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contacts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contacts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
        ]
      }
      holding_contributions: {
        Row: {
          amount_usd: number
          contribution_date: string
          created_at: string
          holding_id: string | null
          id: string
          notes: string | null
          org_id: string
          portfolio_id: string
          tax_contribution_id: string | null
          updated_at: string
        }
        Insert: {
          amount_usd: number
          contribution_date: string
          created_at?: string
          holding_id?: string | null
          id?: string
          notes?: string | null
          org_id: string
          portfolio_id: string
          tax_contribution_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_usd?: number
          contribution_date?: string
          created_at?: string
          holding_id?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          portfolio_id?: string
          tax_contribution_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holding_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holding_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "holding_contributions_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "tax_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contributions_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_contributions_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_with_limits"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_facts: {
        Row: {
          created_at: string
          holding_id: string
          id: string
          metric_name: string
          notes: string | null
          period_end: string
          period_start: string
          source: string | null
          unit: string | null
          value: number
        }
        Insert: {
          created_at?: string
          holding_id: string
          id?: string
          metric_name: string
          notes?: string | null
          period_end: string
          period_start: string
          source?: string | null
          unit?: string | null
          value: number
        }
        Update: {
          created_at?: string
          holding_id?: string
          id?: string
          metric_name?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          source?: string | null
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "holding_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
        ]
      }
      holding_locations: {
        Row: {
          created_at: string
          holding_id: string
          id: string
          lat: number
          lon: number
          name: string
          portfolio_id: string
          status: string | null
          tags: string[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          holding_id: string
          id?: string
          lat: number
          lon: number
          name: string
          portfolio_id: string
          status?: string | null
          tags?: string[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          holding_id?: string
          id?: string
          lat?: number
          lon?: number
          name?: string
          portfolio_id?: string
          status?: string | null
          tags?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_locations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_locations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_locations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_locations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_locations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_locations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_locations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_locations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      holding_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          external_id: string | null
          holding_id: string
          id: string
          notes: string | null
          transaction_date: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          external_id?: string | null
          holding_id: string
          id?: string
          notes?: string | null
          transaction_date: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          external_id?: string | null
          holding_id?: string
          id?: string
          notes?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
        ]
      }
      holding_valuations: {
        Row: {
          created_at: string
          currency: string
          holding_id: string
          id: string
          notes: string | null
          source: string | null
          valuation_type: string
          value: number
          valued_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          holding_id: string
          id?: string
          notes?: string | null
          source?: string | null
          valuation_type?: string
          value: number
          valued_at: string
        }
        Update: {
          created_at?: string
          currency?: string
          holding_id?: string
          id?: string
          notes?: string | null
          source?: string | null
          valuation_type?: string
          value?: number
          valued_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_valuations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_valuations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_valuations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_valuations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_valuations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_valuations_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
        ]
      }
      holding_widgets: {
        Row: {
          config: Json
          created_at: string
          holding_id: string
          id: string
          position: number
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          holding_id: string
          id?: string
          position?: number
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          holding_id?: string
          id?: string
          position?: number
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "holding_widgets_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_widgets_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_widgets_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "holding_widgets_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_widgets_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holding_widgets_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
        ]
      }
      holdings: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          amount_invested: number | null
          as_of: string | null
          asset_type: Database["public"]["Enums"]["asset_type_enum"]
          city: string | null
          committed_date: string | null
          cost_basis: number | null
          cost_per_outcome: number | null
          cost_per_outcome_unit: string | null
          country: string | null
          created_at: string
          currency: string
          current_value: number | null
          cusip: string | null
          custodian: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          ein: string | null
          exit_date: string | null
          external_id: string | null
          fmv: number | null
          focus_area: string[] | null
          funds_allocated: number | null
          geocode_metadata: Json | null
          geocode_provider: string | null
          geocode_status: string | null
          geocoded_at: string | null
          id: string
          impact_score: number | null
          investee_id: string | null
          investment_date: string | null
          isin: string | null
          latitude: number | null
          location_city: string | null
          location_country: string | null
          location_state: string | null
          longitude: number | null
          name: string
          notes: string | null
          org_id: string
          portfolio_id: string
          sector: string | null
          source_system: string | null
          state: string | null
          status: Database["public"]["Enums"]["holding_status_enum"]
          tags: string[] | null
          theory_of_action: string | null
          ticker: string | null
          total_org_funding: number | null
          updated_at: string
          valuation_method: string | null
          website: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          amount_invested?: number | null
          as_of?: string | null
          asset_type?: Database["public"]["Enums"]["asset_type_enum"]
          city?: string | null
          committed_date?: string | null
          cost_basis?: number | null
          cost_per_outcome?: number | null
          cost_per_outcome_unit?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          current_value?: number | null
          cusip?: string | null
          custodian?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          ein?: string | null
          exit_date?: string | null
          external_id?: string | null
          fmv?: number | null
          focus_area?: string[] | null
          funds_allocated?: number | null
          geocode_metadata?: Json | null
          geocode_provider?: string | null
          geocode_status?: string | null
          geocoded_at?: string | null
          id?: string
          impact_score?: number | null
          investee_id?: string | null
          investment_date?: string | null
          isin?: string | null
          latitude?: number | null
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          longitude?: number | null
          name: string
          notes?: string | null
          org_id: string
          portfolio_id: string
          sector?: string | null
          source_system?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["holding_status_enum"]
          tags?: string[] | null
          theory_of_action?: string | null
          ticker?: string | null
          total_org_funding?: number | null
          updated_at?: string
          valuation_method?: string | null
          website?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          amount_invested?: number | null
          as_of?: string | null
          asset_type?: Database["public"]["Enums"]["asset_type_enum"]
          city?: string | null
          committed_date?: string | null
          cost_basis?: number | null
          cost_per_outcome?: number | null
          cost_per_outcome_unit?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          current_value?: number | null
          cusip?: string | null
          custodian?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          ein?: string | null
          exit_date?: string | null
          external_id?: string | null
          fmv?: number | null
          focus_area?: string[] | null
          funds_allocated?: number | null
          geocode_metadata?: Json | null
          geocode_provider?: string | null
          geocode_status?: string | null
          geocoded_at?: string | null
          id?: string
          impact_score?: number | null
          investee_id?: string | null
          investment_date?: string | null
          isin?: string | null
          latitude?: number | null
          location_city?: string | null
          location_country?: string | null
          location_state?: string | null
          longitude?: number | null
          name?: string
          notes?: string | null
          org_id?: string
          portfolio_id?: string
          sector?: string | null
          source_system?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["holding_status_enum"]
          tags?: string[] | null
          theory_of_action?: string | null
          ticker?: string | null
          total_org_funding?: number | null
          updated_at?: string
          valuation_method?: string | null
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_investee_id_fkey"
            columns: ["investee_id"]
            isOneToOne: false
            referencedRelation: "investees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      import_ai_suggestions: {
        Row: {
          auto_fixable: boolean
          bulk_applicable: boolean
          bulk_condition: Json | null
          confidence: number | null
          created_at: string
          explanation: string | null
          field: string
          id: string
          import_job_id: string
          proposed_value: string | null
          staging_row_id: string
          staging_table: string
          status: string
          suggestion_type: string
          updated_at: string
        }
        Insert: {
          auto_fixable?: boolean
          bulk_applicable?: boolean
          bulk_condition?: Json | null
          confidence?: number | null
          created_at?: string
          explanation?: string | null
          field: string
          id?: string
          import_job_id: string
          proposed_value?: string | null
          staging_row_id: string
          staging_table: string
          status?: string
          suggestion_type: string
          updated_at?: string
        }
        Update: {
          auto_fixable?: boolean
          bulk_applicable?: boolean
          bulk_condition?: Json | null
          confidence?: number | null
          created_at?: string
          explanation?: string | null
          field?: string
          id?: string
          import_job_id?: string
          proposed_value?: string | null
          staging_row_id?: string
          staging_table?: string
          status?: string
          suggestion_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_ai_suggestions_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_audit_log: {
        Row: {
          created_at: string
          data_snapshot: Json | null
          error_message: string | null
          id: string
          import_job_id: string
          operation: string
          record_id: string
          staging_row_id: string | null
          staging_table: string | null
          table_name: string
        }
        Insert: {
          created_at?: string
          data_snapshot?: Json | null
          error_message?: string | null
          id?: string
          import_job_id: string
          operation: string
          record_id: string
          staging_row_id?: string | null
          staging_table?: string | null
          table_name: string
        }
        Update: {
          created_at?: string
          data_snapshot?: Json | null
          error_message?: string | null
          id?: string
          import_job_id?: string
          operation?: string
          record_id?: string
          staging_row_id?: string | null
          staging_table?: string | null
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_audit_log_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          approved_rows: number
          completed_at: string | null
          created_at: string
          created_by: string
          error_details: Json | null
          error_message: string | null
          error_rows: number
          id: string
          last_heartbeat_at: string | null
          mapping_profile_id: string | null
          name: string
          org_id: string
          portfolio_id: string | null
          reconciliation_data: Json | null
          records_failed: number
          records_loaded: number
          records_validated: number
          rejected_rows: number
          reviewed_by: string | null
          source_config: Json | null
          source_type: string
          started_at: string | null
          status: Database["public"]["Enums"]["import_status_enum"]
          total_records_extracted: number
          updated_at: string
        }
        Insert: {
          approved_rows?: number
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_details?: Json | null
          error_message?: string | null
          error_rows?: number
          id?: string
          last_heartbeat_at?: string | null
          mapping_profile_id?: string | null
          name: string
          org_id: string
          portfolio_id?: string | null
          reconciliation_data?: Json | null
          records_failed?: number
          records_loaded?: number
          records_validated?: number
          rejected_rows?: number
          reviewed_by?: string | null
          source_config?: Json | null
          source_type: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_status_enum"]
          total_records_extracted?: number
          updated_at?: string
        }
        Update: {
          approved_rows?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_details?: Json | null
          error_message?: string | null
          error_rows?: number
          id?: string
          last_heartbeat_at?: string | null
          mapping_profile_id?: string | null
          name?: string
          org_id?: string
          portfolio_id?: string | null
          reconciliation_data?: Json | null
          records_failed?: number
          records_loaded?: number
          records_validated?: number
          rejected_rows?: number
          reviewed_by?: string | null
          source_config?: Json | null
          source_type?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["import_status_enum"]
          total_records_extracted?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_mapping_profile_id_fkey"
            columns: ["mapping_profile_id"]
            isOneToOne: false
            referencedRelation: "import_mapping_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "import_jobs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "import_jobs_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      import_mapping_profiles: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          entity_mappings: Json
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          org_id: string
          source_type: string | null
          updated_at: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_mappings?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          org_id: string
          source_type?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          entity_mappings?: Json
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          org_id?: string
          source_type?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "import_mapping_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_mapping_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_mapping_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "import_mapping_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      investees: {
        Row: {
          charity_id: string | null
          city: string | null
          country: string
          created_at: string
          display_name: string
          ein: string | null
          id: string
          notes: string | null
          sector: string | null
          state: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          charity_id?: string | null
          city?: string | null
          country?: string
          created_at?: string
          display_name: string
          ein?: string | null
          id?: string
          notes?: string | null
          sector?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          charity_id?: string | null
          city?: string | null
          country?: string
          created_at?: string
          display_name?: string
          ein?: string | null
          id?: string
          notes?: string | null
          sector?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investees_charity_id_fkey"
            columns: ["charity_id"]
            isOneToOne: false
            referencedRelation: "charities"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_definitions: {
        Row: {
          aggregation: string
          baseline_value: number | null
          created_at: string
          description: string | null
          direction: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          org_id: string
          slug: string
          target_value: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          aggregation?: string
          baseline_value?: number | null
          created_at?: string
          description?: string | null
          direction?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          org_id: string
          slug: string
          target_value?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          aggregation?: string
          baseline_value?: number | null
          created_at?: string
          description?: string | null
          direction?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string
          slug?: string
          target_value?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kpi_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "kpi_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      letter_templates: {
        Row: {
          body_template: string
          created_at: string
          description: string | null
          gift_types: string[] | null
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          org_id: string
          signature_block: string | null
          subject_template: string | null
          updated_at: string
        }
        Insert: {
          body_template: string
          created_at?: string
          description?: string | null
          gift_types?: string[] | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          org_id: string
          signature_block?: string | null
          subject_template?: string | null
          updated_at?: string
        }
        Update: {
          body_template?: string
          created_at?: string
          description?: string | null
          gift_types?: string[] | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          org_id?: string
          signature_block?: string | null
          subject_template?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "letter_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "letter_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "letter_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      metric_facts: {
        Row: {
          created_at: string
          data_quality_score: number | null
          holding_id: string
          id: string
          investee_id: string | null
          kpi_id: string | null
          metric_code: string
          metric_name: string | null
          notes: string | null
          period_end: string
          period_start: string | null
          source: string | null
          submitted_by_org_id: string | null
          unit: string | null
          updated_at: string
          value: number
          verification_level: string | null
        }
        Insert: {
          created_at?: string
          data_quality_score?: number | null
          holding_id: string
          id?: string
          investee_id?: string | null
          kpi_id?: string | null
          metric_code: string
          metric_name?: string | null
          notes?: string | null
          period_end?: string
          period_start?: string | null
          source?: string | null
          submitted_by_org_id?: string | null
          unit?: string | null
          updated_at?: string
          value: number
          verification_level?: string | null
        }
        Update: {
          created_at?: string
          data_quality_score?: number | null
          holding_id?: string
          id?: string
          investee_id?: string | null
          kpi_id?: string | null
          metric_code?: string
          metric_name?: string | null
          notes?: string | null
          period_end?: string
          period_start?: string | null
          source?: string | null
          submitted_by_org_id?: string | null
          unit?: string | null
          updated_at?: string
          value?: number
          verification_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_facts_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_metric_code_fk"
            columns: ["metric_code"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "metric_facts_submitted_by_org_id_fkey"
            columns: ["submitted_by_org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_submitted_by_org_id_fkey"
            columns: ["submitted_by_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_submitted_by_org_id_fkey"
            columns: ["submitted_by_org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "metric_facts_submitted_by_org_id_fkey"
            columns: ["submitted_by_org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      metric_projections_cache: {
        Row: {
          computed_at: string
          created_at: string
          expires_at: string
          historical_data_points: number
          holding_id: string | null
          id: string
          is_stale: boolean
          method: string
          metric_code: string
          periods_ahead: number
          portfolio_id: string
          projections: Json
          r_squared: number | null
          slope_per_period: number | null
          trend_direction: string | null
        }
        Insert: {
          computed_at?: string
          created_at?: string
          expires_at: string
          historical_data_points: number
          holding_id?: string | null
          id?: string
          is_stale?: boolean
          method: string
          metric_code: string
          periods_ahead: number
          portfolio_id: string
          projections?: Json
          r_squared?: number | null
          slope_per_period?: number | null
          trend_direction?: string | null
        }
        Update: {
          computed_at?: string
          created_at?: string
          expires_at?: string
          historical_data_points?: number
          holding_id?: string | null
          id?: string
          is_stale?: boolean
          method?: string
          metric_code?: string
          periods_ahead?: number
          portfolio_id?: string
          projections?: Json
          r_squared?: number | null
          slope_per_period?: number | null
          trend_direction?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "metric_projections_cache_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_projections_cache_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_projections_cache_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_projections_cache_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_projections_cache_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_projections_cache_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_projections_cache_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_projections_cache_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      metrics: {
        Row: {
          code: string
          created_at: string
          description: string | null
          name: string
          unit: string | null
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          name: string
          unit?: string | null
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          name?: string
          unit?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      module_definitions: {
        Row: {
          depends_on: string[] | null
          description: string | null
          is_core: boolean
          label: string
          slug: string
        }
        Insert: {
          depends_on?: string[] | null
          description?: string | null
          is_core?: boolean
          label: string
          slug: string
        }
        Update: {
          depends_on?: string[] | null
          description?: string | null
          is_core?: boolean
          label?: string
          slug?: string
        }
        Relationships: []
      }
      module_presets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          module_ids: string[]
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id: string
          module_ids?: string[]
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          module_ids?: string[]
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      news_articles: {
        Row: {
          charity_ein: string | null
          created_at: string
          expires_at: string | null
          fetched_at: string
          holding_id: string | null
          id: string
          is_pinned: boolean
          org_id: string | null
          published_at: string | null
          relevance_score: number | null
          sentiment: string | null
          source: string | null
          summary: string | null
          tags: string[] | null
          title: string
          updated_at: string
          url: string | null
        }
        Insert: {
          charity_ein?: string | null
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          holding_id?: string | null
          id?: string
          is_pinned?: boolean
          org_id?: string | null
          published_at?: string | null
          relevance_score?: number | null
          sentiment?: string | null
          source?: string | null
          summary?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          charity_ein?: string | null
          created_at?: string
          expires_at?: string | null
          fetched_at?: string
          holding_id?: string | null
          id?: string
          is_pinned?: boolean
          org_id?: string | null
          published_at?: string | null
          relevance_score?: number | null
          sentiment?: string | null
          source?: string | null
          summary?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "news_articles_charity_ein_fkey"
            columns: ["charity_ein"]
            isOneToOne: false
            referencedRelation: "charities"
            referencedColumns: ["ein"]
          },
          {
            foreignKeyName: "news_articles_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_articles_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "news_articles_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "news_articles_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_articles_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_articles_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "news_articles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_articles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_articles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "news_articles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      notification_events: {
        Row: {
          actor_id: string | null
          channel: string
          created_at: string
          dedupe_key: string
          delivery_attempts: number
          error_message: string | null
          event_type: string
          id: string
          last_attempt_at: string | null
          next_attempt_at: string | null
          org_id: string
          payload: Json
          priority: string
          read_at: string | null
          recipient_user_id: string
          scheduled_for: string
          sent_at: string | null
          status: string
          task_event_id: string | null
          task_id: string | null
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          channel: string
          created_at?: string
          dedupe_key: string
          delivery_attempts?: number
          error_message?: string | null
          event_type: string
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          org_id: string
          payload?: Json
          priority?: string
          read_at?: string | null
          recipient_user_id: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          task_event_id?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          channel?: string
          created_at?: string
          dedupe_key?: string
          delivery_attempts?: number
          error_message?: string | null
          event_type?: string
          id?: string
          last_attempt_at?: string | null
          next_attempt_at?: string | null
          org_id?: string
          payload?: Json
          priority?: string
          read_at?: string | null
          recipient_user_id?: string
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          task_event_id?: string | null
          task_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "notification_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "notification_events_task_event_id_fkey"
            columns: ["task_event_id"]
            isOneToOne: false
            referencedRelation: "task_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_analytics: {
        Row: {
          abandonment_stage: string | null
          completed_successfully: boolean
          conversation_duration_seconds: number | null
          created_at: string
          goals_extracted: number
          id: string
          intake_duration_seconds: number | null
          message_count: number
          modules_accepted: number
          modules_added: number
          modules_recommended: number
          modules_removed: number
          pain_points_extracted: number
          recommendation_duration_seconds: number | null
          session_id: string
          total_duration_seconds: number | null
          updated_at: string
        }
        Insert: {
          abandonment_stage?: string | null
          completed_successfully?: boolean
          conversation_duration_seconds?: number | null
          created_at?: string
          goals_extracted?: number
          id?: string
          intake_duration_seconds?: number | null
          message_count?: number
          modules_accepted?: number
          modules_added?: number
          modules_recommended?: number
          modules_removed?: number
          pain_points_extracted?: number
          recommendation_duration_seconds?: number | null
          session_id: string
          total_duration_seconds?: number | null
          updated_at?: string
        }
        Update: {
          abandonment_stage?: string | null
          completed_successfully?: boolean
          conversation_duration_seconds?: number | null
          created_at?: string
          goals_extracted?: number
          id?: string
          intake_duration_seconds?: number | null
          message_count?: number
          modules_accepted?: number
          modules_added?: number
          modules_recommended?: number
          modules_removed?: number
          pain_points_extracted?: number
          recommendation_duration_seconds?: number | null
          session_id?: string
          total_duration_seconds?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_analytics_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: string
          sequence_no: number
          session_id: string
          turn_id: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: string
          sequence_no?: never
          session_id: string
          turn_id: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: string
          sequence_no?: never
          session_id?: string
          turn_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_messages_turn_id_fkey"
            columns: ["turn_id"]
            isOneToOne: false
            referencedRelation: "onboarding_turns"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_profiles: {
        Row: {
          created_at: string
          goals: Json
          id: string
          pain_points: Json
          session_id: string
          team_context: Json
          updated_at: string
          workflows: Json
        }
        Insert: {
          created_at?: string
          goals?: Json
          id?: string
          pain_points?: Json
          session_id: string
          team_context?: Json
          updated_at?: string
          workflows?: Json
        }
        Update: {
          created_at?: string
          goals?: Json
          id?: string
          pain_points?: Json
          session_id?: string
          team_context?: Json
          updated_at?: string
          workflows?: Json
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_profiles_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_recommendations: {
        Row: {
          created_at: string
          excluded_modules: Json
          final_modules: string[]
          finalized_at: string | null
          generated_at: string
          id: string
          recommended_modules: Json
          session_id: string
          updated_at: string
          user_added: string[]
          user_removed: string[]
        }
        Insert: {
          created_at?: string
          excluded_modules?: Json
          final_modules?: string[]
          finalized_at?: string | null
          generated_at?: string
          id?: string
          recommended_modules?: Json
          session_id: string
          updated_at?: string
          user_added?: string[]
          user_removed?: string[]
        }
        Update: {
          created_at?: string
          excluded_modules?: Json
          final_modules?: string[]
          finalized_at?: string | null
          generated_at?: string
          id?: string
          recommended_modules?: Json
          session_id?: string
          updated_at?: string
          user_added?: string[]
          user_removed?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_recommendations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_sessions: {
        Row: {
          completed_at: string | null
          conversation_completed_at: string | null
          conversation_state: Json
          created_at: string
          id: string
          intake_completed_at: string | null
          messages: Json
          org_id: string | null
          quick_intake: Json
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          conversation_completed_at?: string | null
          conversation_state?: Json
          created_at?: string
          id?: string
          intake_completed_at?: string | null
          messages?: Json
          org_id?: string | null
          quick_intake?: Json
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          conversation_completed_at?: string | null
          conversation_state?: Json
          created_at?: string
          id?: string
          intake_completed_at?: string | null
          messages?: Json
          org_id?: string | null
          quick_intake?: Json
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "onboarding_sessions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      onboarding_turns: {
        Row: {
          completed_at: string | null
          created_at: string
          failed_at: string | null
          failure_code: string | null
          failure_message: string | null
          id: string
          request_id: string
          response: Json | null
          session_id: string
          started_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          request_id: string
          response?: Json | null
          session_id: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          failed_at?: string | null
          failure_code?: string | null
          failure_message?: string | null
          id?: string
          request_id?: string
          response?: Json | null
          session_id?: string
          started_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_ai_connections: {
        Row: {
          auth_type: string
          config: Json
          connector: string
          created_at: string
          created_by: string | null
          endpoint_url: string | null
          id: string
          last_test_status: string | null
          last_tested_at: string | null
          name: string
          org_id: string
          region: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          auth_type: string
          config?: Json
          connector: string
          created_at?: string
          created_by?: string | null
          endpoint_url?: string | null
          id?: string
          last_test_status?: string | null
          last_tested_at?: string | null
          name: string
          org_id: string
          region?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          auth_type?: string
          config?: Json
          connector?: string
          created_at?: string
          created_by?: string | null
          endpoint_url?: string | null
          id?: string
          last_test_status?: string | null
          last_tested_at?: string | null
          name?: string
          org_id?: string
          region?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_ai_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_ai_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_ai_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_ai_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_ai_context: {
        Row: {
          context_key: string
          context_type: string
          context_value: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          org_id: string
          source: string
          updated_at: string
        }
        Insert: {
          context_key: string
          context_type: string
          context_value: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          source: string
          updated_at?: string
        }
        Update: {
          context_key?: string
          context_type?: string
          context_value?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_ai_context_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_ai_context_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_ai_context_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_ai_context_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_ai_context_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_ai_credentials: {
        Row: {
          connection_id: string
          created_at: string
          created_by: string | null
          display_hint: string | null
          encrypted_payload: string
          encryption_key_id: string
          fingerprint_key_id: string
          id: string
          org_id: string
          rotated_at: string | null
          secret_fingerprint: string
          updated_at: string
        }
        Insert: {
          connection_id: string
          created_at?: string
          created_by?: string | null
          display_hint?: string | null
          encrypted_payload: string
          encryption_key_id: string
          fingerprint_key_id: string
          id?: string
          org_id: string
          rotated_at?: string | null
          secret_fingerprint: string
          updated_at?: string
        }
        Update: {
          connection_id?: string
          created_at?: string
          created_by?: string | null
          display_hint?: string | null
          encrypted_payload?: string
          encryption_key_id?: string
          fingerprint_key_id?: string
          id?: string
          org_id?: string
          rotated_at?: string | null
          secret_fingerprint?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_ai_credentials_connection_id_org_id_fkey"
            columns: ["connection_id", "org_id"]
            isOneToOne: false
            referencedRelation: "org_ai_connections"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      org_ai_deployments: {
        Row: {
          catalog_template_id: string | null
          config: Json
          connection_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          org_id: string
          provider_model_id: string
          status: string
          updated_at: string
          updated_by: string | null
          verified_workloads: Json
        }
        Insert: {
          catalog_template_id?: string | null
          config?: Json
          connection_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          org_id: string
          provider_model_id: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          verified_workloads?: Json
        }
        Update: {
          catalog_template_id?: string | null
          config?: Json
          connection_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          org_id?: string
          provider_model_id?: string
          status?: string
          updated_at?: string
          updated_by?: string | null
          verified_workloads?: Json
        }
        Relationships: [
          {
            foreignKeyName: "org_ai_deployments_connection_id_org_id_fkey"
            columns: ["connection_id", "org_id"]
            isOneToOne: false
            referencedRelation: "org_ai_connections"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      org_ai_route_targets: {
        Row: {
          created_at: string
          deployment_id: string | null
          id: string
          org_id: string
          position: number
          route_id: string
          target_kind: string
        }
        Insert: {
          created_at?: string
          deployment_id?: string | null
          id?: string
          org_id: string
          position: number
          route_id: string
          target_kind: string
        }
        Update: {
          created_at?: string
          deployment_id?: string | null
          id?: string
          org_id?: string
          position?: number
          route_id?: string
          target_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_ai_route_targets_deployment_id_org_id_fkey"
            columns: ["deployment_id", "org_id"]
            isOneToOne: false
            referencedRelation: "org_ai_deployments"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "org_ai_route_targets_route_id_org_id_fkey"
            columns: ["route_id", "org_id"]
            isOneToOne: false
            referencedRelation: "org_ai_routes"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      org_ai_routes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_enabled: boolean
          org_id: string
          policy: Json
          updated_at: string
          updated_by: string | null
          workload_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          org_id: string
          policy?: Json
          updated_at?: string
          updated_by?: string | null
          workload_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_enabled?: boolean
          org_id?: string
          policy?: Json
          updated_at?: string
          updated_by?: string | null
          workload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_ai_routes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_ai_routes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_ai_routes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_ai_routes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_subject_id: string
          created_at: string
          id: string
          metadata: Json | null
          org_id: string
          target_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_subject_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          org_id: string
          target_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_subject_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_automation_outbox: {
        Row: {
          attempts: number
          available_at: string
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          last_error: string | null
          org_id: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          available_at?: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          last_error?: string | null
          org_id: string
          payload: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          available_at?: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          last_error?: string | null
          org_id?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_automation_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_automation_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_automation_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_automation_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          onboarding_session_id: string | null
          org_id: string
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          onboarding_session_id?: string | null
          org_id: string
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          onboarding_session_id?: string | null
          org_id?: string
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_automation_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_automation_rules_onboarding_session_id_fkey"
            columns: ["onboarding_session_id"]
            isOneToOne: false
            referencedRelation: "onboarding_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_automation_rules_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_automation_runs: {
        Row: {
          id: string
          idempotency_key: string | null
          org_id: string
          ran_at: string
          result: Json
          rule_id: string | null
          status: string
          trigger_entity_id: string
          trigger_entity_type: string
        }
        Insert: {
          id?: string
          idempotency_key?: string | null
          org_id: string
          ran_at?: string
          result?: Json
          rule_id?: string | null
          status: string
          trigger_entity_id: string
          trigger_entity_type: string
        }
        Update: {
          id?: string
          idempotency_key?: string | null
          org_id?: string
          ran_at?: string
          result?: Json
          rule_id?: string | null
          status?: string
          trigger_entity_id?: string
          trigger_entity_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_automation_runs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "org_automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      org_custom_field_definitions: {
        Row: {
          created_at: string
          entity_type: string
          enum_options: Json | null
          field_key: string
          field_label: string
          field_type: string
          id: string
          is_ai_readable: boolean
          org_id: string
          required_at_stage: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          entity_type: string
          enum_options?: Json | null
          field_key: string
          field_label: string
          field_type: string
          id?: string
          is_ai_readable?: boolean
          org_id: string
          required_at_stage?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          entity_type?: string
          enum_options?: Json | null
          field_key?: string
          field_label?: string
          field_type?: string
          id?: string
          is_ai_readable?: boolean
          org_id?: string
          required_at_stage?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_custom_field_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_custom_field_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_custom_field_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_custom_field_definitions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_custom_field_values: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          field_definition_id: string
          id: string
          org_id: string
          updated_at: string
          value_boolean: boolean | null
          value_date: string | null
          value_numeric: number | null
          value_text: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          field_definition_id: string
          id?: string
          org_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          field_definition_id?: string
          id?: string
          org_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_numeric?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_custom_field_values_field_definition_id_fkey"
            columns: ["field_definition_id"]
            isOneToOne: false
            referencedRelation: "org_custom_field_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_custom_field_values_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_custom_field_values_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_custom_field_values_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_custom_field_values_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_invitation_email_outbox: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          id: string
          invitation_id: string
          invitation_token: string
          last_error: string | null
          message: string | null
          next_attempt_at: string
          org_id: string
          recipient_email: string
          role: Database["public"]["Enums"]["member_role_enum"]
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          invitation_id: string
          invitation_token: string
          last_error?: string | null
          message?: string | null
          next_attempt_at?: string
          org_id: string
          recipient_email: string
          role: Database["public"]["Enums"]["member_role_enum"]
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          invitation_id?: string
          invitation_token?: string
          last_error?: string | null
          message?: string | null
          next_attempt_at?: string
          org_id?: string
          recipient_email?: string
          role?: Database["public"]["Enums"]["member_role_enum"]
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitation_email_outbox_invitation_id_fkey"
            columns: ["invitation_id"]
            isOneToOne: false
            referencedRelation: "org_invitations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitation_email_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitation_email_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitation_email_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_invitation_email_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_invitations: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: Database["public"]["Enums"]["member_role_enum"]
          status: string
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          role?: Database["public"]["Enums"]["member_role_enum"]
          status?: string
          token?: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: Database["public"]["Enums"]["member_role_enum"]
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_type_defaults: {
        Row: {
          default_modules: Json
          description: string | null
          org_type: Database["public"]["Enums"]["org_type_enum"]
        }
        Insert: {
          default_modules: Json
          description?: string | null
          org_type: Database["public"]["Enums"]["org_type_enum"]
        }
        Update: {
          default_modules?: Json
          description?: string | null
          org_type?: Database["public"]["Enums"]["org_type_enum"]
        }
        Relationships: []
      }
      org_view_config: {
        Row: {
          config_scope: string
          config_value: Json
          created_at: string
          id: string
          org_id: string
          scope_key: string
          updated_at: string
        }
        Insert: {
          config_scope: string
          config_value?: Json
          created_at?: string
          id?: string
          org_id: string
          scope_key: string
          updated_at?: string
        }
        Update: {
          config_scope?: string
          config_value?: Json
          created_at?: string
          id?: string
          org_id?: string
          scope_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_view_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_view_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_view_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_view_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      org_workflow_config: {
        Row: {
          config_key: string
          config_type: string
          config_value: Json
          created_at: string
          id: string
          module: string
          org_id: string
          sort_order: number
          stage_key: string
          updated_at: string
        }
        Insert: {
          config_key: string
          config_type: string
          config_value: Json
          created_at?: string
          id?: string
          module?: string
          org_id: string
          sort_order?: number
          stage_key: string
          updated_at?: string
        }
        Update: {
          config_key?: string
          config_type?: string
          config_value?: Json
          created_at?: string
          id?: string
          module?: string
          org_id?: string
          sort_order?: number
          stage_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_workflow_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_workflow_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_workflow_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "org_workflow_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      organization_member_capabilities: {
        Row: {
          capability: string
          created_at: string
          granted_by: string | null
          id: string
          org_id: string
          user_id: string
        }
        Insert: {
          capability: string
          created_at?: string
          granted_by?: string | null
          id?: string
          org_id: string
          user_id: string
        }
        Update: {
          capability?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_member_capabilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_member_capabilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_member_capabilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "organization_member_capabilities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      organization_members: {
        Row: {
          accepted_at: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invited_by: string | null
          notification_prefs: Json
          org_id: string
          role: Database["public"]["Enums"]["member_role_enum"]
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invited_by?: string | null
          notification_prefs?: Json
          org_id: string
          role?: Database["public"]["Enums"]["member_role_enum"]
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invited_by?: string | null
          notification_prefs?: Json
          org_id?: string
          role?: Database["public"]["Enums"]["member_role_enum"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "organization_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      organizations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          ai_instructions: string | null
          branding: Json
          city: string | null
          country: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          ein: string | null
          id: string
          is_active: boolean
          modules: Json
          name: string
          org_type: Database["public"]["Enums"]["org_type_enum"]
          org_type_config: Json
          phone: string | null
          slug: string | null
          state: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          ai_instructions?: string | null
          branding?: Json
          city?: string | null
          country?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          ein?: string | null
          id?: string
          is_active?: boolean
          modules?: Json
          name: string
          org_type?: Database["public"]["Enums"]["org_type_enum"]
          org_type_config?: Json
          phone?: string | null
          slug?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          ai_instructions?: string | null
          branding?: Json
          city?: string | null
          country?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          ein?: string | null
          id?: string
          is_active?: boolean
          modules?: Json
          name?: string
          org_type?: Database["public"]["Enums"]["org_type_enum"]
          org_type_config?: Json
          phone?: string | null
          slug?: string | null
          state?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: []
      }
      payout_history: {
        Row: {
          carryover_from_prior_year: number | null
          created_at: string
          distributable_amount: number | null
          excess_applied_to_prior_year: number | null
          excess_distributions: number | null
          id: string
          is_finalized: boolean
          minimum_investment_return: number | null
          net_value_non_charitable: number | null
          notes: string | null
          portfolio_id: string
          qualifying_distributions_made: number | null
          tax_year: number
          underdistribution: number | null
          updated_at: string
        }
        Insert: {
          carryover_from_prior_year?: number | null
          created_at?: string
          distributable_amount?: number | null
          excess_applied_to_prior_year?: number | null
          excess_distributions?: number | null
          id?: string
          is_finalized?: boolean
          minimum_investment_return?: number | null
          net_value_non_charitable?: number | null
          notes?: string | null
          portfolio_id: string
          qualifying_distributions_made?: number | null
          tax_year: number
          underdistribution?: number | null
          updated_at?: string
        }
        Update: {
          carryover_from_prior_year?: number | null
          created_at?: string
          distributable_amount?: number | null
          excess_applied_to_prior_year?: number | null
          excess_distributions?: number | null
          id?: string
          is_finalized?: boolean
          minimum_investment_return?: number | null
          net_value_non_charitable?: number | null
          notes?: string | null
          portfolio_id?: string
          qualifying_distributions_made?: number | null
          tax_year?: number
          underdistribution?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payout_history_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payout_history_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      pledge_events: {
        Row: {
          actor_id: string | null
          after_values: Json | null
          before_values: Json | null
          created_at: string
          event_type: Database["public"]["Enums"]["pledge_event_type_enum"]
          id: string
          installment_id: string | null
          notes: string | null
          org_id: string
          pledge_id: string
        }
        Insert: {
          actor_id?: string | null
          after_values?: Json | null
          before_values?: Json | null
          created_at?: string
          event_type: Database["public"]["Enums"]["pledge_event_type_enum"]
          id?: string
          installment_id?: string | null
          notes?: string | null
          org_id: string
          pledge_id: string
        }
        Update: {
          actor_id?: string | null
          after_values?: Json | null
          before_values?: Json | null
          created_at?: string
          event_type?: Database["public"]["Enums"]["pledge_event_type_enum"]
          id?: string
          installment_id?: string | null
          notes?: string | null
          org_id?: string
          pledge_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pledge_events_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "pledge_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledge_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledge_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledge_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "pledge_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "pledge_events_pledge_id_fkey"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "pledges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledge_events_pledge_id_fkey"
            columns: ["pledge_id"]
            isOneToOne: false
            referencedRelation: "v_pledge_pipeline"
            referencedColumns: ["id"]
          },
        ]
      }
      pledge_installments: {
        Row: {
          acted_by: string | null
          amount: number
          contribution_id: string | null
          created_at: string
          due_date: string
          id: string
          notes: string | null
          org_id: string
          paid_at: string | null
          payment_ref: string | null
          pledge_id: string
          status: Database["public"]["Enums"]["pledge_installment_status_enum"]
          updated_at: string
          waived_at: string | null
          written_off_at: string | null
        }
        Insert: {
          acted_by?: string | null
          amount: number
          contribution_id?: string | null
          created_at?: string
          due_date: string
          id?: string
          notes?: string | null
          org_id: string
          paid_at?: string | null
          payment_ref?: string | null
          pledge_id: string
          status?: Database["public"]["Enums"]["pledge_installment_status_enum"]
          updated_at?: string
          waived_at?: string | null
          written_off_at?: string | null
        }
        Update: {
          acted_by?: string | null
          amount?: number
          contribution_id?: string | null
          created_at?: string
          due_date?: string
          id?: string
          notes?: string | null
          org_id?: string
          paid_at?: string | null
          payment_ref?: string | null
          pledge_id?: string
          status?: Database["public"]["Enums"]["pledge_installment_status_enum"]
          updated_at?: string
          waived_at?: string | null
          written_off_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pledge_installments_org_contribution_fk"
            columns: ["org_id", "contribution_id"]
            isOneToOne: false
            referencedRelation: "contributions_received"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pledge_installments_org_contribution_fk"
            columns: ["org_id", "contribution_id"]
            isOneToOne: false
            referencedRelation: "v_contribution_with_donor"
            referencedColumns: ["org_id", "contribution_id"]
          },
          {
            foreignKeyName: "pledge_installments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledge_installments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledge_installments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "pledge_installments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "pledge_installments_org_pledge_fk"
            columns: ["org_id", "pledge_id"]
            isOneToOne: false
            referencedRelation: "pledges"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pledge_installments_org_pledge_fk"
            columns: ["org_id", "pledge_id"]
            isOneToOne: false
            referencedRelation: "v_pledge_pipeline"
            referencedColumns: ["org_id", "id"]
          },
        ]
      }
      pledges: {
        Row: {
          campaign: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          commitment_type: Database["public"]["Enums"]["pledge_commitment_type_enum"]
          created_at: string
          created_by: string | null
          currency: string
          custom_fields: Json
          deleted_at: string | null
          deleted_by: string | null
          donor_id: string
          end_date: string | null
          external_id: string | null
          frequency: Database["public"]["Enums"]["pledge_frequency_enum"]
          fund_designation: string | null
          id: string
          notes: string | null
          org_id: string
          relationship_manager: string | null
          restriction_purpose: string | null
          signed_at: string | null
          source: string | null
          start_date: string
          status: Database["public"]["Enums"]["pledge_status_enum"]
          total_amount: number
          updated_at: string
        }
        Insert: {
          campaign?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          commitment_type?: Database["public"]["Enums"]["pledge_commitment_type_enum"]
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_fields?: Json
          deleted_at?: string | null
          deleted_by?: string | null
          donor_id: string
          end_date?: string | null
          external_id?: string | null
          frequency?: Database["public"]["Enums"]["pledge_frequency_enum"]
          fund_designation?: string | null
          id?: string
          notes?: string | null
          org_id: string
          relationship_manager?: string | null
          restriction_purpose?: string | null
          signed_at?: string | null
          source?: string | null
          start_date: string
          status?: Database["public"]["Enums"]["pledge_status_enum"]
          total_amount: number
          updated_at?: string
        }
        Update: {
          campaign?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          commitment_type?: Database["public"]["Enums"]["pledge_commitment_type_enum"]
          created_at?: string
          created_by?: string | null
          currency?: string
          custom_fields?: Json
          deleted_at?: string | null
          deleted_by?: string | null
          donor_id?: string
          end_date?: string | null
          external_id?: string | null
          frequency?: Database["public"]["Enums"]["pledge_frequency_enum"]
          fund_designation?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          relationship_manager?: string | null
          restriction_purpose?: string | null
          signed_at?: string | null
          source?: string | null
          start_date?: string
          status?: Database["public"]["Enums"]["pledge_status_enum"]
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pledges_org_donor_fk"
            columns: ["org_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pledges_org_donor_fk"
            columns: ["org_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["org_id", "donor_id"]
          },
          {
            foreignKeyName: "pledges_org_donor_fk"
            columns: ["org_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      portfolio_charities: {
        Row: {
          added_by: string | null
          charity_ein: string
          created_at: string
          id: string
          max_investment: number | null
          min_investment: number | null
          notes: string | null
          portfolio_id: string
          status: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          charity_ein: string
          created_at?: string
          id?: string
          max_investment?: number | null
          min_investment?: number | null
          notes?: string | null
          portfolio_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          charity_ein?: string
          created_at?: string
          id?: string
          max_investment?: number | null
          min_investment?: number | null
          notes?: string | null
          portfolio_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_charities_charity_ein_fkey"
            columns: ["charity_ein"]
            isOneToOne: false
            referencedRelation: "charities"
            referencedColumns: ["ein"]
          },
          {
            foreignKeyName: "portfolio_charities_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_charities_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      portfolio_members: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          id: string
          invited_by: string | null
          portfolio_id: string
          role: Database["public"]["Enums"]["member_role_enum"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invited_by?: string | null
          portfolio_id: string
          role?: Database["public"]["Enums"]["member_role_enum"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          id?: string
          invited_by?: string | null
          portfolio_id?: string
          role?: Database["public"]["Enums"]["member_role_enum"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_members_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_members_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      portfolio_recommendations: {
        Row: {
          accreditation: Json | null
          charity_id: string | null
          contact_info: Json | null
          country: string | null
          created_at: string
          description: string | null
          ein: string | null
          id: string
          impact_focus: string[] | null
          interaction_status: string
          location: string | null
          max_investment: number | null
          min_investment: number | null
          order_index: number
          organization_name: string
          portfolio_id: string
          recommended_at: string
          recommended_by: string | null
          sector: string | null
          status: string
          status_updated_at: string | null
          status_updated_by: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          accreditation?: Json | null
          charity_id?: string | null
          contact_info?: Json | null
          country?: string | null
          created_at?: string
          description?: string | null
          ein?: string | null
          id?: string
          impact_focus?: string[] | null
          interaction_status?: string
          location?: string | null
          max_investment?: number | null
          min_investment?: number | null
          order_index?: number
          organization_name: string
          portfolio_id: string
          recommended_at?: string
          recommended_by?: string | null
          sector?: string | null
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          accreditation?: Json | null
          charity_id?: string | null
          contact_info?: Json | null
          country?: string | null
          created_at?: string
          description?: string | null
          ein?: string | null
          id?: string
          impact_focus?: string[] | null
          interaction_status?: string
          location?: string | null
          max_investment?: number | null
          min_investment?: number | null
          order_index?: number
          organization_name?: string
          portfolio_id?: string
          recommended_at?: string
          recommended_by?: string | null
          sector?: string | null
          status?: string
          status_updated_at?: string | null
          status_updated_by?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_recommendations_charity_id_fkey"
            columns: ["charity_id"]
            isOneToOne: false
            referencedRelation: "charities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_recommendations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_recommendations_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      portfolio_risk_snapshots: {
        Row: {
          asset_type_count: number | null
          asset_type_distribution: Json
          concentration_risk_level: string | null
          concentration_top3_holdings: Json
          concentration_top3_percent: number | null
          created_at: string
          geography_count: number | null
          geography_distribution: Json
          geography_risk_level: string | null
          herfindahl_index: number | null
          id: string
          largest_geography_percent: number | null
          largest_sector_percent: number | null
          overall_risk_level: string | null
          overall_risk_score: number | null
          portfolio_id: string
          recommendations: Json
          risk_factors: Json
          sector_count: number | null
          sector_distribution: Json
          sector_risk_level: string | null
          snapshot_date: string
          total_allocation: number
          total_holdings: number
        }
        Insert: {
          asset_type_count?: number | null
          asset_type_distribution?: Json
          concentration_risk_level?: string | null
          concentration_top3_holdings?: Json
          concentration_top3_percent?: number | null
          created_at?: string
          geography_count?: number | null
          geography_distribution?: Json
          geography_risk_level?: string | null
          herfindahl_index?: number | null
          id?: string
          largest_geography_percent?: number | null
          largest_sector_percent?: number | null
          overall_risk_level?: string | null
          overall_risk_score?: number | null
          portfolio_id: string
          recommendations?: Json
          risk_factors?: Json
          sector_count?: number | null
          sector_distribution?: Json
          sector_risk_level?: string | null
          snapshot_date?: string
          total_allocation: number
          total_holdings: number
        }
        Update: {
          asset_type_count?: number | null
          asset_type_distribution?: Json
          concentration_risk_level?: string | null
          concentration_top3_holdings?: Json
          concentration_top3_percent?: number | null
          created_at?: string
          geography_count?: number | null
          geography_distribution?: Json
          geography_risk_level?: string | null
          herfindahl_index?: number | null
          id?: string
          largest_geography_percent?: number | null
          largest_sector_percent?: number | null
          overall_risk_level?: string | null
          overall_risk_score?: number | null
          portfolio_id?: string
          recommendations?: Json
          risk_factors?: Json
          sector_count?: number | null
          sector_distribution?: Json
          sector_risk_level?: string | null
          snapshot_date?: string
          total_allocation?: number
          total_holdings?: number
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_risk_snapshots_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_risk_snapshots_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      portfolio_settings: {
        Row: {
          created_at: string
          id: string
          key: string
          portfolio_id: string
          updated_at: string
          value: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          portfolio_id: string
          updated_at?: string
          value?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          portfolio_id?: string
          updated_at?: string
          value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_settings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_settings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      portfolios: {
        Row: {
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          id: string
          name: string
          org_id: string
          owner_id: string
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name: string
          org_id: string
          owner_id: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          id?: string
          name?: string
          org_id?: string
          owner_id?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "portfolios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          is_app_admin: boolean
          last_org_id: string | null
          phone: string | null
          preferences: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          is_app_admin?: boolean
          last_org_id?: string | null
          phone?: string | null
          preferences?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          is_app_admin?: boolean
          last_org_id?: string | null
          phone?: string | null
          preferences?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_last_org_id_fkey"
            columns: ["last_org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_last_org_id_fkey"
            columns: ["last_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_last_org_id_fkey"
            columns: ["last_org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "profiles_last_org_id_fkey"
            columns: ["last_org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      qb_accounts: {
        Row: {
          account_number: string | null
          connection_id: string
          created_at: string
          currency: string | null
          current_balance: number | null
          description: string | null
          holding_id: string | null
          id: string
          is_active: boolean
          org_id: string
          qb_id: string
          qb_name: string
          qb_subtype: string | null
          qb_type: string | null
          synced_at: string
          updated_at: string
        }
        Insert: {
          account_number?: string | null
          connection_id: string
          created_at?: string
          currency?: string | null
          current_balance?: number | null
          description?: string | null
          holding_id?: string | null
          id?: string
          is_active?: boolean
          org_id: string
          qb_id: string
          qb_name: string
          qb_subtype?: string | null
          qb_type?: string | null
          synced_at?: string
          updated_at?: string
        }
        Update: {
          account_number?: string | null
          connection_id?: string
          created_at?: string
          currency?: string | null
          current_balance?: number | null
          description?: string | null
          holding_id?: string | null
          id?: string
          is_active?: boolean
          org_id?: string
          qb_id?: string
          qb_name?: string
          qb_subtype?: string | null
          qb_type?: string | null
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "quickbooks_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_accounts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_accounts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "qb_accounts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "qb_accounts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_accounts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_accounts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "qb_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "qb_accounts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      qb_export_attempts: {
        Row: {
          completed_at: string | null
          credit_account_id: string
          debit_account_id: string
          doc_number: string
          error_msg: string | null
          expected_amount: number
          export_type: string
          id: string
          org_id: string
          qb_journal_entry_id: string | null
          source_id: string
          source_table: string
          started_at: string
          status: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          credit_account_id: string
          debit_account_id: string
          doc_number: string
          error_msg?: string | null
          expected_amount: number
          export_type: string
          id?: string
          org_id: string
          qb_journal_entry_id?: string | null
          source_id: string
          source_table: string
          started_at?: string
          status: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          credit_account_id?: string
          debit_account_id?: string
          doc_number?: string
          error_msg?: string | null
          expected_amount?: number
          export_type?: string
          id?: string
          org_id?: string
          qb_journal_entry_id?: string | null
          source_id?: string
          source_table?: string
          started_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_export_attempts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_export_attempts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_export_attempts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "qb_export_attempts_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      qb_sync_log: {
        Row: {
          created_at: string
          error_msg: string | null
          event_type: string
          id: string
          org_id: string
          record_count: number | null
          status: string
        }
        Insert: {
          created_at?: string
          error_msg?: string | null
          event_type: string
          id?: string
          org_id: string
          record_count?: number | null
          status: string
        }
        Update: {
          created_at?: string
          error_msg?: string | null
          event_type?: string
          id?: string
          org_id?: string
          record_count?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_sync_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_sync_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_sync_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "qb_sync_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      qb_transactions: {
        Row: {
          account_id: string | null
          amount: number
          categorized_at: string | null
          categorized_by: string | null
          category: string | null
          connection_id: string
          created_at: string
          currency: string | null
          holding_id: string | null
          id: string
          is_categorized: boolean
          memo: string | null
          name: string | null
          org_id: string
          qb_id: string
          qb_type: string
          raw_payload: Json | null
          synced_at: string
          transaction_date: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          categorized_at?: string | null
          categorized_by?: string | null
          category?: string | null
          connection_id: string
          created_at?: string
          currency?: string | null
          holding_id?: string | null
          id?: string
          is_categorized?: boolean
          memo?: string | null
          name?: string | null
          org_id: string
          qb_id: string
          qb_type: string
          raw_payload?: Json | null
          synced_at?: string
          transaction_date: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          categorized_at?: string | null
          categorized_by?: string | null
          category?: string | null
          connection_id?: string
          created_at?: string
          currency?: string | null
          holding_id?: string | null
          id?: string
          is_categorized?: boolean
          memo?: string | null
          name?: string | null
          org_id?: string
          qb_id?: string
          qb_type?: string
          raw_payload?: Json | null
          synced_at?: string
          transaction_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "qb_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_transactions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "quickbooks_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "qb_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "qb_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "qb_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qb_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "qb_transactions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      qualifying_distributions: {
        Row: {
          created_at: string
          description: string | null
          distribution_date: string
          distribution_type: string | null
          grant_id: string | null
          grant_payment_id: string | null
          id: string
          notes: string | null
          portfolio_id: string
          qualifying_amount: number
          tax_year: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          distribution_date: string
          distribution_type?: string | null
          grant_id?: string | null
          grant_payment_id?: string | null
          id?: string
          notes?: string | null
          portfolio_id: string
          qualifying_amount: number
          tax_year: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          distribution_date?: string
          distribution_type?: string | null
          grant_id?: string | null
          grant_payment_id?: string | null
          id?: string
          notes?: string | null
          portfolio_id?: string
          qualifying_amount?: number
          tax_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qualifying_distributions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualifying_distributions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "qualifying_distributions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "qualifying_distributions_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualifying_distributions_grant_payment_id_fkey"
            columns: ["grant_payment_id"]
            isOneToOne: false
            referencedRelation: "grant_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualifying_distributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qualifying_distributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      quickbooks_connections: {
        Row: {
          access_token: string
          auto_categorize: boolean
          base_currency: string | null
          company_country: string | null
          company_name: string | null
          connected_by: string
          created_at: string
          disconnected_at: string | null
          disconnected_by: string | null
          expires_at: string
          id: string
          last_sync_at: string | null
          last_sync_status: string | null
          org_id: string
          realm_id: string
          refresh_expires_at: string | null
          refresh_token: string
          sync_cursor: string | null
          sync_enabled: boolean
          sync_error: string | null
          sync_interval_hours: number
          token_type: string
          updated_at: string
        }
        Insert: {
          access_token: string
          auto_categorize?: boolean
          base_currency?: string | null
          company_country?: string | null
          company_name?: string | null
          connected_by: string
          created_at?: string
          disconnected_at?: string | null
          disconnected_by?: string | null
          expires_at: string
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          org_id: string
          realm_id: string
          refresh_expires_at?: string | null
          refresh_token: string
          sync_cursor?: string | null
          sync_enabled?: boolean
          sync_error?: string | null
          sync_interval_hours?: number
          token_type?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          auto_categorize?: boolean
          base_currency?: string | null
          company_country?: string | null
          company_name?: string | null
          connected_by?: string
          created_at?: string
          disconnected_at?: string | null
          disconnected_by?: string | null
          expires_at?: string
          id?: string
          last_sync_at?: string | null
          last_sync_status?: string | null
          org_id?: string
          realm_id?: string
          refresh_expires_at?: string | null
          refresh_token?: string
          sync_cursor?: string | null
          sync_enabled?: boolean
          sync_error?: string | null
          sync_interval_hours?: number
          token_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quickbooks_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quickbooks_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "quickbooks_connections_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      recommendation_comments: {
        Row: {
          content: string
          created_at: string
          id: string
          parent_id: string | null
          recommendation_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          parent_id?: string | null
          recommendation_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          parent_id?: string | null
          recommendation_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "recommendation_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recommendation_comments_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "portfolio_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_favorites: {
        Row: {
          created_at: string
          id: string
          recommendation_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          recommendation_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          recommendation_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_favorites_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "portfolio_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      recommendation_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          new_status: string
          notes: string | null
          old_status: string | null
          reason: string | null
          recommendation_id: string
          user_id: string | null
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status: string
          notes?: string | null
          old_status?: string | null
          reason?: string | null
          recommendation_id: string
          user_id?: string | null
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          new_status?: string
          notes?: string | null
          old_status?: string | null
          reason?: string | null
          recommendation_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "recommendation_status_history_recommendation_id_fkey"
            columns: ["recommendation_id"]
            isOneToOne: false
            referencedRelation: "portfolio_recommendations"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          channel: string
          created_at: string
          description: string | null
          due_at: string
          grant_id: string | null
          id: string
          metadata: Json
          org_id: string
          portfolio_id: string | null
          status: string
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          channel?: string
          created_at?: string
          description?: string | null
          due_at: string
          grant_id?: string | null
          id?: string
          metadata?: Json
          org_id: string
          portfolio_id?: string | null
          status?: string
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          description?: string | null
          due_at?: string
          grant_id?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          portfolio_id?: string | null
          status?: string
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "reminders_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "reminders_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "reminders_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "reminders_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "reminders_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      report_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          day_of_month: number | null
          day_of_week: number | null
          delivery_method: string | null
          frequency: string
          id: string
          is_active: boolean
          last_error: string | null
          last_run_at: string | null
          name: string
          next_run_at: string | null
          portfolio_id: string
          recipients: Json
          run_count: number
          template_id: string
          time_of_day: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          delivery_method?: string | null
          frequency: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_run_at?: string | null
          name: string
          next_run_at?: string | null
          portfolio_id: string
          recipients?: Json
          run_count?: number
          template_id: string
          time_of_day?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          day_of_month?: number | null
          day_of_week?: number | null
          delivery_method?: string | null
          frequency?: string
          id?: string
          is_active?: boolean
          last_error?: string | null
          last_run_at?: string | null
          name?: string
          next_run_at?: string | null
          portfolio_id?: string
          recipients?: Json
          run_count?: number
          template_id?: string
          time_of_day?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_schedules_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_schedules_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "report_schedules_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "report_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      report_templates: {
        Row: {
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_default: boolean
          name: string
          portfolio_id: string
          scope: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          portfolio_id: string
          scope?: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          portfolio_id?: string
          scope?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_templates_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_templates_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      reports: {
        Row: {
          content: Json | null
          created_at: string
          created_by: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          expires_at: string | null
          generated_at: string | null
          generation_error: string | null
          id: string
          is_public: boolean
          org_id: string
          period_end: string | null
          period_start: string | null
          portfolio_id: string
          report_type: string
          share_token: string | null
          shared_at: string | null
          status: string
          storage_bucket: string | null
          storage_path: string | null
          template: string | null
          title: string
          updated_at: string
        }
        Insert: {
          content?: Json | null
          created_at?: string
          created_by: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          expires_at?: string | null
          generated_at?: string | null
          generation_error?: string | null
          id?: string
          is_public?: boolean
          org_id: string
          period_end?: string | null
          period_start?: string | null
          portfolio_id: string
          report_type?: string
          share_token?: string | null
          shared_at?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          template?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          content?: Json | null
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          expires_at?: string | null
          generated_at?: string | null
          generation_error?: string | null
          id?: string
          is_public?: boolean
          org_id?: string
          period_end?: string | null
          period_start?: string | null
          portfolio_id?: string
          report_type?: string
          share_token?: string | null
          shared_at?: string | null
          status?: string
          storage_bucket?: string | null
          storage_path?: string | null
          template?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "reports_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "reports_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      self_dealing_incidents: {
        Row: {
          amount_usd: number | null
          correction_date: string | null
          correction_notes: string | null
          created_at: string
          description: string
          disqualified_person_id: string | null
          id: string
          incident_date: string
          notes: string | null
          org_id: string
          reported_on_990pf: boolean
          status: string
          transaction_type: string | null
          updated_at: string
        }
        Insert: {
          amount_usd?: number | null
          correction_date?: string | null
          correction_notes?: string | null
          created_at?: string
          description: string
          disqualified_person_id?: string | null
          id?: string
          incident_date: string
          notes?: string | null
          org_id: string
          reported_on_990pf?: boolean
          status?: string
          transaction_type?: string | null
          updated_at?: string
        }
        Update: {
          amount_usd?: number | null
          correction_date?: string | null
          correction_notes?: string | null
          created_at?: string
          description?: string
          disqualified_person_id?: string | null
          id?: string
          incident_date?: string
          notes?: string | null
          org_id?: string
          reported_on_990pf?: boolean
          status?: string
          transaction_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "self_dealing_incidents_disqualified_person_id_fkey"
            columns: ["disqualified_person_id"]
            isOneToOne: false
            referencedRelation: "disqualified_persons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_dealing_incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_dealing_incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "self_dealing_incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "self_dealing_incidents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      staging_import_contributions: {
        Row: {
          action_taken: string
          created_at: string
          final_contribution_id: string | null
          id: string
          import_job_id: string
          matched_existing_id: string | null
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data: Json | null
          validation_errors: Json | null
          validation_status: string
        }
        Insert: {
          action_taken?: string
          created_at?: string
          final_contribution_id?: string | null
          id?: string
          import_job_id: string
          matched_existing_id?: string | null
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Update: {
          action_taken?: string
          created_at?: string
          final_contribution_id?: string | null
          id?: string
          import_job_id?: string
          matched_existing_id?: string | null
          org_id?: string
          raw_data?: Json
          row_number?: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staging_import_contributions_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "staging_import_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      staging_import_donors: {
        Row: {
          action_taken: string
          created_at: string
          external_id: string | null
          final_id: string | null
          id: string
          import_job_id: string
          matched_existing_id: string | null
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data: Json | null
          validation_errors: Json | null
          validation_status: string
        }
        Insert: {
          action_taken?: string
          created_at?: string
          external_id?: string | null
          final_id?: string | null
          id?: string
          import_job_id: string
          matched_existing_id?: string | null
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Update: {
          action_taken?: string
          created_at?: string
          external_id?: string | null
          final_id?: string | null
          id?: string
          import_job_id?: string
          matched_existing_id?: string | null
          org_id?: string
          raw_data?: Json
          row_number?: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staging_import_donors_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "staging_import_donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      staging_import_holdings: {
        Row: {
          action_taken: string
          ai_suggestion_applied: Json | null
          created_at: string
          final_id: string | null
          id: string
          import_job_id: string
          matched_existing_id: string | null
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data: Json | null
          validation_errors: Json | null
          validation_status: string
        }
        Insert: {
          action_taken?: string
          ai_suggestion_applied?: Json | null
          created_at?: string
          final_id?: string | null
          id?: string
          import_job_id: string
          matched_existing_id?: string | null
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Update: {
          action_taken?: string
          ai_suggestion_applied?: Json | null
          created_at?: string
          final_id?: string | null
          id?: string
          import_job_id?: string
          matched_existing_id?: string | null
          org_id?: string
          raw_data?: Json
          row_number?: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staging_import_holdings_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "staging_import_holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      staging_import_investees: {
        Row: {
          action_taken: string
          created_at: string
          final_id: string | null
          id: string
          import_job_id: string
          matched_charity_id: string | null
          matched_existing_id: string | null
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data: Json | null
          validation_errors: Json | null
          validation_status: string
        }
        Insert: {
          action_taken?: string
          created_at?: string
          final_id?: string | null
          id?: string
          import_job_id: string
          matched_charity_id?: string | null
          matched_existing_id?: string | null
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Update: {
          action_taken?: string
          created_at?: string
          final_id?: string | null
          id?: string
          import_job_id?: string
          matched_charity_id?: string | null
          matched_existing_id?: string | null
          org_id?: string
          raw_data?: Json
          row_number?: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staging_import_investees_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_investees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_investees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_investees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "staging_import_investees_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      staging_import_metrics: {
        Row: {
          action_taken: string
          created_at: string
          final_id: string | null
          id: string
          import_job_id: string
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data: Json | null
          validation_errors: Json | null
          validation_status: string
        }
        Insert: {
          action_taken?: string
          created_at?: string
          final_id?: string | null
          id?: string
          import_job_id: string
          org_id: string
          raw_data: Json
          row_number: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Update: {
          action_taken?: string
          created_at?: string
          final_id?: string | null
          id?: string
          import_job_id?: string
          org_id?: string
          raw_data?: Json
          row_number?: number
          transformed_data?: Json | null
          validation_errors?: Json | null
          validation_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "staging_import_metrics_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "staging_import_metrics_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      staging_import_rows: {
        Row: {
          created_at: string
          id: string
          import_job_id: string
          mapped_row: Json | null
          org_id: string
          review_notes: string | null
          review_status: Database["public"]["Enums"]["import_status_enum"]
          reviewed_at: string | null
          reviewed_by: string | null
          source_row: Json
          source_type: string
          target_record_id: string | null
          validation_errors: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          import_job_id: string
          mapped_row?: Json | null
          org_id: string
          review_notes?: string | null
          review_status?: Database["public"]["Enums"]["import_status_enum"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_row: Json
          source_type: string
          target_record_id?: string | null
          validation_errors?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          import_job_id?: string
          mapped_row?: Json | null
          org_id?: string
          review_notes?: string | null
          review_status?: Database["public"]["Enums"]["import_status_enum"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          source_row?: Json
          source_type?: string
          target_record_id?: string | null
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_staging_import_rows_import_job_id"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_rows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_rows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_import_rows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "staging_import_rows_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      staging_metric_facts: {
        Row: {
          approved: boolean
          created_at: string
          data_quality_score: number | null
          holding_id: string | null
          id: string
          import_job_id: string | null
          metric_code: string | null
          metric_name: string | null
          period_end: string | null
          period_start: string | null
          raw: Json | null
          review_notes: string | null
          review_status: Database["public"]["Enums"]["import_status_enum"]
          source: string | null
          source_row: Json | null
          submitted_by_org_id: string | null
          unit: string | null
          upload_id: string | null
          value: number | null
          verification_level: string | null
        }
        Insert: {
          approved?: boolean
          created_at?: string
          data_quality_score?: number | null
          holding_id?: string | null
          id?: string
          import_job_id?: string | null
          metric_code?: string | null
          metric_name?: string | null
          period_end?: string | null
          period_start?: string | null
          raw?: Json | null
          review_notes?: string | null
          review_status?: Database["public"]["Enums"]["import_status_enum"]
          source?: string | null
          source_row?: Json | null
          submitted_by_org_id?: string | null
          unit?: string | null
          upload_id?: string | null
          value?: number | null
          verification_level?: string | null
        }
        Update: {
          approved?: boolean
          created_at?: string
          data_quality_score?: number | null
          holding_id?: string | null
          id?: string
          import_job_id?: string | null
          metric_code?: string | null
          metric_name?: string | null
          period_end?: string | null
          period_start?: string | null
          raw?: Json | null
          review_notes?: string | null
          review_status?: Database["public"]["Enums"]["import_status_enum"]
          source?: string | null
          source_row?: Json | null
          submitted_by_org_id?: string | null
          unit?: string | null
          upload_id?: string | null
          value?: number | null
          verification_level?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_staging_metric_facts_import_job_id"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_metric_facts_metric_code_fk"
            columns: ["metric_code"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "staging_metric_facts_submitted_by_org_id_fkey"
            columns: ["submitted_by_org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_metric_facts_submitted_by_org_id_fkey"
            columns: ["submitted_by_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staging_metric_facts_submitted_by_org_id_fkey"
            columns: ["submitted_by_org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "staging_metric_facts_submitted_by_org_id_fkey"
            columns: ["submitted_by_org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "staging_metric_facts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      state_registrations: {
        Row: {
          annual_fee: number | null
          attachments: Json | null
          created_at: string
          exemption_basis: string | null
          expiration_date: string | null
          id: string
          last_renewed_date: string | null
          notes: string | null
          org_id: string
          registration_date: string | null
          registration_number: string | null
          registration_type: string
          renewal_due_date: string | null
          state: string
          status: string
          updated_at: string
        }
        Insert: {
          annual_fee?: number | null
          attachments?: Json | null
          created_at?: string
          exemption_basis?: string | null
          expiration_date?: string | null
          id?: string
          last_renewed_date?: string | null
          notes?: string | null
          org_id: string
          registration_date?: string | null
          registration_number?: string | null
          registration_type?: string
          renewal_due_date?: string | null
          state: string
          status?: string
          updated_at?: string
        }
        Update: {
          annual_fee?: number | null
          attachments?: Json | null
          created_at?: string
          exemption_basis?: string | null
          expiration_date?: string | null
          id?: string
          last_renewed_date?: string | null
          notes?: string | null
          org_id?: string
          registration_date?: string | null
          registration_number?: string | null
          registration_type?: string
          renewal_due_date?: string | null
          state?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_registrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_registrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_registrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "state_registrations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      task_automation_outbox: {
        Row: {
          actor_id: string | null
          attempts: number
          available_at: string
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          org_id: string
          payload: Json
          status: string
          task_event_id: string
          task_id: string
          updated_at: string
        }
        Insert: {
          actor_id?: string | null
          attempts?: number
          available_at?: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          org_id: string
          payload?: Json
          status?: string
          task_event_id: string
          task_id: string
          updated_at?: string
        }
        Update: {
          actor_id?: string | null
          attempts?: number
          available_at?: string
          claimed_at?: string | null
          completed_at?: string | null
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          org_id?: string
          payload?: Json
          status?: string
          task_event_id?: string
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_automation_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_automation_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_automation_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "task_automation_outbox_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "task_automation_outbox_task_event_id_fkey"
            columns: ["task_event_id"]
            isOneToOne: true
            referencedRelation: "task_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_automation_outbox_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_automation_runs: {
        Row: {
          completed_at: string | null
          completed_count: number
          created_at: string
          created_count: number
          dry_run: boolean
          error_count: number
          id: string
          metadata: Json
          org_id: string | null
          producer: string | null
          scanned: number
          skipped_count: number
          status: string
          updated_count: number
        }
        Insert: {
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          created_count?: number
          dry_run?: boolean
          error_count?: number
          id?: string
          metadata?: Json
          org_id?: string | null
          producer?: string | null
          scanned?: number
          skipped_count?: number
          status?: string
          updated_count?: number
        }
        Update: {
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          created_count?: number
          dry_run?: boolean
          error_count?: number
          id?: string
          metadata?: Json
          org_id?: string | null
          producer?: string | null
          scanned?: number
          skipped_count?: number
          status?: string
          updated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "task_automation_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          org_id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          org_id: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          org_id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "task_comments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_entity_links: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          org_id: string
          relationship: string
          task_id: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          org_id: string
          relationship?: string
          task_id: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          org_id?: string
          relationship?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_entity_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_entity_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_entity_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "task_entity_links_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "task_entity_links_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_events: {
        Row: {
          actor_id: string | null
          after_values: Json | null
          before_values: Json | null
          created_at: string
          event_type: string
          id: string
          org_id: string
          task_id: string | null
        }
        Insert: {
          actor_id?: string | null
          after_values?: Json | null
          before_values?: Json | null
          created_at?: string
          event_type: string
          id?: string
          org_id: string
          task_id?: string | null
        }
        Update: {
          actor_id?: string | null
          after_values?: Json | null
          before_values?: Json | null
          created_at?: string
          event_type?: string
          id?: string
          org_id?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "task_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "task_events_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          due_at: string | null
          id: string
          metadata: Json
          org_id: string
          portfolio_id: string | null
          priority: string
          source: string
          source_key: string | null
          starts_at: string | null
          status: string
          task_type: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          org_id: string
          portfolio_id?: string | null
          priority?: string
          source?: string
          source_key?: string | null
          starts_at?: string | null
          status?: string
          task_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          portfolio_id?: string | null
          priority?: string
          source?: string
          source_key?: string | null
          starts_at?: string | null
          status?: string
          task_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tasks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tasks_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      tax_carryforward_applications: {
        Row: {
          amount_applied: number
          amount_remaining_after: number
          applied_at: string
          applied_by: string | null
          applied_tax_year: number
          carryforward_id: string
          created_at: string
          id: string
          notes: string | null
          org_id: string
          portfolio_id: string
          updated_at: string
        }
        Insert: {
          amount_applied: number
          amount_remaining_after: number
          applied_at?: string
          applied_by?: string | null
          applied_tax_year: number
          carryforward_id: string
          created_at?: string
          id?: string
          notes?: string | null
          org_id: string
          portfolio_id: string
          updated_at?: string
        }
        Update: {
          amount_applied?: number
          amount_remaining_after?: number
          applied_at?: string
          applied_by?: string | null
          applied_tax_year?: number
          carryforward_id?: string
          created_at?: string
          id?: string
          notes?: string | null
          org_id?: string
          portfolio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_carryforward_applications_carryforward_id_fkey"
            columns: ["carryforward_id"]
            isOneToOne: false
            referencedRelation: "tax_carryforwards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforward_applications_carryforward_id_fkey"
            columns: ["carryforward_id"]
            isOneToOne: false
            referencedRelation: "v_active_carryforwards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforward_applications_carryforward_id_fkey"
            columns: ["carryforward_id"]
            isOneToOne: false
            referencedRelation: "v_carryforward_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforward_applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforward_applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforward_applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_carryforward_applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_carryforward_applications_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforward_applications_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      tax_carryforwards: {
        Row: {
          agi_limit_category: string
          amount: number
          amount_remaining: number
          amount_used_in_year: number
          auto_generated: boolean
          created_at: string
          expires_tax_year: number
          id: string
          notes: string | null
          org_id: string
          originating_tax_year: number
          portfolio_id: string
          recipient_ein: string | null
          recipient_name: string | null
          tax_contribution_id: string | null
          updated_at: string
          used_in_year: number | null
        }
        Insert: {
          agi_limit_category: string
          amount: number
          amount_remaining: number
          amount_used_in_year?: number
          auto_generated?: boolean
          created_at?: string
          expires_tax_year: number
          id?: string
          notes?: string | null
          org_id: string
          originating_tax_year: number
          portfolio_id: string
          recipient_ein?: string | null
          recipient_name?: string | null
          tax_contribution_id?: string | null
          updated_at?: string
          used_in_year?: number | null
        }
        Update: {
          agi_limit_category?: string
          amount?: number
          amount_remaining?: number
          amount_used_in_year?: number
          auto_generated?: boolean
          created_at?: string
          expires_tax_year?: number
          id?: string
          notes?: string | null
          org_id?: string
          originating_tax_year?: number
          portfolio_id?: string
          recipient_ein?: string | null
          recipient_name?: string | null
          tax_contribution_id?: string | null
          updated_at?: string
          used_in_year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_carryforwards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_carryforwards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_carryforwards_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "tax_carryforwards_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "tax_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_with_limits"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_contributions: {
        Row: {
          acknowledgment_date: string | null
          acknowledgment_received: boolean
          acknowledgment_storage_path: string | null
          agi_limit_category: string | null
          agi_limit_percentage: number | null
          amount_usd: number
          applied_to_tax_year: number | null
          appraisal_date: string | null
          appraisal_storage_path: string | null
          appraisal_value: number | null
          appraiser_ein: string | null
          appraiser_name: string | null
          appraiser_tin: string | null
          carryforward_year: number | null
          contribution_date: string
          contribution_type: string
          cost_basis: number | null
          created_at: string
          currency: string
          date_acquired: string | null
          deductible_amount: number | null
          description_of_property: string | null
          external_id: string | null
          fair_market_value: number | null
          fmv_at_donation: number | null
          form8283_required: boolean | null
          holding_contribution_id: string | null
          holding_id: string | null
          id: string
          is_carryforward: boolean
          is_qcd: boolean | null
          is_qualified_organization: boolean
          notes: string | null
          org_id: string
          portfolio_id: string
          property_description: string | null
          qb_exported_at: string | null
          qb_journal_entry_id: string | null
          qcd_distribution_amount: number | null
          qcd_qualified: boolean
          quid_pro_quo_value: number
          receipt_storage_path: string | null
          recipient_ein: string | null
          recipient_name: string
          recipient_type: string | null
          requires_appraisal: boolean
          source_system: string | null
          tax_year: number
          updated_at: string
        }
        Insert: {
          acknowledgment_date?: string | null
          acknowledgment_received?: boolean
          acknowledgment_storage_path?: string | null
          agi_limit_category?: string | null
          agi_limit_percentage?: number | null
          amount_usd: number
          applied_to_tax_year?: number | null
          appraisal_date?: string | null
          appraisal_storage_path?: string | null
          appraisal_value?: number | null
          appraiser_ein?: string | null
          appraiser_name?: string | null
          appraiser_tin?: string | null
          carryforward_year?: number | null
          contribution_date: string
          contribution_type: string
          cost_basis?: number | null
          created_at?: string
          currency?: string
          date_acquired?: string | null
          deductible_amount?: number | null
          description_of_property?: string | null
          external_id?: string | null
          fair_market_value?: number | null
          fmv_at_donation?: number | null
          form8283_required?: boolean | null
          holding_contribution_id?: string | null
          holding_id?: string | null
          id?: string
          is_carryforward?: boolean
          is_qcd?: boolean | null
          is_qualified_organization?: boolean
          notes?: string | null
          org_id: string
          portfolio_id: string
          property_description?: string | null
          qb_exported_at?: string | null
          qb_journal_entry_id?: string | null
          qcd_distribution_amount?: number | null
          qcd_qualified?: boolean
          quid_pro_quo_value?: number
          receipt_storage_path?: string | null
          recipient_ein?: string | null
          recipient_name: string
          recipient_type?: string | null
          requires_appraisal?: boolean
          source_system?: string | null
          tax_year: number
          updated_at?: string
        }
        Update: {
          acknowledgment_date?: string | null
          acknowledgment_received?: boolean
          acknowledgment_storage_path?: string | null
          agi_limit_category?: string | null
          agi_limit_percentage?: number | null
          amount_usd?: number
          applied_to_tax_year?: number | null
          appraisal_date?: string | null
          appraisal_storage_path?: string | null
          appraisal_value?: number | null
          appraiser_ein?: string | null
          appraiser_name?: string | null
          appraiser_tin?: string | null
          carryforward_year?: number | null
          contribution_date?: string
          contribution_type?: string
          cost_basis?: number | null
          created_at?: string
          currency?: string
          date_acquired?: string | null
          deductible_amount?: number | null
          description_of_property?: string | null
          external_id?: string | null
          fair_market_value?: number | null
          fmv_at_donation?: number | null
          form8283_required?: boolean | null
          holding_contribution_id?: string | null
          holding_id?: string | null
          id?: string
          is_carryforward?: boolean
          is_qcd?: boolean | null
          is_qualified_organization?: boolean
          notes?: string | null
          org_id?: string
          portfolio_id?: string
          property_description?: string | null
          qb_exported_at?: string | null
          qb_journal_entry_id?: string | null
          qcd_distribution_amount?: number | null
          qcd_qualified?: boolean
          quid_pro_quo_value?: number
          receipt_storage_path?: string | null
          recipient_ein?: string | null
          recipient_name?: string
          recipient_type?: string | null
          requires_appraisal?: boolean
          source_system?: string | null
          tax_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      tax_documents: {
        Row: {
          created_at: string
          document_type: string
          file_name: string
          file_size_bytes: number | null
          generated_by_system: boolean
          id: string
          metadata: Json
          mime_type: string | null
          notes: string | null
          org_id: string
          portfolio_id: string
          storage_bucket: string
          storage_path: string
          tax_contribution_id: string | null
          tax_year: number
          updated_at: string
          uploaded_at: string
        }
        Insert: {
          created_at?: string
          document_type: string
          file_name: string
          file_size_bytes?: number | null
          generated_by_system?: boolean
          id?: string
          metadata?: Json
          mime_type?: string | null
          notes?: string | null
          org_id: string
          portfolio_id: string
          storage_bucket?: string
          storage_path: string
          tax_contribution_id?: string | null
          tax_year: number
          updated_at?: string
          uploaded_at?: string
        }
        Update: {
          created_at?: string
          document_type?: string
          file_name?: string
          file_size_bytes?: number | null
          generated_by_system?: boolean
          id?: string
          metadata?: Json
          mime_type?: string | null
          notes?: string | null
          org_id?: string
          portfolio_id?: string
          storage_bucket?: string
          storage_path?: string
          tax_contribution_id?: string | null
          tax_year?: number
          updated_at?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_documents_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_documents_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "tax_documents_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "tax_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_documents_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_with_limits"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_profiles: {
        Row: {
          carryforward_from_prior: number
          created_at: string
          estimated_agi: number | null
          filing_status: string | null
          id: string
          org_id: string
          portfolio_id: string
          tax_year: number
          updated_at: string
        }
        Insert: {
          carryforward_from_prior?: number
          created_at?: string
          estimated_agi?: number | null
          filing_status?: string | null
          id?: string
          org_id: string
          portfolio_id: string
          tax_year: number
          updated_at?: string
        }
        Update: {
          carryforward_from_prior?: number
          created_at?: string
          estimated_agi?: number | null
          filing_status?: string | null
          id?: string
          org_id?: string
          portfolio_id?: string
          tax_year?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_profiles_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_profiles_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      tax_years: {
        Row: {
          adjusted_gross_income: number | null
          agi_limit_20_pct: number | null
          agi_limit_30_pct: number | null
          agi_limit_50_pct: number | null
          agi_limit_60_pct: number | null
          amt_exposure: boolean
          amt_notes: string | null
          carryforward_from_prior_years: number
          created_at: string
          filing_status: string | null
          id: string
          notes: string | null
          org_id: string
          portfolio_id: string
          standard_deduction: number | null
          tax_year: number
          total_contributions_20_pct: number
          total_contributions_30_pct: number
          total_contributions_50_pct: number
          total_contributions_60_pct: number
          updated_at: string
        }
        Insert: {
          adjusted_gross_income?: number | null
          agi_limit_20_pct?: number | null
          agi_limit_30_pct?: number | null
          agi_limit_50_pct?: number | null
          agi_limit_60_pct?: number | null
          amt_exposure?: boolean
          amt_notes?: string | null
          carryforward_from_prior_years?: number
          created_at?: string
          filing_status?: string | null
          id?: string
          notes?: string | null
          org_id: string
          portfolio_id: string
          standard_deduction?: number | null
          tax_year: number
          total_contributions_20_pct?: number
          total_contributions_30_pct?: number
          total_contributions_50_pct?: number
          total_contributions_60_pct?: number
          updated_at?: string
        }
        Update: {
          adjusted_gross_income?: number | null
          agi_limit_20_pct?: number | null
          agi_limit_30_pct?: number | null
          agi_limit_50_pct?: number | null
          agi_limit_60_pct?: number | null
          amt_exposure?: boolean
          amt_notes?: string | null
          carryforward_from_prior_years?: number
          created_at?: string
          filing_status?: string | null
          id?: string
          notes?: string | null
          org_id?: string
          portfolio_id?: string
          standard_deduction?: number | null
          tax_year?: number
          total_contributions_20_pct?: number
          total_contributions_30_pct?: number
          total_contributions_50_pct?: number
          total_contributions_60_pct?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_years_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_years_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_years_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_years_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_years_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_years_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      uploads: {
        Row: {
          ai_mode: boolean
          bucket: string
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          file_ext: string | null
          file_name: string | null
          filename: string
          holding_id: string | null
          id: string
          import_job_id: string | null
          mime_type: string | null
          org_id: string
          original_name: string
          portfolio_id: string | null
          selected_metrics: string[] | null
          size_bytes: number | null
          status: string
          storage_path: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          ai_mode?: boolean
          bucket?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          file_ext?: string | null
          file_name?: string | null
          filename: string
          holding_id?: string | null
          id?: string
          import_job_id?: string | null
          mime_type?: string | null
          org_id: string
          original_name: string
          portfolio_id?: string | null
          selected_metrics?: string[] | null
          size_bytes?: number | null
          status?: string
          storage_path: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          ai_mode?: boolean
          bucket?: string
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          file_ext?: string | null
          file_name?: string | null
          filename?: string
          holding_id?: string | null
          id?: string
          import_job_id?: string | null
          mime_type?: string | null
          org_id?: string
          original_name?: string
          portfolio_id?: string | null
          selected_metrics?: string[] | null
          size_bytes?: number | null
          status?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_uploads_import_job_id"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "uploads_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "uploads_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "uploads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "uploads_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "uploads_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "uploads_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      widgets: {
        Row: {
          config: Json
          created_at: string
          id: string
          portfolio_id: string
          position: number
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          portfolio_id: string
          position?: number
          title?: string | null
          type: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          portfolio_id?: string
          position?: number
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "widgets_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "widgets_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      workflow_instances: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string | null
          due_at: string | null
          due_date: string | null
          grant_id: string | null
          id: string
          metadata: Json
          name: string
          notes: string | null
          org_id: string
          portfolio_id: string | null
          started_at: string
          status: string
          template_id: string | null
          updated_at: string
          workflow_type: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          due_date?: string | null
          grant_id?: string | null
          id?: string
          metadata?: Json
          name: string
          notes?: string | null
          org_id: string
          portfolio_id?: string | null
          started_at?: string
          status?: string
          template_id?: string | null
          updated_at?: string
          workflow_type?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          due_date?: string | null
          grant_id?: string | null
          id?: string
          metadata?: Json
          name?: string
          notes?: string | null
          org_id?: string
          portfolio_id?: string | null
          started_at?: string
          status?: string
          template_id?: string | null
          updated_at?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_instances_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "workflow_instances_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "workflow_instances_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "workflow_instances_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "workflow_instances_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_instances_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "workflow_instances_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "workflow_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          created_at: string
          depends_on_task_id: string | null
          description: string | null
          due_date: string | null
          id: string
          is_required: boolean
          name: string
          outcome: string | null
          outcome_notes: string | null
          sequence_order: number
          status: string
          step_id: string | null
          task_id: string | null
          updated_at: string
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          depends_on_task_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          name: string
          outcome?: string | null
          outcome_notes?: string | null
          sequence_order?: number
          status?: string
          step_id?: string | null
          task_id?: string | null
          updated_at?: string
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          depends_on_task_id?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          name?: string
          outcome?: string | null
          outcome_notes?: string | null
          sequence_order?: number
          status?: string
          step_id?: string | null
          task_id?: string | null
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_tasks_depends_on_task_id_fkey"
            columns: ["depends_on_task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_tasks_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflow_instances"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_templates: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          name: string
          org_id: string | null
          steps: Json
          updated_at: string
          workflow_type: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name: string
          org_id?: string | null
          steps?: Json
          updated_at?: string
          workflow_type: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          name?: string
          org_id?: string | null
          steps?: Json
          updated_at?: string
          workflow_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "workflow_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
    }
    Views: {
      my_organizations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          ai_instructions: string | null
          branding: Json | null
          city: string | null
          country: string | null
          created_at: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          ein: string | null
          id: string | null
          is_active: boolean | null
          membership_accepted_at: string | null
          modules: Json | null
          my_role: Database["public"]["Enums"]["member_role_enum"] | null
          name: string | null
          org_type: Database["public"]["Enums"]["org_type_enum"] | null
          org_type_config: Json | null
          phone: string | null
          slug: string | null
          state: string | null
          updated_at: string | null
          website: string | null
          zip: string | null
        }
        Relationships: []
      }
      v_active_carryforwards: {
        Row: {
          agi_limit_category: string | null
          amount_remaining: number | null
          amount_used: number | null
          asset_type: Database["public"]["Enums"]["asset_type_enum"] | null
          auto_generated: boolean | null
          contribution_type: string | null
          created_at: string | null
          expires_tax_year: number | null
          id: string | null
          notes: string | null
          original_amount: number | null
          originating_tax_year: number | null
          portfolio_id: string | null
          recipient_name: string | null
          status: string | null
          tax_contribution_id: string | null
          updated_at: string | null
          years_until_expiry: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_carryforwards_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "tax_carryforwards_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "tax_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_with_limits"
            referencedColumns: ["id"]
          },
        ]
      }
      v_active_insights: {
        Row: {
          action_taken: boolean | null
          action_taken_at: string | null
          category: string | null
          change_percent: number | null
          comparison_value: number | null
          created_at: string | null
          data_context: Json | null
          description: string | null
          dismissed_at: string | null
          dismissed_by: string | null
          expires_at: string | null
          holding_id: string | null
          holding_name: string | null
          holding_sector: string | null
          id: string | null
          insight_type: string | null
          is_active: boolean | null
          metric_code: string | null
          metric_value: number | null
          portfolio_id: string | null
          severity: string | null
          suggested_actions: Json | null
          title: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_insights_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "analytics_insights_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_insights_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_asset_allocation: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type_enum"] | null
          holding_count: number | null
          org_id: string | null
          pct_of_portfolio: number | null
          portfolio_id: string | null
          total_invested: number | null
          total_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_benchmark_lookup: {
        Row: {
          benchmark_key: string | null
          benchmark_type: string | null
          confidence_level: string | null
          data_source: string | null
          data_year: number | null
          metric_code: string | null
          metric_value: number | null
          percentile_25: number | null
          percentile_50: number | null
          percentile_75: number | null
          sample_size: number | null
        }
        Insert: {
          benchmark_key?: string | null
          benchmark_type?: string | null
          confidence_level?: string | null
          data_source?: string | null
          data_year?: number | null
          metric_code?: string | null
          metric_value?: number | null
          percentile_25?: number | null
          percentile_50?: number | null
          percentile_75?: number | null
          sample_size?: number | null
        }
        Update: {
          benchmark_key?: string | null
          benchmark_type?: string | null
          confidence_level?: string | null
          data_source?: string | null
          data_year?: number | null
          metric_code?: string | null
          metric_value?: number | null
          percentile_25?: number | null
          percentile_50?: number | null
          percentile_75?: number | null
          sample_size?: number | null
        }
        Relationships: []
      }
      v_builder_ai_requests: {
        Row: {
          created_at: string | null
          org_id: string | null
          request_text: string | null
        }
        Insert: {
          created_at?: string | null
          org_id?: string | null
          request_text?: string | null
        }
        Update: {
          created_at?: string | null
          org_id?: string | null
          request_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "builder_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "builder_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "builder_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      v_builder_tool_usage: {
        Row: {
          call_count: number | null
          org_count: number | null
          tool_name: string | null
        }
        Relationships: []
      }
      v_carryforward_schedule: {
        Row: {
          agi_limit_category: string | null
          amount_remaining: number | null
          amount_used: number | null
          asset_type: Database["public"]["Enums"]["asset_type_enum"] | null
          auto_generated: boolean | null
          contribution_type: string | null
          created_at: string | null
          expires_tax_year: number | null
          id: string | null
          notes: string | null
          original_amount: number | null
          originating_tax_year: number | null
          portfolio_id: string | null
          recipient_name: string | null
          status: string | null
          tax_contribution_id: string | null
          updated_at: string | null
          years_until_expiry: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_carryforwards_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "tax_carryforwards_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "tax_contributions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_carryforwards_tax_contribution_id_fkey"
            columns: ["tax_contribution_id"]
            isOneToOne: false
            referencedRelation: "v_tax_contributions_with_limits"
            referencedColumns: ["id"]
          },
        ]
      }
      v_compliance_dashboard: {
        Row: {
          active_disqualified_persons: number | null
          foundation_type: string | null
          open_self_dealing_incidents: number | null
          org_id: string | null
          overdue_filings: number | null
          registered_states: string[] | null
          upcoming_filings_90d: number | null
        }
        Relationships: []
      }
      v_contribution_with_donor: {
        Row: {
          acknowledgment_sent_at: string | null
          acknowledgment_status: string | null
          amount: number | null
          campaign: string | null
          contribution_date: string | null
          contribution_id: string | null
          donor_email: string | null
          donor_id: string | null
          donor_name: string | null
          gift_type: string | null
          is_pledge: boolean | null
          notes: string | null
          org_id: string | null
          receipt_number: string | null
          receipt_sent_at: string | null
          receipt_status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contributions_received_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_received_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_received_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "contributions_received_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      v_donor_summary: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          average_gift: number | null
          city: string | null
          communication_preference: string | null
          computed_tier: Database["public"]["Enums"]["donor_tier_enum"] | null
          contact_name: string | null
          country: string | null
          created_at: string | null
          custom_fields: Json | null
          days_since_last_gift: number | null
          deleted_at: string | null
          deleted_by: string | null
          display_name: string | null
          do_not_contact: boolean | null
          donor_id: string | null
          donor_tier: Database["public"]["Enums"]["donor_tier_enum"] | null
          email: string | null
          external_id: string | null
          first_gift_date: string | null
          first_name: string | null
          gift_count: number | null
          has_pending_acknowledgments: boolean | null
          has_pending_receipts: boolean | null
          id: string | null
          is_anonymous: boolean | null
          is_organization: boolean | null
          largest_gift: number | null
          last_gift_date: string | null
          last_name: string | null
          lifetime_giving: number | null
          notes: string | null
          org_id: string | null
          organization_name: string | null
          phone: string | null
          preferred_name: string | null
          recency_status:
            | Database["public"]["Enums"]["donor_recency_enum"]
            | null
          relationship_manager: string | null
          source: string | null
          state: string | null
          tags: string[] | null
          tier: Database["public"]["Enums"]["donor_tier_enum"] | null
          total_lifetime_giving: number | null
          total_ytd_giving: number | null
          updated_at: string | null
          zip: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "donors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      v_er_grant_compliance: {
        Row: {
          created_at: string | null
          er_agreement_signed_date: string | null
          er_reports_received_count: number | null
          er_reports_required_count: number | null
          er_status: string | null
          grant_id: string | null
          grant_name: string | null
          grantee_501c3_verified: boolean | null
          grantee_ein: string | null
          grantee_is_public_charity: boolean | null
          id: string | null
          notes: string | null
          portfolio_id: string | null
          reports_outstanding: number | null
          terminal_report_received: boolean | null
          terminal_report_required: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "expenditure_responsibility_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "v_grant_health"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "v_grants"
            referencedColumns: ["grant_id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: true
            referencedRelation: "v_grants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenditure_responsibility_grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_grant_health: {
        Row: {
          active_workflows: number | null
          funds_allocated: number | null
          grant_id: string | null
          grant_name: string | null
          grant_period_end: string | null
          grant_period_start: string | null
          grant_type: string | null
          health_score: number | null
          holding_id: string | null
          milestones_completed: number | null
          milestones_overdue: number | null
          payments_pending: number | null
          portfolio_id: string | null
          reports_overdue: number | null
          reports_submitted: number | null
          risk_level: string | null
          total_disbursed: number | null
          total_milestones: number | null
          total_reports: number | null
          total_scheduled: number | null
          workflow_tasks_pending: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_grants: {
        Row: {
          approved_amount: number | null
          asset_type: string | null
          country: string | null
          currency: string | null
          deliverables: string | null
          funds_allocated: number | null
          grant_id: string | null
          grant_period_end: string | null
          grant_period_start: string | null
          grant_period_status: string | null
          grant_type: string | null
          holding_id: string | null
          id: string | null
          internal_owner_id: string | null
          lifecycle_stage: string | null
          milestone_completion_pct: number | null
          milestones_completed: number | null
          milestones_overdue: number | null
          milestones_pending: number | null
          name: string | null
          next_report_due: string | null
          org_id: string | null
          portfolio_id: string | null
          purpose: string | null
          renewal_date: string | null
          renewal_eligible: boolean | null
          reporting_frequency: string | null
          reports_overdue: number | null
          reports_submitted: number | null
          requested_amount: number | null
          risk_level: string | null
          sector: string | null
          status: string | null
          total_milestones: number | null
          total_reports: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "grants_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_holdings: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          amount_invested: number | null
          as_of: string | null
          asset_type: Database["public"]["Enums"]["asset_type_enum"] | null
          city: string | null
          committed_date: string | null
          cost_basis: number | null
          cost_per_outcome: number | null
          cost_per_outcome_unit: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          current_value: number | null
          cusip: string | null
          custodian: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          ein: string | null
          exit_date: string | null
          external_id: string | null
          fmv: number | null
          focus_area: string[] | null
          funds_allocated: number | null
          geocode_metadata: Json | null
          geocode_provider: string | null
          geocode_status: string | null
          geocoded_at: string | null
          id: string | null
          impact_score: number | null
          investee_id: string | null
          investment_date: string | null
          isin: string | null
          latest_valuation_type: string | null
          latest_value: number | null
          latest_valued_at: string | null
          latitude: number | null
          location_city: string | null
          location_country: string | null
          location_state: string | null
          longitude: number | null
          name: string | null
          notes: string | null
          org_id: string | null
          portfolio_id: string | null
          sector: string | null
          source_system: string | null
          state: string | null
          status: Database["public"]["Enums"]["holding_status_enum"] | null
          tags: string[] | null
          theory_of_action: string | null
          ticker: string | null
          total_org_funding: number | null
          unrealized_gain_loss: number | null
          unrealized_return_pct: number | null
          updated_at: string | null
          valuation_method: string | null
          website: string | null
          zip: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_investee_id_fkey"
            columns: ["investee_id"]
            isOneToOne: false
            referencedRelation: "investees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_holdings_enriched: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          amount_invested: number | null
          as_of: string | null
          asset_type: Database["public"]["Enums"]["asset_type_enum"] | null
          city: string | null
          committed_date: string | null
          cost_basis: number | null
          cost_per_outcome: number | null
          cost_per_outcome_unit: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          current_value: number | null
          cusip: string | null
          custodian: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          ein: string | null
          exit_date: string | null
          external_id: string | null
          fmv: number | null
          focus_area: string[] | null
          funds_allocated: number | null
          geocode_metadata: Json | null
          geocode_provider: string | null
          geocode_status: string | null
          geocoded_at: string | null
          id: string | null
          impact_score: number | null
          investee_id: string | null
          investment_date: string | null
          isin: string | null
          latest_valuation_type: string | null
          latest_value: number | null
          latest_valued_at: string | null
          latitude: number | null
          location_city: string | null
          location_country: string | null
          location_state: string | null
          longitude: number | null
          name: string | null
          notes: string | null
          org_id: string | null
          portfolio_id: string | null
          sector: string | null
          source_system: string | null
          state: string | null
          status: Database["public"]["Enums"]["holding_status_enum"] | null
          tags: string[] | null
          theory_of_action: string | null
          ticker: string | null
          total_org_funding: number | null
          unrealized_gain_loss: number | null
          unrealized_return_pct: number | null
          updated_at: string | null
          valuation_method: string | null
          website: string | null
          zip: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_investee_id_fkey"
            columns: ["investee_id"]
            isOneToOne: false
            referencedRelation: "investees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_investment_performance: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type_enum"] | null
          cost_basis: number | null
          country: string | null
          current_nav: number | null
          ein: string | null
          holding_id: string | null
          invested_at: string | null
          moic: number | null
          name: string | null
          portfolio_id: string | null
          return_pct: number | null
          sector: string | null
          status: Database["public"]["Enums"]["holding_status_enum"] | null
        }
        Insert: {
          asset_type?: Database["public"]["Enums"]["asset_type_enum"] | null
          cost_basis?: number | null
          country?: string | null
          current_nav?: never
          ein?: string | null
          holding_id?: string | null
          invested_at?: string | null
          moic?: never
          name?: string | null
          portfolio_id?: string | null
          return_pct?: never
          sector?: string | null
          status?: Database["public"]["Enums"]["holding_status_enum"] | null
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type_enum"] | null
          cost_basis?: number | null
          country?: string | null
          current_nav?: never
          ein?: string | null
          holding_id?: string | null
          invested_at?: string | null
          moic?: never
          name?: string | null
          portfolio_id?: string | null
          return_pct?: never
          sector?: string | null
          status?: Database["public"]["Enums"]["holding_status_enum"] | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_latest_risk_snapshot: {
        Row: {
          asset_type_count: number | null
          asset_type_distribution: Json | null
          concentration_risk_level: string | null
          concentration_top3_holdings: Json | null
          concentration_top3_percent: number | null
          created_at: string | null
          geography_count: number | null
          geography_distribution: Json | null
          geography_risk_level: string | null
          herfindahl_index: number | null
          id: string | null
          largest_geography_percent: number | null
          largest_sector_percent: number | null
          overall_risk_level: string | null
          overall_risk_score: number | null
          portfolio_id: string | null
          recommendations: Json | null
          risk_factors: Json | null
          sector_count: number | null
          sector_distribution: Json | null
          sector_risk_level: string | null
          snapshot_date: string | null
          total_allocation: number | null
          total_holdings: number | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_risk_snapshots_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_risk_snapshots_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_org_modules: {
        Row: {
          depends_on: string[] | null
          description: string | null
          is_core: boolean | null
          is_enabled: boolean | null
          label: string | null
          org_id: string | null
          org_name: string | null
          slug: string | null
        }
        Relationships: []
      }
      v_pledge_pipeline: {
        Row: {
          campaign: string | null
          created_at: string | null
          currency: string | null
          donor_id: string | null
          donor_name: string | null
          end_date: string | null
          frequency: Database["public"]["Enums"]["pledge_frequency_enum"] | null
          fund_designation: string | null
          id: string | null
          installment_count: number | null
          next_due_amount: number | null
          next_due_date: string | null
          org_id: string | null
          outstanding: number | null
          overdue: number | null
          paid_count: number | null
          pipeline_status: string | null
          received: number | null
          relationship_manager: string | null
          resolved_count: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["pledge_status_enum"] | null
          total_amount: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pledges_org_donor_fk"
            columns: ["org_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "donors"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pledges_org_donor_fk"
            columns: ["org_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["org_id", "donor_id"]
          },
          {
            foreignKeyName: "pledges_org_donor_fk"
            columns: ["org_id", "donor_id"]
            isOneToOne: false
            referencedRelation: "v_donor_summary"
            referencedColumns: ["org_id", "id"]
          },
          {
            foreignKeyName: "pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "pledges_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      v_portfolio_donation_summary: {
        Row: {
          active_donations: number | null
          avg_donation_amount: number | null
          largest_donation: number | null
          linked_tax_contributions: number | null
          portfolio_id: string | null
          total_appreciated_asset_gain: number | null
          total_carryforward_available: number | null
          total_donation_amount: number | null
          total_donations: number | null
          total_tax_deductible_amount: number | null
        }
        Relationships: []
      }
      v_portfolio_donations: {
        Row: {
          created_at: string | null
          funds_allocated: number | null
          has_tax_contribution: boolean | null
          holding: Json | null
          id: string | null
          name: string | null
          portfolio_id: string | null
          status: string | null
          tax_contributions: Json | null
        }
        Relationships: []
      }
      v_portfolio_grant_summary: {
        Row: {
          active_grants: number | null
          attention_needed: number | null
          portfolio_id: string | null
          total_allocated: number | null
          total_grants: number | null
          total_milestones_overdue: number | null
          total_reports_overdue: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grants_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_portfolio_investment_summary: {
        Row: {
          active_holdings: number | null
          country_count: number | null
          portfolio_id: string | null
          portfolio_moic: number | null
          portfolio_return_pct: number | null
          sector_count: number | null
          total_cost_basis: number | null
          total_holdings: number | null
          total_nav: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_portfolio_kpi_latest: {
        Row: {
          baseline_value: number | null
          display_name: string | null
          holding_id: string | null
          kpi_id: string | null
          metric_code: string | null
          metric_name: string | null
          org_id: string | null
          period_end: string | null
          period_start: string | null
          portfolio_id: string | null
          progress_percentage: number | null
          source: string | null
          target_date: string | null
          target_value: number | null
          unit: string | null
          value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_facts_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_metric_code_fk"
            columns: ["metric_code"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["code"]
          },
        ]
      }
      v_portfolio_kpi_series: {
        Row: {
          country: string | null
          created_at: string | null
          display_name: string | null
          holding_id: string | null
          holding_name: string | null
          kpi_id: string | null
          metric_code: string | null
          metric_name: string | null
          org_id: string | null
          period_end: string | null
          period_start: string | null
          portfolio_id: string | null
          sector: string | null
          source: string | null
          unit: string | null
          value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "metric_facts_kpi_id_fkey"
            columns: ["kpi_id"]
            isOneToOne: false
            referencedRelation: "kpi_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_facts_metric_code_fk"
            columns: ["metric_code"]
            isOneToOne: false
            referencedRelation: "metrics"
            referencedColumns: ["code"]
          },
        ]
      }
      v_portfolio_summary: {
        Row: {
          active_holdings: number | null
          avg_impact_score: number | null
          impact_holdings: number | null
          org_id: string | null
          portfolio_id: string | null
          portfolio_name: string | null
          total_current_value: number | null
          total_granted: number | null
          total_holdings: number | null
          total_invested: number | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "portfolios_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
      v_portfolio_tax_summary: {
        Row: {
          agi: number | null
          agi_limit_20_pct: number | null
          agi_limit_30_pct: number | null
          agi_limit_50_pct: number | null
          agi_limit_60_pct: number | null
          carryforward_from_prior_years: number | null
          contributed_20_pct: number | null
          contributed_30_pct: number | null
          contributed_50_pct: number | null
          contributed_60_pct: number | null
          created_at: string | null
          filing_status: string | null
          notes: string | null
          portfolio_id: string | null
          qcd_count: number | null
          remaining_capacity_30_pct: number | null
          remaining_capacity_60_pct: number | null
          standard_deduction: number | null
          tax_year: number | null
          total_capital_gains_avoided: number | null
          total_contributed: number | null
          total_contributions_count: number | null
          total_deductible_this_year: number | null
          total_excess_carryforward: number | null
          total_qcd_amount: number | null
          updated_at: string | null
          utilization_30_pct: number | null
          utilization_60_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_years_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_years_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_tax_contributions_enriched: {
        Row: {
          acknowledgment_date: string | null
          acknowledgment_received: boolean | null
          acknowledgment_storage_path: string | null
          agi_limit_category: string | null
          agi_limit_percentage: number | null
          amount_usd: number | null
          applied_to_tax_year: number | null
          appraisal_date: string | null
          appraisal_storage_path: string | null
          appraisal_value: number | null
          appraiser_ein: string | null
          appraiser_name: string | null
          appraiser_tin: string | null
          calculated_deductible_amount: number | null
          carryforward_year: number | null
          contribution_date: string | null
          contribution_type: string | null
          cost_basis: number | null
          created_at: string | null
          currency: string | null
          date_acquired: string | null
          deductible_amount: number | null
          description_of_property: string | null
          external_id: string | null
          fair_market_value: number | null
          fmv_at_donation: number | null
          form8283_required: boolean | null
          holding_contribution_id: string | null
          holding_id: string | null
          holding_name: string | null
          id: string | null
          is_carryforward: boolean | null
          is_compliant: boolean | null
          is_qcd: boolean | null
          is_qualified_organization: boolean | null
          notes: string | null
          org_id: string | null
          portfolio_id: string | null
          property_description: string | null
          qb_exported_at: string | null
          qb_journal_entry_id: string | null
          qcd_distribution_amount: number | null
          qcd_qualified: boolean | null
          quid_pro_quo_value: number | null
          receipt_storage_path: string | null
          recipient_ein: string | null
          recipient_name: string | null
          recipient_type: string | null
          requires_appraisal: boolean | null
          source_system: string | null
          substantiation_requirement: string | null
          substantiation_status: string | null
          tax_year: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_tax_contributions_with_limits: {
        Row: {
          acknowledgment_date: string | null
          acknowledgment_received: boolean | null
          acknowledgment_storage_path: string | null
          agi: number | null
          agi_limit_amount: number | null
          agi_limit_category: string | null
          agi_limit_percentage: number | null
          amount_usd: number | null
          applied_to_tax_year: number | null
          appraisal_date: string | null
          appraisal_storage_path: string | null
          appraisal_value: number | null
          appraiser_ein: string | null
          appraiser_name: string | null
          appraiser_tin: string | null
          calculated_deductible_amount: number | null
          capital_gains_avoided: number | null
          carryforward_eligible: boolean | null
          carryforward_year: number | null
          carryforward_years: number | null
          contribution_date: string | null
          contribution_type: string | null
          cost_basis: number | null
          created_at: string | null
          currency: string | null
          date_acquired: string | null
          deductible_amount: number | null
          deductible_this_year: number | null
          description_of_property: string | null
          estimated_tax_savings: number | null
          excess_for_carryforward: number | null
          external_id: string | null
          fair_market_value: number | null
          filing_status: string | null
          fmv_at_donation: number | null
          form8283_required: boolean | null
          holding_contribution_id: string | null
          holding_id: string | null
          holding_name: string | null
          id: string | null
          is_carryforward: boolean | null
          is_compliant: boolean | null
          is_qcd: boolean | null
          is_qualified_organization: boolean | null
          notes: string | null
          org_id: string | null
          original_deductible_amount: number | null
          portfolio_id: string | null
          property_description: string | null
          qb_exported_at: string | null
          qb_journal_entry_id: string | null
          qcd_distribution_amount: number | null
          qcd_qualified: boolean | null
          qcd_tax_benefit: number | null
          quid_pro_quo_value: number | null
          receipt_storage_path: string | null
          recipient_ein: string | null
          recipient_name: string | null
          recipient_type: string | null
          requires_appraisal: boolean | null
          source_system: string | null
          substantiation_requirement: string | null
          substantiation_status: string | null
          tax_year: number | null
          updated_at: string | null
          within_agi_limit: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grant_health"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_grants"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_holdings_enriched"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "v_investment_performance"
            referencedColumns: ["holding_id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_tax_deduction_summary: {
        Row: {
          cash_deductions: number | null
          contribution_count: number | null
          noncash_deductions: number | null
          org_id: string | null
          portfolio_id: string | null
          qcd_total: number | null
          tax_year: number | null
          total_deductions: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_contributions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "tax_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_contributions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "v_portfolio_summary"
            referencedColumns: ["portfolio_id"]
          },
        ]
      }
      v_upcoming_filing_deadlines: {
        Row: {
          days_until_due: number | null
          description: string | null
          due_date: string | null
          filing_type: string | null
          id: string | null
          jurisdiction: string | null
          org_id: string | null
          status: string | null
        }
        Insert: {
          days_until_due?: never
          description?: string | null
          due_date?: string | null
          filing_type?: string | null
          id?: string | null
          jurisdiction?: string | null
          org_id?: string | null
          status?: string | null
        }
        Update: {
          days_until_due?: never
          description?: string | null
          due_date?: string | null
          filing_type?: string | null
          id?: string | null
          jurisdiction?: string | null
          org_id?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "filing_calendar_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "my_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_calendar_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "filing_calendar_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_compliance_dashboard"
            referencedColumns: ["org_id"]
          },
          {
            foreignKeyName: "filing_calendar_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "v_org_modules"
            referencedColumns: ["org_id"]
          },
        ]
      }
    }
    Functions: {
      accept_org_invitation: {
        Args: {
          p_invitation_id: string
          p_invitation_token: string
          p_org_id: string
          p_user_id: string
        }
        Returns: Json
      }
      add_task_comment_with_event: {
        Args: {
          p_actor_id: string
          p_body: string
          p_expected_org_id: string
          p_task_id: string
        }
        Returns: Json
      }
      begin_ai_turn: {
        Args: {
          p_content: Json
          p_portfolio_id: string
          p_request_id: string
          p_user_id: string
        }
        Returns: Json
      }
      begin_onboarding_turn: {
        Args: {
          p_content: string
          p_request_id: string
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      bind_ai_turn_execution_plan: {
        Args: {
          p_execution_plan: Json
          p_portfolio_id: string
          p_turn_id: string
          p_user_id: string
        }
        Returns: Json
      }
      bootstrap_app_admin: { Args: never; Returns: boolean }
      builder_claim_code_run: {
        Args: { p_actor: string; p_org_id: string; p_proposal_id: string }
        Returns: {
          reused: boolean
          revision_id: string
        }[]
      }
      calculate_hhi: { Args: { p_portfolio_id: string }; Returns: number }
      can_edit_org: { Args: { p_org_id: string }; Returns: boolean }
      can_edit_portfolio: { Args: { p_portfolio_id: string }; Returns: boolean }
      can_view_org: { Args: { p_org_id: string }; Returns: boolean }
      can_view_portfolio: { Args: { p_portfolio_id: string }; Returns: boolean }
      cancel_pledge_with_obligations: {
        Args: {
          p_actor_id: string
          p_cancellation_reason?: string
          p_org_id: string
          p_pledge_id: string
          p_waive_pending?: boolean
        }
        Returns: Json
      }
      claim_org_automation_outbox: {
        Args: { p_event_id?: string; p_limit?: number; p_org_id?: string }
        Returns: {
          attempts: number
          available_at: string
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          last_error: string | null
          org_id: string
          payload: Json
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "org_automation_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_org_invitation_email_outbox: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          claimed_at: string | null
          created_at: string
          id: string
          invitation_id: string
          invitation_token: string
          last_error: string | null
          message: string | null
          next_attempt_at: string
          org_id: string
          recipient_email: string
          role: Database["public"]["Enums"]["member_role_enum"]
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "org_invitation_email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_task_automation_outbox: {
        Args: { p_event_id?: string; p_limit?: number; p_org_id?: string }
        Returns: {
          actor_id: string | null
          attempts: number
          available_at: string
          claimed_at: string | null
          completed_at: string | null
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          org_id: string
          payload: Json
          status: string
          task_event_id: string
          task_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "task_automation_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      clean_expired_geocode_cache: { Args: never; Returns: number }
      cleanup_staging_pii: {
        Args: { retention_days?: number }
        Returns: number
      }
      complete_ai_turn: {
        Args: {
          p_content: Json
          p_content_blocks: Json
          p_portfolio_id: string
          p_response: Json
          p_turn_id: string
          p_user_id: string
          p_widgets: Json
        }
        Returns: Json
      }
      complete_onboarding_recommendations: {
        Args: {
          p_excluded: Json
          p_recommendations: Json
          p_session_id: string
          p_user_id: string
        }
        Returns: Json
      }
      complete_onboarding_turn: {
        Args: {
          p_assistant_content: string
          p_conversation_state: Json
          p_extractions: Json
          p_ready_for_recommendations: boolean
          p_response: Json
          p_session_id: string
          p_turn_id: string
          p_user_id: string
        }
        Returns: Json
      }
      create_contribution_receipt_acknowledgment: {
        Args: {
          p_actor_id: string
          p_body: string
          p_contribution_id: string
          p_org_id: string
          p_recipient_email?: string
          p_send_immediately?: boolean
          p_subject: string
        }
        Returns: Json
      }
      create_generated_letter: {
        Args: {
          p_content: Json
          p_generated_by: string
          p_portfolio_id: string
        }
        Returns: {
          generated_at: string
          id: string
          version: number
        }[]
      }
      create_grant_with_foundation_records: {
        Args: {
          p_actor_id: string
          p_currency?: string
          p_grant_period_end?: string
          p_grant_period_start?: string
          p_grant_type?: string
          p_internal_owner_id?: string
          p_investee_id?: string
          p_lifecycle_stage?: string
          p_new_grantee?: Json
          p_org_id: string
          p_portfolio_id: string
          p_purpose: string
          p_renewal_eligible?: boolean
          p_reporting_frequency?: string
          p_requested_amount: number
          p_risk_level?: string
          p_workflow_template_id?: string
        }
        Returns: Json
      }
      create_pledge_with_installments: {
        Args: {
          p_campaign: string
          p_commitment_type: Database["public"]["Enums"]["pledge_commitment_type_enum"]
          p_currency: string
          p_donor_id: string
          p_end_date: string
          p_frequency: Database["public"]["Enums"]["pledge_frequency_enum"]
          p_fund_designation: string
          p_installments: Json
          p_notes: string
          p_org_id: string
          p_relationship_manager: string
          p_restriction_purpose: string
          p_signed_at: string
          p_start_date: string
          p_total_amount: number
        }
        Returns: Json
      }
      create_task_with_relations: {
        Args: {
          p_actor_id: string
          p_entity_links?: Json
          p_expected_org_id: string
          p_task: Json
        }
        Returns: Json
      }
      custom_field_entity_org: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: string
      }
      default_modules_for_org_type: {
        Args: { p_org_type: Database["public"]["Enums"]["org_type_enum"] }
        Returns: Json
      }
      earth: { Args: never; Returns: number }
      enqueue_task_completion_automation: {
        Args: {
          p_actor_id: string
          p_task: Database["public"]["Tables"]["tasks"]["Row"]
          p_task_event_id: string
        }
        Returns: string
      }
      fail_ai_turn: {
        Args: {
          p_failure_code: string
          p_failure_message: string
          p_portfolio_id: string
          p_turn_id: string
          p_user_id: string
        }
        Returns: boolean
      }
      fail_onboarding_turn: {
        Args: {
          p_failure_code: string
          p_failure_message: string
          p_session_id: string
          p_turn_id: string
          p_user_id: string
        }
        Returns: undefined
      }
      finish_org_automation_outbox: {
        Args: { p_error?: string; p_event_id: string; p_succeeded: boolean }
        Returns: undefined
      }
      finish_org_invitation_email_outbox: {
        Args: { p_error?: string; p_event_id: string; p_outcome: string }
        Returns: undefined
      }
      finish_task_automation_outbox: {
        Args: { p_error?: string; p_event_id: string; p_succeeded: boolean }
        Returns: undefined
      }
      generate_receipt_number: { Args: { p_org_id: string }; Returns: string }
      generate_risk_snapshot: {
        Args: { p_portfolio_id: string }
        Returns: string
      }
      generate_share_token: { Args: never; Returns: string }
      get_concentration_risk_level: { Args: { p_hhi: number }; Returns: string }
      get_donation_capacity: {
        Args: { p_portfolio_id: string; p_tax_year?: number }
        Returns: {
          agi: number
          limit_20_pct: number
          limit_30_pct: number
          limit_50_pct: number
          limit_60_pct: number
          remaining_20_pct: number
          remaining_30_pct: number
          remaining_50_pct: number
          remaining_60_pct: number
          tax_year: number
          used_20_pct: number
          used_30_pct: number
          used_50_pct: number
          used_60_pct: number
        }[]
      }
      get_geocode_cache_stats: { Args: never; Returns: Json }
      get_latest_onboarding_session: {
        Args: { p_user_id: string }
        Returns: {
          conversation_state: Json
          created_at: string
          id: string
          quick_intake: Json
          status: string
        }[]
      }
      get_or_create_ai_session: {
        Args: { p_portfolio_id: string; p_user_id: string }
        Returns: string
      }
      get_or_create_onboarding_session: {
        Args: { p_user_id: string }
        Returns: string
      }
      get_pledge_dashboard_metrics: {
        Args: { p_as_of?: string; p_org_id: string }
        Returns: Json
      }
      get_upcoming_deadlines: {
        Args: { p_days_ahead?: number; p_portfolio_id: string }
        Returns: {
          days_until_due: number
          deadline_type: string
          due_date: string
          entity_id: string
          entity_type: string
          holding_name: string
          priority: string
          title: string
        }[]
      }
      has_completed_onboarding: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      is_app_admin: { Args: never; Returns: boolean }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      link_holding_to_charity: {
        Args: {
          p_charity_id: string
          p_holding_id: string
          p_portfolio_id: string
        }
        Returns: string
      }
      mark_stale_import_jobs: {
        Args: { p_stale_threshold_minutes?: number }
        Returns: number
      }
      mutate_custom_field_values: {
        Args: {
          p_actor_id: string
          p_changes: Json
          p_entity_id: string
          p_entity_type: string
          p_org_id: string
        }
        Returns: Json
      }
      mutate_org_invitation: {
        Args: {
          p_actor_id: string
          p_email?: string
          p_invitation_id?: string
          p_message?: string
          p_operation: string
          p_org_id: string
          p_role?: Database["public"]["Enums"]["member_role_enum"]
        }
        Returns: Json
      }
      mutate_organization_membership: {
        Args: {
          p_actor_id: string
          p_operation: string
          p_org_id: string
          p_role?: Database["public"]["Enums"]["member_role_enum"]
          p_target_user_id: string
        }
        Returns: Json
      }
      mutate_portfolio_member: {
        Args: {
          p_action: string
          p_portfolio_id: string
          p_role?: Database["public"]["Enums"]["member_role_enum"]
          p_user_id: string
        }
        Returns: boolean
      }
      org_enabled_modules: { Args: { p_org_id: string }; Returns: string[] }
      org_has_module: {
        Args: { p_module: string; p_org_id: string }
        Returns: boolean
      }
      org_role_gte: {
        Args: {
          p_min_role: Database["public"]["Enums"]["member_role_enum"]
          p_org_id: string
        }
        Returns: boolean
      }
      provision_onboarding_session: {
        Args: {
          p_automation_rows?: Json
          p_context_rows?: Json
          p_custom_field_rows?: Json
          p_ein?: string
          p_modules?: Json
          p_name: string
          p_org_type: Database["public"]["Enums"]["org_type_enum"]
          p_owner_user_id: string
          p_session_id: string
          p_view_rows?: Json
          p_workflow_rows?: Json
        }
        Returns: Json
      }
      provision_organization: {
        Args: {
          p_ein?: string
          p_modules?: Json
          p_name: string
          p_org_type: Database["public"]["Enums"]["org_type_enum"]
          p_owner_user_id: string
        }
        Returns: string
      }
      record_cpa_access: {
        Args: {
          p_action: string
          p_ip_address?: string
          p_resource?: string
          p_share_link_id: string
          p_user_agent?: string
        }
        Returns: Json
      }
      redo_ai_action: { Args: { p_action_id: string }; Returns: Json }
      replace_org_ai_route: {
        Args: {
          p_actor_id: string
          p_is_enabled: boolean
          p_org_id: string
          p_policy: Json
          p_targets: Json
          p_workload_id: string
        }
        Returns: string
      }
      replace_tax_carryforward_applications: {
        Args: {
          p_actor_id?: string
          p_applications: Json
          p_portfolio_id: string
          p_tax_year: number
        }
        Returns: Json
      }
      revoke_share_link: {
        Args: { p_share_link_id: string }
        Returns: undefined
      }
      set_task_completion_state: {
        Args: {
          p_action: string
          p_actor_id: string
          p_expected_org_id: string
          p_is_workspace_manager: boolean
          p_task_id: string
        }
        Returns: Json
      }
      settle_generated_tasks: {
        Args: {
          p_actor_id?: string
          p_match_prefix: boolean
          p_org_id: string
          p_reason: string
          p_source_key: string
          p_status: string
        }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      task_entity_belongs_to_org: {
        Args: { p_entity_id: string; p_entity_type: string; p_org_id: string }
        Returns: boolean
      }
      transition_grant_lifecycle: {
        Args: {
          p_actor_id?: string
          p_decision_payload?: Json
          p_expected_from_stage: string
          p_expected_org_id: string
          p_grant_id: string
          p_reason?: string
          p_to_stage: string
        }
        Returns: undefined
      }
      transition_grant_lifecycle_batch: {
        Args: {
          p_actor_id?: string
          p_expected_org_id: string
          p_transitions?: Json
        }
        Returns: Json
      }
      try_task_automation_lock: { Args: { lock_key: string }; Returns: boolean }
      unaccent: { Args: { "": string }; Returns: string }
      undo_ai_action: { Args: { p_action_id: string }; Returns: Json }
      update_grant_milestone_with_task_sync: {
        Args: {
          p_actor_id: string
          p_expected_holding_id: string
          p_expected_org_id: string
          p_expected_portfolio_id: string
          p_milestone_id: string
          p_patch: Json
        }
        Returns: Json
      }
      update_pledge_installment_status: {
        Args: {
          p_action: string
          p_contribution_id: string
          p_create_contribution: boolean
          p_installment_id: string
          p_notes: string
          p_org_id: string
          p_paid_at: string
          p_payment_ref: string
          p_pledge_id: string
        }
        Returns: Json
      }
      update_recommendation_interaction_status: {
        Args: {
          p_notes?: string
          p_recommendation_id: string
          p_status: string
        }
        Returns: {
          accreditation: Json | null
          charity_id: string | null
          contact_info: Json | null
          country: string | null
          created_at: string
          description: string | null
          ein: string | null
          id: string
          impact_focus: string[] | null
          interaction_status: string
          location: string | null
          max_investment: number | null
          min_investment: number | null
          order_index: number
          organization_name: string
          portfolio_id: string
          recommended_at: string
          recommended_by: string | null
          sector: string | null
          status: string
          status_updated_at: string | null
          status_updated_by: string | null
          updated_at: string
          website: string | null
        }
        SetofOptions: {
          from: "*"
          to: "portfolio_recommendations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_task_with_event: {
        Args: {
          p_actor_id: string
          p_expected_org_id: string
          p_is_workspace_manager: boolean
          p_task_id: string
          p_updates: Json
        }
        Returns: Json
      }
      update_workflow_task_with_linked_task: {
        Args: {
          p_actor_id: string
          p_expected_org_id: string
          p_is_workspace_manager: boolean
          p_updates: Json
          p_workflow_id: string
          p_workflow_task_id: string
        }
        Returns: Json
      }
      upsert_generated_task: {
        Args: {
          p_entity_links?: Json
          p_org_id: string
          p_reopen_resolved?: boolean
          p_task: Json
        }
        Returns: string
      }
      user_has_org_capability: {
        Args: { p_capability: string; p_org_id: string }
        Returns: boolean
      }
      user_org_role: {
        Args: { p_org_id: string }
        Returns: Database["public"]["Enums"]["member_role_enum"]
      }
      user_portfolio_role: {
        Args: { p_portfolio_id: string }
        Returns: Database["public"]["Enums"]["member_role_enum"]
      }
    }
    Enums: {
      asset_type_enum:
        | "foundation_grant"
        | "donation"
        | "daf_grant"
        | "program_related_investment"
        | "mission_related_investment"
        | "equity"
        | "fixed_income"
        | "real_estate"
        | "private_equity"
        | "hedge_fund"
        | "cash_equivalent"
        | "cryptocurrency"
        | "commodity"
        | "other"
      donor_recency_enum: "active" | "lapsed" | "lost"
      donor_tier_enum:
        | "major"
        | "mid"
        | "recurring"
        | "annual"
        | "lapsed"
        | "prospect"
      holding_status_enum:
        | "active"
        | "exited"
        | "pending"
        | "written_off"
        | "committed"
      import_status_enum:
        | "pending"
        | "processing"
        | "needs_review"
        | "approved"
        | "committing"
        | "rejected"
        | "completed"
        | "failed"
        | "rolled_back"
      member_role_enum: "owner" | "admin" | "member" | "viewer"
      org_type_enum:
        | "private_foundation"
        | "family_office"
        | "daf_sponsor"
        | "community_foundation"
        | "nonprofit"
        | "corporation"
        | "individual"
      pledge_commitment_type_enum: "verbal" | "written" | "online" | "imported"
      pledge_event_type_enum:
        | "created"
        | "updated"
        | "schedule_changed"
        | "installment_paid"
        | "installment_waived"
        | "installment_reopened"
        | "cancelled"
        | "defaulted"
        | "written_off"
        | "fulfilled"
      pledge_frequency_enum:
        | "one_time"
        | "monthly"
        | "quarterly"
        | "annually"
        | "custom"
      pledge_installment_status_enum:
        | "pending"
        | "paid"
        | "waived"
        | "written_off"
      pledge_status_enum:
        | "active"
        | "fulfilled"
        | "cancelled"
        | "defaulted"
        | "written_off"
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
      asset_type_enum: [
        "foundation_grant",
        "donation",
        "daf_grant",
        "program_related_investment",
        "mission_related_investment",
        "equity",
        "fixed_income",
        "real_estate",
        "private_equity",
        "hedge_fund",
        "cash_equivalent",
        "cryptocurrency",
        "commodity",
        "other",
      ],
      donor_recency_enum: ["active", "lapsed", "lost"],
      donor_tier_enum: [
        "major",
        "mid",
        "recurring",
        "annual",
        "lapsed",
        "prospect",
      ],
      holding_status_enum: [
        "active",
        "exited",
        "pending",
        "written_off",
        "committed",
      ],
      import_status_enum: [
        "pending",
        "processing",
        "needs_review",
        "approved",
        "committing",
        "rejected",
        "completed",
        "failed",
        "rolled_back",
      ],
      member_role_enum: ["owner", "admin", "member", "viewer"],
      org_type_enum: [
        "private_foundation",
        "family_office",
        "daf_sponsor",
        "community_foundation",
        "nonprofit",
        "corporation",
        "individual",
      ],
      pledge_commitment_type_enum: ["verbal", "written", "online", "imported"],
      pledge_event_type_enum: [
        "created",
        "updated",
        "schedule_changed",
        "installment_paid",
        "installment_waived",
        "installment_reopened",
        "cancelled",
        "defaulted",
        "written_off",
        "fulfilled",
      ],
      pledge_frequency_enum: [
        "one_time",
        "monthly",
        "quarterly",
        "annually",
        "custom",
      ],
      pledge_installment_status_enum: [
        "pending",
        "paid",
        "waived",
        "written_off",
      ],
      pledge_status_enum: [
        "active",
        "fulfilled",
        "cancelled",
        "defaulted",
        "written_off",
      ],
    },
  },
} as const
