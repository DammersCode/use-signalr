"use client";

import { useState, type ReactNode } from "react";
import { BrandIcon } from "./brand-icon";

export type FrameworkSample = { id: string; title: string; code: ReactNode };

export function FrameworkCode({ samples }: { samples: FrameworkSample[] }) {
  const [active, setActive] = useState(samples[0]?.id);
  return (
    <div className="overflow-hidden rounded-xl border bg-fd-card text-left shadow-sm">
      <div role="tablist" aria-label="Framework" className="flex flex-wrap gap-1 border-b p-2">
        {samples.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === active}
            onClick={() => setActive(s.id)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-fd-muted-foreground aria-selected:bg-fd-accent aria-selected:text-fd-accent-foreground"
          >
            <BrandIcon name={s.id} className="size-3.5" />
            {s.title}
          </button>
        ))}
      </div>
      {samples.map((s) => (
        <div key={s.id} role="tabpanel" hidden={s.id !== active} className="text-sm">
          {s.code}
        </div>
      ))}
    </div>
  );
}
