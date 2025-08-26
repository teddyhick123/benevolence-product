import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import { Playfair_Display } from "next/font/google";

export const metadata: Metadata = {
  title: "Benevolence",
  description: "Impact investing dashboard",
};

const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={playfair.variable}>
      <body className="min-h-screen bg-creme text-ink antialiased">
        <Header />
        <main className="mx-auto max-w-6xl px-4 md:px-6 py-8">{children}</main>
      </body>
    </html>
  );
}