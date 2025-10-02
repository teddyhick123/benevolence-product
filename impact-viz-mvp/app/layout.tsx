import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import LoadingScreen from "@/components/LoadingScreen";
import { Montserrat, Playfair_Display } from "next/font/google";

export const metadata: Metadata = {
  title: "Benevolence",
  description: "Impact investing dashboard",
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
        <LoadingScreen />
        <Header />
        <main className="w-full px-4 md:px-6 lg:px-8 py-8">{children}</main>
      </body>
    </html>
  );
}