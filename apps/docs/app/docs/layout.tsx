import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.getPageTree()}
      {...baseOptions()}
      sidebar={{
        footer: (
          <a key="llms" href="/llms.txt" className="text-xs text-fd-muted-foreground hover:text-fd-foreground">
            llms.txt
          </a>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
