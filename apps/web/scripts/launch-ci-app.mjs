import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const appPort = process.env.CI_APP_PORT ?? "3105";
const mockPort = process.env.CI_MOCK_API_PORT ?? "4100";
let mockReady = false;
let appReady = false;

const mock = spawn(process.execPath, [path.join(root, "scripts/mock-api.mjs")], {
  cwd: root,
  env: { ...process.env, CI_MOCK_API_PORT: mockPort },
  stdio: ["ignore", "pipe", "inherit"],
});
const app = spawn(
  process.execPath,
  [path.join(root, "node_modules/next/dist/bin/next"), "start", "-p", appPort],
  {
    cwd: root,
    env: {
      ...process.env,
      API_PROXY_TARGET: `http://127.0.0.1:${mockPort}`,
      AUTH_REQUIRED: "false",
    },
    stdio: ["ignore", "pipe", "inherit"],
  }
);

function publishReady() {
  if (mockReady && appReady) console.log(`CI_APP_READY http://127.0.0.1:${appPort}`);
}

mock.stdout.on("data", (chunk) => {
  const output = String(chunk);
  process.stdout.write(output);
  if (output.includes("MOCK_API_READY")) mockReady = true;
  publishReady();
});
app.stdout.on("data", (chunk) => {
  const output = String(chunk);
  process.stdout.write(output);
  if (output.includes("Ready")) appReady = true;
  publishReady();
});

function stop(exitCode = 0) {
  mock.kill("SIGTERM");
  app.kill("SIGTERM");
  setTimeout(() => process.exit(exitCode), 250).unref();
}

mock.on("exit", (code, signal) => {
  if (!signal && code) stop(code);
});
app.on("exit", (code, signal) => {
  if (!signal && code) stop(code);
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => stop());
