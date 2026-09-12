import config from "./playwright.config";

const accountEditsConfig = {
  ...config,
  use: { ...config.use, baseURL: "http://127.0.0.1:4183" },
  webServer: [
    { command: "node tests/smoke/api-stub.mjs", url: "http://127.0.0.1:4174/__test/health", reuseExistingServer: true },
    { command: "NEXT_DIST_DIR=.next-account-edits BACKEND_URL=http://127.0.0.1:4174 NEXT_PUBLIC_LINEWATCH_API_BASE_URL=http://127.0.0.1:4174 npm run dev -- --hostname 127.0.0.1 --port 4183", url: "http://127.0.0.1:4183", timeout: 120000, reuseExistingServer: true },
  ],
};

export default accountEditsConfig;
