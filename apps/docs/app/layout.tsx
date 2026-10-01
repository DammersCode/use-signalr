import "./global.css";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { appName, siteUrl } from "@/lib/shared";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: `${appName}: typed SignalR for every framework`, template: `%s | ${appName}` },
  description: "Typed SignalR hooks for React, Vue, Angular, Svelte, Preact, Solid and Lit, on one shared core.",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "48x48" }], apple: "/apple-touch-icon.png" },
  manifest: "/site.webmanifest",
};

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
