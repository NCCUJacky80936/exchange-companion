import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const required = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
};

const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
if (missing.length) {
  console.error(`Production build blocked: missing ${missing.join(", ")}.`);
  process.exit(1);
}

async function filesUnder(directory) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries) {
    const target = path.join(directory, entry);
    if ((await stat(target)).isDirectory()) files.push(...await filesUnder(target));
    else if (/\.(?:js|json)$/.test(entry)) files.push(target);
  }
  return files;
}

const files = await filesUnder(path.resolve("dist"));
const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
const absentFromBuild = Object.entries(required)
  .filter(([, value]) => !contents.some((content) => content.includes(value)))
  .map(([key]) => key);

if (absentFromBuild.length) {
  console.error(`Production build blocked: ${absentFromBuild.join(", ")} was not embedded in the client build.`);
  process.exit(1);
}

console.log("Cloud build check passed: the public Supabase configuration is embedded.");
