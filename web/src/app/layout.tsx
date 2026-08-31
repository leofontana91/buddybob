import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import { CANONICAL_APP_URL } from "@/lib/appUrl";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(CANONICAL_APP_URL),
  title: "BOB — Piattaforma",
  description: "Accogli, accompagna e parla con i visitatori. BOB fa il lavoro operativo.",
  icons: {
    icon: [{ url: "/brand/bob-mark.png", type: "image/png" }],
    apple: [{ url: "/brand/bob-mark.png", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
