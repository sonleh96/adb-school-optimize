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

import { HOME } from "../lib/home/copy";

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

test("with sign-in required, the manifest, the icon and robots.txt are public and the sign-in page logs nothing", async ({
  page,
  request,
}) => {
  for (const file of ["/manifest.webmanifest", "/icon.svg", "/robots.txt"]) {
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

// Failure mode: a server with sign-in required tells the page sign-in is off, or leaves that word in place from a time
// it was off, so the page sends its reads without a token and every one is refused.
test("with sign-in required, nothing says sign-in is off, and a cookie that did is cleared", async ({
  request,
}) => {
  for (const path of ["/", "/screening", "/sign-in", "/api/v1/screening/rules"]) {
    const fresh = await request.get(`${ORIGIN}${path}`, { maxRedirects: 0 });
    expect(
      fresh.headersArray().filter((h) => /^set-cookie$/i.test(h.name) && /rise-sign-in/.test(h.value))
    ).toEqual([]);
    const stale = await request.get(`${ORIGIN}${path}`, {
      maxRedirects: 0,
      headers: { Cookie: "rise-sign-in=off" },
    });
    const cleared = stale
      .headersArray()
      .find((h) => /^set-cookie$/i.test(h.name) && /rise-sign-in=/.test(h.value));
    expect(cleared?.value, path).toMatch(/rise-sign-in=;.*(Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
  }
});

// Failure modes: the homepage, which explains the project to anyone, sends a signed-out person to sign in; or making
// it public opens the tool too, so an old link to the tool at `/` skips sign-in.
test("with sign-in required, the homepage is public, and an old link to the tool still meets sign-in", async ({
  request,
}) => {
  const home = await request.get(`${ORIGIN}/`, { maxRedirects: 0 });
  expect(home.status()).toBe(200);
  expect(await home.text()).toContain(HOME.method.title);

  const old = await request.get(`${ORIGIN}/?rule=additive_u`, { maxRedirects: 0 });
  expect(old.status()).toBe(307);
  const tool = new URL(old.headers()["location"], ORIGIN);
  expect(`${tool.pathname}${tool.search}`).toBe("/screening?rule=additive_u");

  const signIn = await request.get(tool.href, { maxRedirects: 0 });
  expect(signIn.status()).toBe(307);
  const to = new URL(signIn.headers()["location"], ORIGIN);
  expect(to.pathname).toBe("/sign-in");
  expect(to.searchParams.get("next")).toBe("/screening?rule=additive_u");
});

// Failure mode: the homepage is public but its pictures are not, so a signed-out reader sees broken pictures: the
// proxy sends each picture, or each of its resized copies, to the sign-in page. A <source> offers a phone's copies.
test("with sign-in required, every picture the homepage offers is public", async ({ page, request }) => {
  await page.goto(`${ORIGIN}/`);
  const addresses = await page
    .locator("img, source")
    .evaluateAll((elements: Element[]) => [
      ...new Set(
        elements.flatMap((el) => [
          el.getAttribute("src") ?? "",
          ...(el.getAttribute("srcset") ?? "").split(",").map((entry) => entry.trim().split(" ")[0]),
        ])
      ),
    ]);
  const pictures = addresses.filter((address) => address && !address.startsWith("data:"));
  expect(pictures.length).toBeGreaterThan(8);
  for (const address of pictures) {
    const response = await request.get(new URL(address, ORIGIN).href, { maxRedirects: 0 });
    expect(response.status(), address).toBe(200);
    expect(response.headers()["content-type"], address).toMatch(/^image\//);
  }
});

test("with sign-in required, the workspace and the API still send a signed-out person to sign in", async ({
  request,
}) => {
  // A static file's extension exempts it only at the root: under the API or a page, it is checked like the rest.
  for (const file of [
    "/screening",
    "/api/v1/screening/rules",
    "/api/v1/x.ico",
    "/api/v1/x.png",
    "/api/v1/screening/schools/a.svg",
    "/screening/manifest.webmanifest",
    "/screening/x.png",
  ]) {
    const response = await request.get(`${ORIGIN}${file}`, { maxRedirects: 0 });
    expect(response.status(), file).toBe(307);
    expect(new URL(response.headers()["location"], ORIGIN).pathname, file).toBe("/sign-in");
  }
});
