import "./globals.css";
import type { Metadata } from "next";
import { Suspense } from "react";
import LoadingScreen from "@/components/ui/LoadingScreen";
import SWRProvider from "@/components/ui/SWRProvider";
import ConditionalHeader from "@/components/dashboard/ConditionalHeader";
import { Montserrat, Playfair_Display } from "next/font/google";
import { branding } from "@/lib/config";

export const metadata: Metadata = {
  title: branding.appName,
  description: branding.tagline,
};
const mont = Montserrat({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
});
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${mont.variable} ${playfair.variable}`}>
      <body className="font-sans min-h-screen bg-creme text-ink antialiased">
        <SWRProvider>
          <LoadingScreen />
          <ConditionalHeader />
          <Suspense fallback={null}>
            <main id="main-content" className="w-full px-4 md:px-6 lg:px-8 py-8">{children}</main>
          </Suspense>
        </SWRProvider>
      </body>
    </html>
  );
}
