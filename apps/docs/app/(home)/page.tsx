import fs from "node:fs";
import path from "node:path";
import { highlight } from "fumadocs-core/highlight";
import { CodeBlock, Pre } from "fumadocs-ui/components/codeblock";
import Link from "next/link";
import { BrandIcon } from "@/components/brand-icon";
import { EchoBackground } from "@/components/echo-background";
import { FrameworkCode, type FrameworkSample } from "@/components/framework-code";
import { Logo } from "@/components/logo";
import data from "@/content/frameworks.json";
import { githubUrl } from "@/lib/shared";

const features = [
  ["Typed from one contract", "Declare hubs, events and methods once. Every event handler and invoke is typed from that contract."],
  ["Many hubs, one provider", "One client serves all hubs. Each hub connects once, however many components use it."],
  ["Lazy hubs", "A lazy hub connects when the first consumer mounts and stops after the last one leaves."],
  ["Recovers by itself", "A lost connection comes back without app code. Reconnect callbacks let you refetch."],
  ["Teardown that lands", "A leave call in a cleanup waits for the connection and is sent once."],
  ["SSR-safe, no runtime deps", "Nothing connects on the server. Framework and SignalR packages are peers."],
] as const;

async function loadSamples(): Promise<FrameworkSample[]> {
  const samples: FrameworkSample[] = [];
  for (const id of data.order) {
    const dir = path.join(process.cwd(), "snippets", id);
    const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.startsWith("hero.")) : undefined;
    if (!file) continue;
    const raw = fs.readFileSync(path.join(dir, file), "utf8");
    const code = raw.replace(/^[\s\S]*?\/\/ ---cut---.*\r?\n/, "").trimEnd();
    const fw = data.frameworks[id as keyof typeof data.frameworks];
    samples.push({
      id,
      title: fw.title,
      code: await highlight(code, {
        lang: fw.lang,
        themes: { light: "github-light-high-contrast", dark: "github-dark" },
        defaultColor: false,
        components: {
          pre: (props) => (
            <CodeBlock className="my-0 rounded-none border-0">
              <Pre {...props} />
            </CodeBlock>
          ),
        },
      }),
    });
  }
  return samples;
}

export default async function HomePage() {
  const samples = await loadSamples();
  return (
    <main className="relative flex flex-1 flex-col">
      <EchoBackground className="pointer-events-none fixed inset-0 z-0 size-full" />
      <section className="relative z-10 flex justify-center px-4 pb-20 pt-28 sm:pt-36">
        <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
          <Logo className="size-16" />
          <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-6xl">
            Typed SignalR hooks for <span className="text-[var(--brand)]">every framework</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg text-fd-muted-foreground">
            One core, seven adapters. Declare your hubs once and get typed events, typed calls, and a connection that
            recovers by itself.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/docs/react/quick-start" className="rounded-lg bg-[var(--brand)] px-5 py-2.5 font-semibold text-[var(--brand-ink)]">
              Get started
            </Link>
            <a href={githubUrl} className="rounded-lg border bg-fd-background/70 px-5 py-2.5 font-semibold backdrop-blur">
              GitHub
            </a>
          </div>
        </div>
      </section>

      {samples.length > 0 && (
        <section className="relative z-10 mx-auto w-full max-w-3xl px-4 pb-20">
          <FrameworkCode samples={samples} />
        </section>
      )}

      <section className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-20">
        <h2 className="mb-6 text-2xl font-semibold">Pick your framework</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.order.map((id) => {
            const fw = data.frameworks[id as keyof typeof data.frameworks];
            return (
              <Link key={id} href={`/docs/${id}`} className="rounded-xl border bg-fd-card p-4 transition-colors hover:bg-fd-accent">
                <div className="flex items-center gap-2 font-semibold">
                  <BrandIcon name={id} className="size-5" />
                  {fw.title}
                </div>
                <code className="mt-2 block truncate text-xs text-fd-muted-foreground">{fw.package}</code>
              </Link>
            );
          })}
          <Link href="/docs/core" className="rounded-xl border border-dashed p-4 transition-colors hover:bg-fd-accent">
            <div className="font-semibold">Your own adapter</div>
            <span className="mt-2 block text-xs text-fd-muted-foreground">Build on {data.core.package}</span>
          </Link>
        </div>
      </section>

      <section className="relative z-10 mx-auto w-full max-w-5xl px-4 pb-24">
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(([title, text]) => (
            <div key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-fd-muted-foreground">{text}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="relative z-10 mt-auto border-t bg-fd-background px-4 py-6 text-center text-xs text-fd-muted-foreground">
        MIT License · <a href={githubUrl} className="underline">GitHub</a> · Framework logos from Simple Icons; the
        Angular logo is CC BY 4.0, the Vue logo is CC BY-NC-SA 4.0.
      </footer>
    </main>
  );
}
