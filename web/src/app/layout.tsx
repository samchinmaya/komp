import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin", "cyrillic"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full overflow-x-hidden">{children}</body>
    </html>
  );
}
