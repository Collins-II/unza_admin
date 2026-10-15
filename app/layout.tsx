import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { MobileNav } from "@/components/MobileNav";
import { InstallPrompt } from "@/components/InstallPrompt";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "UNZA Central Administration", template: "%s | UNZA Central" },
  description: "Central university administration and student data services",
  applicationName: "UNZA Central Administration",
  appleWebApp: { capable: true, title: "UNZA", statusBarStyle: "black-translucent" },
   icons: {
    icon: [
      { url: "/images/unza_logo.jpg", type: "image/jpg", sizes: "32x32" },
    ],
    apple: [{ url: "/images/icon-192.png", sizes: "192x192", type: "image/png" }],
  }
};

export const viewport: Viewport = {
  themeColor: "#052e16",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-white text-gray-900">
        <Providers>
          {children}
          <MobileNav />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
