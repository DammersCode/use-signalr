import { defineConfig } from "vitest/config";
import solid from "vite-plugin-solid";

export default defineConfig({
  test: {
    projects: [
      {
        plugins: [solid()],
        resolve: { conditions: ["browser", "development"] },
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.server.test.ts"],
        },
      },
      {
        plugins: [solid({ ssr: true })],
        test: {
          name: "server",
          environment: "node",
          include: ["src/**/*.server.test.ts"],
          server: { deps: { inline: [/solid-js/] } },
        },
      },
    ],
  },
});
