import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { appName, siteUrl } from "@/lib/shared";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const socialImage = "/social-preview.png";
const socialImageAlt = "use-signalr: typed SignalR hooks for every framework";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${appName}: typed SignalR for every framework`, template: `%s | ${appName}` },
  description: "Typed SignalR hooks for React, Vue, Angular, Svelte, Preact, Solid and Lit, on one shared core.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "48x48" }], apple: "/apple-touch-icon.png" },
  manifest: "/site.webmanifest",
  openGraph: {
    type: "website",
    siteName: appName,
    images: [{ url: socialImage, width: 1280, height: 640, alt: socialImageAlt }],
  },
  twitter: { card: "summary_large_image", images: [{ url: socialImage, alt: socialImageAlt }] },
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
