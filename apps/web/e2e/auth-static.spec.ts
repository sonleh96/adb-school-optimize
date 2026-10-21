/**
 * With sign-in required, the files a browser fetches for any page, the sign-in page included, are public. Failure
 * mode: the auth proxy sends `/manifest.webmanifest` or the icon to the sign-in page, so every page logs "Manifest:
 * Syntax error" and a signed-out person's browser reads HTML as the app's manifest. The check that keeps the rest
 * behind sign-in must not loosen with it.
 *
 * The shared app server runs with sign-in off, so this file starts its own, from the same build, with
 * AUTH_REQUIRED=true, on a port the system reports free, and waits for that server's own "Ready" line: a port picked
 * by arithmetic can belong to another checkout's run. It ends the server's whole process group, since `next start`
 * runs the server as a child. No Supabase project is configured, so the sign-in page offers no form; that does not
 * change which paths the proxy lets through.
 */
import { type ChildProcess, spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";

import { expect, test } from "./screening-helpers";

test.describe.configure({ mode: "serial", timeout: 90_000 });

let server: ChildProcess | null = null;
let ORIGIN = "";

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

test.beforeAll(async () => {
  const root = path.resolve(__dirname, "..");
  const port = await freePort();
  ORIGIN = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [path.join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)],
    {
      cwd: root,
      detached: true,
      env: {
        ...process.env,
        AUTH_REQUIRED: "true",
        AUTH_BYPASS_LOCAL: "false",
        SUPABASE_URL: "",
        SUPABASE_ANON_KEY: "",
      },
      stdio: ["ignore", "pipe", "inherit"],
    }
  );
  server = child;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No app with sign-in required on ${ORIGIN}`)), 60_000);
    child.stdout!.on("data", (chunk) => {
      if (!String(chunk).includes("Ready")) return;
      clearTimeout(timer);
      resolve();
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`The app with sign-in required exited with ${code}`));
    });
  });
});

test.afterAll(() => {
  if (server?.pid) process.kill(-server.pid, "SIGTERM");
  server = null;
});

test("with sign-in required, the manifest and the icon are public and the sign-in page logs nothing", async ({
  page,
  request,
}) => {
  for (const file of ["/manifest.webmanifest", "/icon.svg"]) {
    const response = await request.get(`${ORIGIN}${file}`, { maxRedirects: 0 });
    expect(response.status(), file).toBe(200);
  }
  const manifest = await request.get(`${ORIGIN}/manifest.webmanifest`, { maxRedirects: 0 });
  expect((await manifest.json()).short_name).toBe("RISE-PNG");

  await page.goto(`${ORIGIN}/sign-in`);
  await expect(page.getByRole("heading", { name: "Sign in to see the school screening" })).toBeVisible();
  // Headless Chrome reads the manifest only when asked. Asked, it fetches the page's linked manifest and reports
  // what it could not parse, as "Manifest: Syntax error" does in a full browser.
  const cdp = await page.context().newCDPSession(page);
  const read = (await cdp.send("Page.getAppManifest")) as { url: string; errors: { message: string }[] };
  expect(new URL(read.url).pathname).toBe("/manifest.webmanifest");
  expect(read.errors.map((e) => e.message)).toEqual([]);
});

test("with sign-in required, the workspace and the API still send a signed-out person to sign in", async ({
  request,
}) => {
  for (const file of ["/screening", "/api/v1/screening/rules", "/screening/manifest.webmanifest"]) {
    const response = await request.get(`${ORIGIN}${file}`, { maxRedirects: 0 });
    expect(response.status(), file).toBe(307);
    expect(new URL(response.headers()["location"], ORIGIN).pathname, file).toBe("/sign-in");
  }
});
