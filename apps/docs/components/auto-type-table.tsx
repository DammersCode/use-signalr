import { AutoTypeTable as AutoTypeTableImpl } from "fumadocs-typescript/ui";
import { getTypeGenerator, typeTableOptions } from "@/lib/type-generator";

export function AutoTypeTable(props: Record<string, unknown>) {
  return <AutoTypeTableImpl {...props} generator={getTypeGenerator()} options={typeTableOptions} />;
}
