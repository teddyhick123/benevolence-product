// lib/data/portfolio.ts
export async function getDefaultPortfolioId(): Promise<string | null> {
  const supabase = serverClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("portfolio_members")
    .select("portfolio_id, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false }) // 👈 newest first
    .limit(1);

  if (error) throw error;
  return data?.[0]?.portfolio_id ?? null;
}