"use client";
import { usePathname } from "next/navigation";
import Header from "@/components/dashboard/Header";

// Pages that have their own navigation and don't need the app Header
const HEADERLESS_ROUTES = ["/", "/login", "/signup", "/welcome", "/onboarding"];

export default function ConditionalHeader() {
  const pathname = usePathname();
  if (HEADERLESS_ROUTES.includes(pathname)) return null;
  return <Header />;
}
