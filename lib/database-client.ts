import type { SupabaseClient as BaseSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';

type RelaxWriteValues<Table> = Table extends {
  Row: infer Row;
  Insert: infer Insert;
  Update: infer Update;
  Relationships: infer Relationships;
}
  ? {
      Row: { [Column in keyof Row]: any };
      Insert: { [Column in keyof Insert]?: any };
      Update: { [Column in keyof Update]: any };
      Relationships: Relationships;
    }
  : Table;

type RelaxTableWrites<Tables> = {
  [Table in keyof Tables]: RelaxWriteValues<Tables[Table]>;
};

type RelaxViewValues<View> = View extends {
  Row: infer Row;
  Relationships: infer Relationships;
}
  ? { Row: { [Column in keyof Row]: any }; Relationships: Relationships }
  : View;

type RelaxViews<Views> = {
  [View in keyof Views]: RelaxViewValues<Views[View]>;
};

type RelaxFunctionReturns<Functions> = {
  [FunctionName in keyof Functions]: Functions[FunctionName] extends {
    Args: infer Args;
  }
    ? Omit<Functions[FunctionName], 'Args' | 'Returns'> & {
        Args: { [Argument in keyof Args]: any };
        Returns: any;
      }
    : Functions[FunctionName];
};

/**
 * The generated schema preserves relation, column, view, RPC, and argument-key
 * names. Values, RPC returns, and write-requiredness are intentionally relaxed
 * because domain validators own input coercion. This is a structural drift
 * guard, not a substitute for runtime validation or exact generated row types.
 */
export type PlatformDatabase = Omit<Database, 'public'> & {
  public: Omit<Database['public'], 'Tables' | 'Views' | 'Functions'> & {
    Tables: RelaxTableWrites<Database['public']['Tables']>;
    Views: RelaxViews<Database['public']['Views']>;
    Functions: RelaxFunctionReturns<Database['public']['Functions']>;
  };
};

/** Supabase client for the stable platform canon. */
export type SupabaseClient = BaseSupabaseClient<PlatformDatabase>;

/**
 * Import staging is the sole schema-variable surface. Its adapter validates
 * relation names against an allowlist before using the underlying client.
 */
export type DynamicImportClient = BaseSupabaseClient<any, 'public', any>;
