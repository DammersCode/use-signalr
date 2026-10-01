import { createFileSystemGeneratorCache, createGenerator } from "fumadocs-typescript";

type Generator = ReturnType<typeof createGenerator>;
type TypeTableOptions = NonNullable<Parameters<Generator["generateTypeTable"]>[1]>;
type UnionMembers = { flags: number; getTypes: () => unknown[] };

const NO_TRUNCATION = 1;
const MAX_UNION_MEMBERS = 5; // an enum would list every member
const UNION_FLAG = 134217728; // TypeFlags.Union in the TypeScript 7 API of fumadocs-typescript

function unwrap(text: string) {
  if (!text.startsWith("(") || !text.endsWith(")")) return text;
  let depth = 0;
  for (let i = 0; i < text.length - 1; i++) {
    depth += text[i] === "(" ? 1 : text[i] === ")" ? -1 : 0;
    if (depth === 0) return text;
  }
  return text.slice(1, -1);
}

/** Show the declared type text instead of the labels "union", "function", and "object". */
export const typeTableOptions: TypeTableOptions = {
  transform(entry, propertyType) {
    if (entry.tags.some((tag) => tag.name === "remarks")) return;
    const checker = this.checker as unknown as { typeToString: (...args: unknown[]) => string };
    const show = (type: unknown) => checker.typeToString(type, this.declaration, NO_TRUNCATION);
    const union = propertyType as unknown as UnionMembers;
    const members = (union.flags & UNION_FLAG ? union.getTypes() : []).map((member) => {
      const text = show(member);
      return text.includes("=>") ? `(${text})` : text;
    });
    const named = members.filter((member) => member !== "undefined");
    const shown = entry.required && named.length < members.length ? [...named, "undefined"] : named;
    const text = shown.length > 1 && shown.length <= MAX_UNION_MEMBERS ? shown.join(" | ").replace("false | true", "boolean") : entry.type;
    entry.simplifiedType = unwrap((entry.required ? text : text.replace(/ \| undefined$/, "")).replace(/import\("[^"]*"\)\./g, ""));
  },
};

let cachedGenerator: Generator | null = null;

/** One shared generator for the rendered pages and their Markdown copies. */
export function getTypeGenerator() {
  cachedGenerator ??= createGenerator({ cache: createFileSystemGeneratorCache(".next/fumadocs-typescript") });
  return cachedGenerator;
}
