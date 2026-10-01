import defaultMdxComponents from "fumadocs-ui/mdx";
import { Step, Steps } from "fumadocs-ui/components/steps";
import { Tab, Tabs } from "fumadocs-ui/components/tabs";
import type { MDXComponents } from "mdx/types";
import { AutoTypeTable } from "@/components/auto-type-table";

export function getMDXComponents(components?: MDXComponents): MDXComponents {
  return { ...defaultMdxComponents, AutoTypeTable, Steps, Step, Tabs, Tab, ...components };
}

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>;
}
