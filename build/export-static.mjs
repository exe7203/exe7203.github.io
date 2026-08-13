import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const outputDir = path.resolve(projectRoot, process.argv[2] ?? "docs");
const allowedPrefix = `${projectRoot}${path.sep}`;

if (!outputDir.startsWith(allowedPrefix) || outputDir === projectRoot) {
  throw new Error(`Refusing to replace unsafe output directory: ${outputDir}`);
}

const workerUrl = pathToFileURL(
  path.join(projectRoot, "dist", "server", "index.js"),
);
workerUrl.searchParams.set("static-export", `${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

async function renderRoute(route) {
  const response = await worker.fetch(
    new Request(`https://exe7203.github.io${route}`, {
      headers: {
        accept: "text/html",
        "x-forwarded-host": "exe7203.github.io",
        "x-forwarded-proto": "https",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  if (!response.ok) {
    throw new Error(`Static render for ${route} failed with HTTP ${response.status}`);
  }

  const html = await response.text();
  if (html.includes("localhost") || html.includes("127.0.0.1")) {
    throw new Error(`Static render for ${route} contains a local-only URL`);
  }
  return html;
}

const html = await renderRoute("/");
if (!html.includes("貼上派單") || html.includes("第一版測試工具")) {
  throw new Error("Static render did not contain the validated production UI");
}

const privacyHtml = await renderRoute("/privacy");
if (
  !privacyHtml.includes("隱私與資料使用") ||
  !privacyHtml.includes("Google Analytics 4")
) {
  throw new Error("Static privacy render did not contain the required disclosure");
}

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });
await cp(path.join(projectRoot, "dist", "client"), outputDir, {
  recursive: true,
});
await writeFile(path.join(outputDir, "index.html"), html, "utf8");
await writeFile(path.join(outputDir, "404.html"), html, "utf8");
await mkdir(path.join(outputDir, "privacy"), { recursive: true });
await writeFile(
  path.join(outputDir, "privacy", "index.html"),
  privacyHtml,
  "utf8",
);
await writeFile(path.join(outputDir, ".nojekyll"), "", "utf8");

console.log(`Static site exported to ${outputDir}`);
