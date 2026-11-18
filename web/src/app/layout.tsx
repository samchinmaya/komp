import type { Metadata, Viewport } from "next";
import { Comfortaa, Geist, Geist_Mono } from "next/font/google";
import { SiteBackground } from "@/components/manual/Grainient";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
});

// Headlines: rounded, even strokes, closest to the hand-drawn комп logo.
const comfortaa = Comfortaa({
  variable: "--font-comfortaa",
  subsets: ["latin", "cyrillic"],
});

const title = "комп · log compression for Claude";
const description =
  "комп compresses Kubernetes and app logs into a few meaningful lines, so Claude reads ~300 tokens instead of ~76,000. Runs on your machine; your logs never leave it.";

export const metadata: Metadata = {
  metadataBase: new URL("https://samchinmaya.github.io"),
  title,
  description,
  openGraph: { title, description, type: "website", url: "/komp/" },
  twitter: { card: "summary_large_image", title, description },
};

export const viewport: Viewport = { themeColor: "#03060b" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${comfortaa.variable} h-full bg-[#03060b] antialiased`}>
      <body className="min-h-full overflow-x-hidden">
        <SiteBackground />
        {children}
      </body>
    </html>
  );
}
