import { defineConfig } from "vitest/config";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [svelte()],
        resolve: { conditions: ["browser"] },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.server.test.ts"],
        },
      },
      {
        plugins: [svelte()],
        test: {
          name: "server",
          environment: "node",
          include: ["src/**/*.server.test.ts"],
        },
      },
    ],
  },
});
