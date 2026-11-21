import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

export const files = {
  "/": ["src/app/index.html", "text/html; charset=utf-8"],
  "/style.css": ["src/app/style.css", "text/css; charset=utf-8"],
  "/app.js": ["src/app/app.js", "text/javascript; charset=utf-8"],
  "/store.js": ["src/app/store.js", "text/javascript; charset=utf-8"],
  "/runtime.js": ["src/core/runtime.ts", "text/javascript; charset=utf-8"],
  "/canvas.js": ["src/core/canvas.ts", "text/javascript; charset=utf-8"],
  "/samples/reference.png": ["public/samples/reference.png", "image/png"],
};

if (process.argv[1]?.endsWith("build.mjs")) {
  await mkdir("dist/samples", { recursive: true });
  for (const [route, [source]] of Object.entries(files)) {
    const target = "dist" + (route === "/" ? "/index.html" : route);
    if (source.endsWith(".ts")) {
      await writeFile(target, stripTypeScriptTypes(await readFile(source, "utf8")));
    } else {
      await cp(source, target);
    }
  }
  console.log("Built offline demo in dist/");
}
