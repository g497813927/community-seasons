import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const appRoot = fileURLToPath(new URL("../", import.meta.url));
const NOTICE_NAME = /^(?:(?:licen[sc]es?|copying|copyright|notices?|unlicense)(?:$|[._-])|third[-_ ]?party[-_ ]?(?:licen[sc]es?|notices?|copyright))/i;
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

// The native archive omits its license. Both packages identify this exact
// repository, directory, version and MIT declaration. Rolldown's own LICENSE
// also explicitly references THIRD-PARTY-LICENSE, omitted from its npm archive.
// Vendored upstream release files keep normal generation offline and auditable.
const supplements = [
  { name: /^@rolldown\/binding-/, version: "1.0.1", files: ["LICENSE", "THIRD-PARTY-LICENSE"] },
  { name: /^rolldown$/, version: "1.0.1", files: ["THIRD-PARTY-LICENSE"] },
];
const supplementHashes = {
  LICENSE: "23ecfff35a5a2e80d92142f75228912c3b1abc4b5a8337a821ff4397e2f9f734",
  "THIRD-PARTY-LICENSE": "a877291d800ed43692f3f9ae09d8e01cc6f7293ad39d43896059c188ffbb8b7c",
};

function declaredLicense(pkg) {
  if (typeof pkg.license === "string") return pkg.license;
  if (typeof pkg.license?.type === "string") return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    const values = pkg.licenses.map((item) => typeof item === "string" ? item : item?.type);
    if (values.length && values.every((item) => typeof item === "string")) return values.join(" OR ");
  }
  return null;
}

function repositoryUrl(pkg) {
  let value = typeof pkg.repository === "string" ? pkg.repository : pkg.repository?.url;
  if (typeof value !== "string") return undefined;
  if (/^(?:github:)?[\w.-]+\/[\w.-]+(?:#[\w./-]+)?$/.test(value))
    value = `https://github.com/${value.replace(/^github:/, "")}`;
  value = value.replace(/^git\+/, "").replace(/^git:\/\//, "https://");
  value = value.replace(/^git@github\.com:/, "https://github.com/");
  value = value.replace(/^(?:ssh|https):\/\/git@github\.com\//, "https://github.com/");
  value = value.replace(/^http:\/\/github\.com\//, "https://github.com/");
  if (!/^https:\/\//.test(value)) return undefined;
  try {
    const url = new URL(value.replace(/\.git$/, ""));
    if (url.username || url.password) return undefined;
    return url.href;
  } catch { return undefined; }
}

function readNotices(directory) {
  const notices = [];
  const realDirectory = fs.realpathSync(directory);
  function walk(relative = "", licenseDirectory = false) {
    const entries = fs.readdirSync(path.join(directory, relative), { withFileTypes: true });
    for (const entry of entries.sort((a, b) => compare(a.name, b.name))) {
      if (["node_modules", ".git"].includes(entry.name)) continue;
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(file, licenseDirectory || /^(?:licen[sc]es|notices)$/i.test(entry.name));
      } else if ((entry.isFile() || entry.isSymbolicLink()) && (licenseDirectory || NOTICE_NAME.test(entry.name))) {
        const target = path.join(directory, file), real = fs.realpathSync(target);
        if (!real.startsWith(realDirectory + path.sep)) throw new Error(`License symlink leaves package: ${file}`);
        const data = fs.readFileSync(target);
        if (data.length > 5 * 1024 * 1024 || data.includes(0)) throw new Error(`Not a bounded text notice: ${target}`);
        const text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(data);
        if (text.trim()) notices.push({ file, text });
      }
    }
  }
  walk();
  return notices;
}

function addSupplements(root, pkg, notices) {
  for (const rule of supplements) {
    if (!rule.name.test(pkg.name) || rule.version !== pkg.version) continue;
    if (repositoryUrl(pkg) !== "https://github.com/rolldown/rolldown" || declaredLicense(pkg) !== "MIT")
      throw new Error(`Review the upstream license supplement for ${pkg.name}@${pkg.version}`);
    for (const name of rule.files) {
      const local = path.join(root, "scripts/license-supplements/rolldown-1.0.1", name);
      const bundled = fileURLToPath(new URL(`./license-supplements/rolldown-1.0.1/${name}`, import.meta.url));
      const data = fs.readFileSync(fs.existsSync(local) ? local : bundled);
      if (sha256(data) !== supplementHashes[name]) throw new Error(`Changed upstream license supplement: ${name}`);
      if (!notices.some((notice) => notice.text === data.toString("utf8"))) notices.push({
        file: `upstream/${name}`,
        text: data.toString("utf8"),
        source: `https://raw.githubusercontent.com/rolldown/rolldown/v1.0.1/${name}`,
      });
    }
  }
}

export function collectLicenses(root = appRoot) {
  const lockData = fs.readFileSync(path.join(root, "package-lock.json"));
  const lock = JSON.parse(lockData), project = json(path.join(root, "package.json"));
  if (lock.lockfileVersion !== 3 || !lock.packages?.[""]) throw new Error("A version-3 npm lockfile is required.");
  for (const scope of ["dependencies", "devDependencies", "optionalDependencies"]) {
    const actual = Object.entries(project[scope] ?? {}).sort(), locked = Object.entries(lock.packages[""][scope] ?? {}).sort();
    if (JSON.stringify(actual) !== JSON.stringify(locked)) throw new Error(`package.json ${scope} differs from the lockfile; update the lockfile first.`);
  }
  const packages = new Map(), omitted = new Map(), issues = [];
  for (const [location, entry] of Object.entries(lock.packages).sort(([a], [b]) => compare(a, b))) {
    if (!location) continue;
    if (!location.startsWith("node_modules/") || location.split("/").includes("..") || entry.link)
      throw new Error(`Unsupported lockfile package location: ${location}`);
    const directory = path.join(root, location), manifest = path.join(directory, "package.json");
    if (!fs.existsSync(manifest)) {
      if (!entry.optional) throw new Error(`Locked dependency is not installed: ${location}. Run npm ci with development dependencies.`);
      const name = location.split("node_modules/").at(-1);
      omitted.set(`${name}@${entry.version}`, { name, version: entry.version });
      continue;
    }
    const pkg = json(manifest);
    if (typeof pkg.name !== "string" || pkg.version !== entry.version)
      throw new Error(`Installed package does not match the lockfile: ${location}`);
    const key = `${pkg.name}@${pkg.version}`, license = declaredLicense(pkg) ?? declaredLicense(entry) ?? "UNKNOWN";
    const notices = readNotices(directory);
    addSupplements(root, pkg, notices);
    const item = {
      name: pkg.name, version: pkg.version, license,
      ...(repositoryUrl(pkg) ? { repository: repositoryUrl(pkg) } : {}),
      scope: entry.dev ? "development" : "production",
      status: notices.length ? "complete" : "missing-license-text",
      notices,
    };
    if (packages.has(key)) {
      const existing = packages.get(key);
      if (existing.license !== license) throw new Error(`Conflicting licenses for installed copies of ${key}`);
      if (item.scope === "production") existing.scope = "production";
      for (const notice of notices) {
        if (!existing.notices.some((current) => current.file === notice.file && current.text === notice.text)) existing.notices.push(notice);
      }
      existing.status = existing.notices.length ? "complete" : "missing-license-text";
    } else packages.set(key, item);
  }
  const sorted = [...packages.values()].sort((a, b) => compare(a.name, b.name) || compare(a.version, b.version));
  for (const pkg of sorted) {
    pkg.notices.sort((a, b) => compare(a.file, b.file) || compare(a.text, b.text));
    if (pkg.status === "missing-license-text") issues.push({ package: `${pkg.name}@${pkg.version}`, message: "No original license or notice text was found in the installed package." });
    if (pkg.license === "UNKNOWN") issues.push({ package: `${pkg.name}@${pkg.version}`, message: "No license declaration was found; manual review is required." });
  }
  return {
    schemaVersion: 1,
    generatedFromLockfile: `sha256:${sha256(lockData)}`,
    description: "Installed, locked project dependencies and their original license notices, including transitive and build dependencies. Production/development are npm dependency classifications, not a list of packages shipped to the browser. Optional packages not installed on this build platform are listed separately. External platform services and test tools outside this project are not included.",
    packages: sorted,
    omittedOptionalPackages: [...omitted.values()].filter(({name, version}) => !packages.has(`${name}@${version}`)).sort((a, b) => compare(a.name, b.name) || compare(a.version, b.version)),
    issues,
  };
}

export function renderNotices(inventory) {
  let result = `THIRD-PARTY NOTICES\n\n${inventory.description}\n\nLockfile: ${inventory.generatedFromLockfile}\nPackages: ${inventory.packages.length}\n\n`;
  for (const pkg of inventory.packages) {
    result += `${"=".repeat(78)}\n${pkg.name}@${pkg.version}\nDeclared license: ${pkg.license}\nDependency classification: ${pkg.scope}\n`;
    if (pkg.repository) result += `Repository: ${pkg.repository}\n`;
    for (const notice of pkg.notices) {
      result += `\n--- ${notice.file} ---\n`;
      if (notice.source) result += `Upstream source: ${notice.source}\n`;
      result += notice.text;
      if (!notice.text.endsWith("\n")) result += "\n";
    }
    result += "\n";
  }
  if (inventory.omittedOptionalPackages.length) result += `OPTIONAL PACKAGES NOT INSTALLED ON THIS BUILD PLATFORM\n${inventory.omittedOptionalPackages.map(({name,version}) => `${name}@${version}`).join("\n")}\n\n`;
  if (inventory.issues.length) result += `REVIEW REQUIRED\n${inventory.issues.map(({package:pkg,message}) => `${pkg}: ${message}`).join("\n")}\n`;
  return result;
}

function main() {
  const usage = `Usage: node licenses.mjs [--write | --check] [--root PATH] [--out-dir PATH]

Generate an offline license inventory for an installed npm project.
  --write          Generate open-source-licenses.json and THIRD-PARTY-NOTICES.txt.
  --check          Verify existing output; never write (default).
  --root PATH      Project containing package.json, package-lock.json and node_modules.
                   Defaults to the parent directory of this script's folder.
  --out-dir PATH   Output folder, relative to the project root or absolute (default: public).
  --help           Show this help.

Requires Node.js 22.13+ and npm lockfile version 3. Run npm ci first.
Keep license-supplements/ beside this script when copying it to another project.`;
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--help") { console.log(usage); return; }
  let command = "--check", root = appRoot, output = "public";
  const seen = new Set();
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    const key = ["--write", "--check"].includes(arg) ? "mode" : arg;
    if (seen.has(key)) throw new Error(`Repeated or conflicting option: ${arg}\n${usage}`);
    seen.add(key);
    if (["--write", "--check"].includes(arg)) command = arg;
    else if (["--root", "--out-dir"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}\n${usage}`);
      if (arg === "--root") root = path.resolve(value);
      else output = value;
    } else throw new Error(`Unknown option: ${arg}\n${usage}`);
  }
  const outDir = path.resolve(root, output);
  const inventory = collectLicenses(root);
  // Do not replace the last valid output with an incomplete inventory.
  if (inventory.issues.length) throw new Error(inventory.issues.map(({package:pkg,message}) => `${pkg}: ${message}`).join("\n"));
  const outputs = {
    "open-source-licenses.json": JSON.stringify(inventory, null, 2) + "\n",
    "THIRD-PARTY-NOTICES.txt": renderNotices(inventory),
  };
  if (command === "--write") fs.mkdirSync(outDir, { recursive: true });
  for (const [name, content] of Object.entries(outputs)) {
    const file = path.join(outDir, name);
    if (command === "--write") fs.writeFileSync(file, content);
    else if (!fs.existsSync(file) || fs.readFileSync(file, "utf8") !== content) throw new Error(`${name} is stale; rerun this command with --write instead of --check.`);
  }
  console.log(`License inventory: ${inventory.packages.length} package versions; ${inventory.omittedOptionalPackages.length} optional packages not installed; ${inventory.issues.length} issues.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
