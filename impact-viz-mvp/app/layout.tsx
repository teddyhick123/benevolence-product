import "./globals.css";
import type { Metadata } from "next";
import Header from "@/components/Header";
import LoadingScreen from "@/components/LoadingScreen";
import SWRProvider from "@/components/SWRProvider";
import { Montserrat, Playfair_Display } from "next/font/google";

export const metadata: Metadata = {
  title: "Benevolence — Portfolio Management for Philanthropists",
  description: "Purpose-built portfolio management for philanthropic foundations and family offices.",
  openGraph: {
    title: "Benevolence",
    description: "Portfolio management for philanthropic foundations and family offices.",
    type: "website",
  },
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
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[200000] focus:px-4 focus:py-2 focus:bg-white focus:text-indigo-600 focus:rounded focus:shadow-lg"
        >
          Skip to main content
        </a>
        <SWRProvider>
          <LoadingScreen />
          <Header />
          <main id="main-content" className="w-full px-4 md:px-6 lg:px-8 py-8">{children}</main>
        </SWRProvider>
      </body>
    </html>
  );
}