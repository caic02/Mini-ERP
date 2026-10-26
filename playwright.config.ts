import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/browser",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:3301", headless: true },
  webServer: {
    command: "npm start",
    url: "http://127.0.0.1:3301",
    reuseExistingServer: false,
    timeout: 60000,
    env: { PORT: "3301", APP_ORIGIN: "http://127.0.0.1:3301" },
  },
  reporter: "list",
});
