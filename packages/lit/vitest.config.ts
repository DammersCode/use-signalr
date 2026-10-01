import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
          exclude: ["src/ssr.test.ts"],
        },
        resolve: { conditions: ["browser"] },
        ssr: { resolve: { conditions: ["browser"], externalConditions: ["browser"] } },
      },
      {
        extends: true,
        test: { name: "ssr", environment: "node", include: ["src/ssr.test.ts"] },
      },
    ],
  },
});
