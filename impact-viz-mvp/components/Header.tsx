"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function Header() {
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_evt, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/";
  }

  return (
    <header className="w-full sticky top-0 z-40 bg-creme/90 backdrop-blur-md border-b border-black/5">
      <div className="mx-auto max-w-6xl px-4 md:px-6 py-3 flex items-center justify-between">
        {/* Left: brand (B.) */}
        <Link href={user ? "/dashboard" : "/"} className="inline-flex items-center gap-2 group">
          <span className="font-playfair text-2xl leading-none text-azure group-hover:opacity-90">B.</span>
        </Link>

        {/* Right: auth-aware nav */}
        {!user ? (
          <Link
            href="/login"
            className="font-playfair text-sm px-4 py-2 rounded-md bg-azure text-white shadow hover:opacity-90 transition"
          >
            Sign in
          </Link>
        ) : (
          <nav className="flex items-center gap-3">
            <Link
              href="/profile"
              className="font-playfair text-sm px-3 py-1.5 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
            >
              Profile
            </Link>
            <Link
              href="/dashboard"
              className="font-playfair text-sm px-3 py-1.5 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
            >
              Dashboard
            </Link>
            <button
              onClick={handleSignOut}
              className="font-playfair text-sm px-3 py-1.5 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
            >
              Sign out
            </button>
          </nav>
        )}
      </div>
    </header>
  );
}