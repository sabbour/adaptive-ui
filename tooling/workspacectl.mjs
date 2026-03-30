#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { execSync, spawn } from "node:child_process";
import { parse as parseYaml } from "yaml";

const BASE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const MANIFEST_PATH = path.join(BASE, "tooling", "workspace-manifest.yaml");
let cachedCommandEnv = null;

function getCommandEnv() {
  if (cachedCommandEnv) {
    return cachedCommandEnv;
  }

  const env = { ...process.env };
  if (!env.NODE_AUTH_TOKEN) {
    try {
      const token = execSync("gh auth token", {
        cwd: BASE,
        stdio: ["ignore", "pipe", "pipe"],
      })
        .toString()
        .trim();
      if (token) {
        env.NODE_AUTH_TOKEN = token;
      }
    } catch {
      // Ignore. npm may still work if auth is configured via .npmrc.
    }
  }

  cachedCommandEnv = env;
  return cachedCommandEnv;
}

function loadManifest() {
  const raw = fs.readFileSync(MANIFEST_PATH, "utf8");
  return parseYaml(raw);
}

function run(cmd, cwd = BASE, silent = false) {
  if (!silent) {
    console.log(`$ ${cmd}`);
  }
  return execSync(cmd, { cwd, stdio: ["ignore", "pipe", "pipe"], env: getCommandEnv() }).toString().trim();
}

function runInherit(cmd, cwd = BASE) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd, stdio: "inherit", env: getCommandEnv() });
}

function hasCommand(cmd) {
  try {
    run(`command -v ${cmd}`, BASE, true);
    return true;
  } catch {
    return false;
  }
}

function parseOptions(args) {
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        options[key] = true;
      } else {
        options[key] = next;
        i += 1;
      }
    } else {
      positional.push(arg);
    }
  }
  return { options, positional };
}

function checkNodeVersion(requiredMajor) {
  const current = process.versions.node;
  const major = Number(current.split(".")[0]);
  if (Number.isNaN(major)) {
    return { ok: false, message: `Unable to parse Node version: ${current}` };
  }
  if (major !== requiredMajor) {
    return { ok: false, message: `Expected Node ${requiredMajor}.x, found ${current}` };
  }
  return { ok: true, message: `Node ${current}` };
}

function repoSlugFromDir(dir) {
  let origin = run("git remote get-url origin", dir, true);
  origin = origin.replace(/\.git$/, "");
  origin = origin.replace(/^git@github\.com:/, "");
  origin = origin.replace(/^https?:\/\/github\.com\//, "");
  return origin;
}

function packageNameFromJson(pkgPath) {
  const json = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  return json.name;
}

function readPackageJson(repoPath) {
  const pkgPath = path.join(repoPath, "package.json");
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(pkgPath, "utf8"));
}

function npmInstall(cwd, useLegacyPeerDeps = false) {
  // Keep the lockfile intact — deleting it causes npm to do full resolution
  // which triggers a destructure bug with --legacy-peer-deps after npm link.
  // The lockfile guides npm to use known-good resolutions, avoiding crashes.
  runInherit(useLegacyPeerDeps ? "npm install --legacy-peer-deps" : "npm install", cwd);
}

/**
 * In CI, the lockfile was generated on a different OS (Windows/macOS) and
 * is missing platform-specific optional deps (e.g. @rollup/rollup-linux-x64-gnu).
 *
 * We can't use `npm install rollup@version` because it triggers full tree
 * resolution which replaces @sabbour/* symlinks with published registry versions.
 * And we can't just rely on npm link + npm install order because npm link
 * removes the rollup native binding.
 *
 * Solution: download the native binding tarball with `npm pack` and extract it
 * directly into node_modules — no tree resolution, no side effects.
 */
function fixRollupPlatformDeps(cwd) {
  if (!process.env.CI) return;
  const rollupPkg = path.join(cwd, "node_modules", "rollup", "package.json");
  if (!fs.existsSync(rollupPkg)) return;
  const { optionalDependencies } = JSON.parse(fs.readFileSync(rollupPkg, "utf8"));
  if (!optionalDependencies) return;

  // Find the native binding for this platform (e.g. @rollup/rollup-linux-x64-gnu)
  const nativePkg = Object.keys(optionalDependencies).find((name) =>
    name.includes(process.platform) && name.includes(process.arch)
  );
  if (!nativePkg) return;

  const nativeDir = path.join(cwd, "node_modules", ...nativePkg.split("/"));
  if (fs.existsSync(nativeDir)) return; // already installed

  const version = optionalDependencies[nativePkg];
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rollup-native-"));
  try {
    runInherit(`npm pack ${nativePkg}@${version} --pack-destination ${tmpDir}`, cwd);
    const tarball = fs.readdirSync(tmpDir).find((f) => f.endsWith(".tgz"));
    if (tarball) {
      fs.mkdirSync(nativeDir, { recursive: true });
      runInherit(`tar xzf ${path.join(tmpDir, tarball)} -C ${nativeDir} --strip-components=1`);
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function ensureGitIdentity() {
  const name = run("git config user.name || true", BASE, true);
  const email = run("git config user.email || true", BASE, true);
  if (!name || !email) {
    throw new Error("Git identity is not configured. Set user.name and user.email.");
  }
}

function bumpVersionInPackage(filePath, bump) {
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const [majorRaw, minorRaw, patchRaw] = json.version.split(".").map((n) => Number(n));
  let major = majorRaw;
  let minor = minorRaw;
  let patch = patchRaw;
  if (bump === "patch") patch += 1;
  else if (bump === "minor") {
    minor += 1;
    patch = 0;
  } else if (bump === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else {
    throw new Error(`Unknown bump type: ${bump}`);
  }
  const next = `${major}.${minor}.${patch}`;
  json.version = next;
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
  return next;
}

function updatePackageRange(filePath, pkg, version) {
  const json = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (json.dependencies && json.dependencies[pkg]) {
    json.dependencies[pkg] = `^${version}`;
  }
  if (json.peerDependencies && json.peerDependencies[pkg]) {
    json.peerDependencies[pkg] = `^${version}`;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

function waitForPublishWorkflow(pkg, version, repoSlug, maxWaitSec) {
  const start = Date.now();
  const timeoutMs = maxWaitSec * 1000;
  console.log(`Waiting for ${pkg}@${version} in ${repoSlug} (timeout ${maxWaitSec}s)`);
  while (Date.now() - start < timeoutMs) {
    const output = run(
      `GH_PAGER=cat gh run list --repo "${repoSlug}" --workflow publish.yml --limit 5 --json status,conclusion,displayTitle --jq '.[] | select(.displayTitle | contains("${version}"))'`,
      BASE,
      true,
    );
    if (output) {
      const row = JSON.parse(output.split("\n")[0]);
      if (row.conclusion === "success") {
        console.log(`Published: ${pkg}@${version}`);
        return;
      }
      if (row.conclusion === "failure" || row.conclusion === "cancelled") {
        throw new Error(`${pkg}@${version} workflow ${row.conclusion}`);
      }
    }
    execSync("sleep 10");
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  throw new Error(`Timed out waiting for ${pkg}@${version}`);
}

function gitCommitPush(repoDir, message) {
  runInherit("git add -A", repoDir);
  try {
    runInherit(`git commit -m "${message.replace(/"/g, "\\\"")}"`, repoDir);
  } catch {
    console.log(`No commit needed in ${path.basename(repoDir)}`);
    return;
  }
  runInherit("git push", repoDir);
}

function gitCommitTagPush(repoDir, message, tag) {
  runInherit("git add -A", repoDir);
  try {
    runInherit(`git commit -m "${message.replace(/"/g, "\\\"")}"`, repoDir);
  } catch {
    console.log(`No commit needed in ${path.basename(repoDir)}`);
    return;
  }
  runInherit(`git tag ${tag}`, repoDir);
  runInherit("git push origin main --tags", repoDir);
}

function getRepoMap(manifest) {
  const map = new Map();
  for (const repo of manifest.repos || []) {
    map.set(repo.id, repo);
  }
  return map;
}

function doctor(options = {}) {
  const jsonMode = Boolean(options.json);
  const checks = [];
  const out = (msg) => {
    if (!jsonMode) {
      console.log(msg);
    }
  };
  const manifest = loadManifest();
  let failures = 0;
  let warnings = 0;
  const fail = (msg) => {
    failures += 1;
    checks.push({ level: "fail", message: msg });
    out(`FAIL  ${msg}`);
  };
  const warn = (msg) => {
    warnings += 1;
    checks.push({ level: "warn", message: msg });
    out(`WARN  ${msg}`);
  };
  const pass = (msg) => {
    checks.push({ level: "pass", message: msg });
    out(`PASS  ${msg}`);
  };

  out("Adaptive UI workspace doctor");
  out(`Manifest: ${MANIFEST_PATH}`);

  ["git", "node", "npm", "gh"].forEach((cmd) => {
    if (hasCommand(cmd)) pass(`Command available: ${cmd}`);
    else fail(`Missing command: ${cmd}`);
  });

  const nodeCheck = checkNodeVersion(manifest.node?.major || 22);
  if (nodeCheck.ok) pass(nodeCheck.message);
  else fail(nodeCheck.message);

  try {
    run("gh auth status", BASE, true);
    pass("GitHub CLI auth is valid");
  } catch {
    warn("GitHub CLI auth not detected (run: gh auth login)");
  }

  const expectedBranch = manifest.defaultBranch || "main";
  for (const repo of manifest.repos || []) {
    const repoPath = path.join(BASE, repo.path);
    if (!fs.existsSync(repoPath)) {
      fail(`Missing repo path: ${repo.path}`);
      continue;
    }
    pass(`Repo path exists: ${repo.path}`);

    const gitDir = path.join(repoPath, ".git");
    if (!fs.existsSync(gitDir)) {
      warn(`Not a git repo: ${repo.path}`);
      continue;
    }

    const branch = run("git rev-parse --abbrev-ref HEAD", repoPath, true);
    if (branch === expectedBranch) pass(`${repo.path} on branch ${branch}`);
    else warn(`${repo.path} on branch ${branch}, expected ${expectedBranch}`);

    const dirty = run("git status --porcelain", repoPath, true);
    if (!dirty) pass(`${repo.path} working tree clean`);
    else warn(`${repo.path} has uncommitted changes`);
  }

  const summary = {
    command: "doctor",
    manifest: MANIFEST_PATH,
    failures,
    warnings,
    checks,
  };

  if (jsonMode) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\nDoctor summary: ${failures} failure(s), ${warnings} warning(s)`);
  }

  if (failures > 0) process.exit(1);
}

function contract(options = {}) {
  const jsonMode = Boolean(options.json);
  const checks = [];
  const out = (msg) => {
    if (!jsonMode) {
      console.log(msg);
    }
  };
  const manifest = loadManifest();
  const repoMap = getRepoMap(manifest);
  let failures = 0;
  const fail = (msg) => {
    failures += 1;
    checks.push({ level: "fail", message: msg });
    out(`FAIL  ${msg}`);
  };
  const pass = (msg) => {
    checks.push({ level: "pass", message: msg });
    out(`PASS  ${msg}`);
  };

  const framework = repoMap.get("adaptive-ui-framework");
  if (!framework) {
    fail("Manifest missing adaptive-ui-framework");
    process.exit(1);
  }

  const frameworkPkg = readPackageJson(path.join(BASE, framework.path));
  if (!frameworkPkg) {
    fail("Framework package.json not found");
    process.exit(1);
  }

  const corePkgPath = path.join(BASE, framework.path, "packs", "core", "package.json");
  const corePackageName = packageNameFromJson(corePkgPath);

  for (const repo of manifest.repos || []) {
    const repoPath = path.join(BASE, repo.path);
    const pkg = readPackageJson(repoPath);
    if (!pkg) {
      continue;
    }

    if (repo.type === "pack") {
      const peer = pkg.peerDependencies || {};
      if (!peer[corePackageName]) {
        fail(`${repo.id} missing peerDependency on ${corePackageName}`);
      } else {
        pass(`${repo.id} has ${corePackageName} peerDependency`);
      }
    }

    if (repo.type === "demo") {
      const deps = pkg.dependencies || {};
      const depsNeeded = repo.dependsOn || [];
      for (const depRepoId of depsNeeded) {
        const depRepo = repoMap.get(depRepoId);
        if (!depRepo) {
          fail(`${repo.id} dependsOn unknown repo ${depRepoId}`);
          continue;
        }
        let depPkgName = "";
        if (depRepo.id === "adaptive-ui-framework") {
          depPkgName = corePackageName;
        } else {
          const depPkg = readPackageJson(path.join(BASE, depRepo.path));
          depPkgName = depPkg?.name || "";
        }
        if (!depPkgName) {
          fail(`${repo.id} cannot resolve package name for ${depRepoId}`);
          continue;
        }
        if (!deps[depPkgName]) {
          fail(`${repo.id} missing dependency ${depPkgName}`);
        } else {
          pass(`${repo.id} depends on ${depPkgName}`);
        }
      }
    }
  }

  const releaseOrder = manifest.release?.order || [];
  for (const id of ["adaptive-ui-framework", "adaptive-ui-azure-pack", "adaptive-ui-github-pack"]) {
    if (!releaseOrder.includes(id)) {
      fail(`release.order missing ${id}`);
    }
  }

  if (failures > 0) {
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            command: "contract",
            failures,
            checks,
            result: "failed",
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`\nContract checks failed: ${failures}`);
    }
    process.exit(1);
  }
  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          command: "contract",
          failures: 0,
          checks,
          result: "passed",
        },
        null,
        2,
      ),
    );
  } else {
    console.log("\nContract checks passed.");
  }
}

function build() {
  const base = BASE;
  process.env.NPM_CONFIG_PREFIX = path.join(base, ".npm-links");
  fs.mkdirSync(process.env.NPM_CONFIG_PREFIX, { recursive: true });

  const frameworkDir = path.join(base, "adaptive-ui-framework");
  const coreDir = path.join(frameworkDir, "packs", "core");
  const corePackageName = packageNameFromJson(path.join(coreDir, "package.json"));

  npmInstall(frameworkDir, true);
  runInherit("npx tsc -b --noEmit", frameworkDir);
  runInherit("npm link", coreDir);

  const packIds = [
    "adaptive-ui-azure-pack",
    "adaptive-ui-github-pack",
    "adaptive-ui-google-flights-pack",
    "adaptive-ui-google-maps-pack",
    "adaptive-ui-travel-data-pack",
  ];

  for (const packId of packIds) {
    const packDir = path.join(base, "packs", packId);
    npmInstall(packDir, true);
    runInherit(`npm link ${corePackageName}`, packDir);
    runInherit("npx tsc -b --noEmit", packDir);
    runInherit("npm link", packDir);
  }

  const apiDir = path.join(base, "api");
  npmInstall(apiDir);
  runInherit("npx tsc", apiDir);

  const packNames = {
    azure: packageNameFromJson(path.join(base, "packs", "adaptive-ui-azure-pack", "package.json")),
    github: packageNameFromJson(path.join(base, "packs", "adaptive-ui-github-pack", "package.json")),
    flights: packageNameFromJson(path.join(base, "packs", "adaptive-ui-google-flights-pack", "package.json")),
    maps: packageNameFromJson(path.join(base, "packs", "adaptive-ui-google-maps-pack", "package.json")),
    travelData: packageNameFromJson(path.join(base, "packs", "adaptive-ui-travel-data-pack", "package.json")),
  };

  const demos = [
    {
      dir: "adaptive-ui-trip-notebook",
      links: `${corePackageName} ${packNames.travelData} ${packNames.maps} ${packNames.flights}`,
    },
    {
      dir: "adaptive-ui-solution-architect",
      links: `${corePackageName} ${packNames.azure} ${packNames.github}`,
    },
    {
      dir: "adaptive-ui-try-aks",
      links: `${corePackageName} ${packNames.azure} ${packNames.github}`,
    },
  ];

  for (const demo of demos) {
    const demoDir = path.join(base, "demos", demo.dir);
    runInherit(`npm link ${demo.links}`, demoDir);
    npmInstall(demoDir, true);
    // Re-link AFTER npm install — npm install replaces @sabbour/* symlinks
    // with published registry versions from the lockfile.
    runInherit(`npm link ${demo.links}`, demoDir);
    // Fix rollup AFTER the final npm link — npm link removes the platform-
    // specific rollup native binding. fixRollupPlatformDeps uses npm pack +
    // tar extract (no tree resolution) so it won't touch the @sabbour/* symlinks.
    fixRollupPlatformDeps(demoDir);
    runInherit("npx tsc -b", demoDir);
    runInherit("npx vite build", demoDir);
  }
}

function start(appName) {
  const apps = {
    "trip-notebook": "demos/adaptive-ui-trip-notebook",
    "solution-architect": "demos/adaptive-ui-solution-architect",
    "try-aks": "demos/adaptive-ui-try-aks",
  };
  if (!apps[appName]) {
    throw new Error(`Unknown app: ${appName}`);
  }

  const apiDir = path.join(BASE, "api");
  const appDir = path.join(BASE, apps[appName]);

  try {
    runInherit("npm run build", apiDir);
  } catch {
    console.log("API build failed, continuing to function host startup.");
  }

  const funcProc = spawn("npx", ["func", "start", "--port", "7071"], {
    cwd: apiDir,
    stdio: "inherit",
    shell: true,
  });

  const shutdown = () => {
    funcProc.kill("SIGTERM");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  execSync("sleep 2");
  runInherit("npm run dev", appDir);
}

function release(bump, opts) {
  if (!["patch", "minor", "major"].includes(bump)) {
    throw new Error("release requires bump: patch | minor | major");
  }

  const dryRun = Boolean(opts["dry-run"]);
  const jsonMode = Boolean(opts.json);
  const maxWait = Number(opts["max-wait"] || 600);
  if (!Number.isFinite(maxWait) || maxWait <= 0) {
    throw new Error("--max-wait must be a positive integer");
  }

  const base = BASE;
  const frameworkDir = path.join(base, "adaptive-ui-framework");
  const packs = [
    "adaptive-ui-azure-pack",
    "adaptive-ui-github-pack",
    "adaptive-ui-google-flights-pack",
    "adaptive-ui-google-maps-pack",
    "adaptive-ui-travel-data-pack",
  ];

  if (dryRun) {
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            command: "release",
            mode: "dry-run",
            bump,
            maxWait,
            summary: "Would bump and publish core + packs + demos + parent pointers",
          },
          null,
          2,
        ),
      );
    } else {
      console.log("[dry-run] Would bump and publish core + packs + demos + parent pointers");
    }
    return;
  }

  if (!hasCommand("gh")) {
    throw new Error("gh CLI is required");
  }

  run("gh auth status", BASE, true);
  ensureGitIdentity();

  const guardedRepos = [
    frameworkDir,
    ...packs.map((p) => path.join(base, "packs", p)),
    path.join(base, "demos", "adaptive-ui-try-aks"),
    path.join(base, "demos", "adaptive-ui-solution-architect"),
    path.join(base, "demos", "adaptive-ui-trip-notebook"),
  ];

  for (const repoDir of guardedRepos) {
    const branch = run("git rev-parse --abbrev-ref HEAD", repoDir, true);
    if (branch !== "main") {
      throw new Error(`Repo not on main: ${repoDir}`);
    }
    const dirty = run("git status --porcelain", repoDir, true);
    if (dirty) {
      throw new Error(`Dirty working tree: ${repoDir}`);
    }
  }

  const corePkgPath = path.join(frameworkDir, "packs", "core", "package.json");
  const coreName = packageNameFromJson(corePkgPath);
  const coreVersion = dryRun ? "dry-run" : bumpVersionInPackage(corePkgPath, bump);
  const frameworkSlug = repoSlugFromDir(frameworkDir);

  if (dryRun) {
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            command: "release",
            mode: "dry-run",
            bump,
            maxWait,
            summary: "Would bump and publish core + packs + demos + parent pointers",
          },
          null,
          2,
        ),
      );
    } else {
      console.log("[dry-run] Would bump and publish core + packs + demos + parent pointers");
    }
    return;
  }

  gitCommitTagPush(frameworkDir, `chore: bump to ${coreVersion}`, `v${coreVersion}`);
  waitForPublishWorkflow(coreName, coreVersion, frameworkSlug, maxWait);

  const packVersions = {};
  const packNames = {};

  for (const pack of packs) {
    const packDir = path.join(base, "packs", pack);
    const packPkg = path.join(packDir, "package.json");
    const packName = packageNameFromJson(packPkg);
    const packVersion = bumpVersionInPackage(packPkg, bump);
    updatePackageRange(packPkg, coreName, coreVersion);
    gitCommitTagPush(packDir, `chore: bump to ${packVersion}, core peer dep ^${coreVersion}`, `v${packVersion}`);
    packNames[pack] = packName;
    packVersions[pack] = packVersion;
  }

  for (const pack of packs) {
    const packDir = path.join(base, "packs", pack);
    waitForPublishWorkflow(packNames[pack], packVersions[pack], repoSlugFromDir(packDir), maxWait);
  }

  const tryAksPkg = path.join(base, "demos", "adaptive-ui-try-aks", "package.json");
  const solPkg = path.join(base, "demos", "adaptive-ui-solution-architect", "package.json");
  const tripPkg = path.join(base, "demos", "adaptive-ui-trip-notebook", "package.json");

  updatePackageRange(tryAksPkg, coreName, coreVersion);
  updatePackageRange(tryAksPkg, packNames["adaptive-ui-azure-pack"], packVersions["adaptive-ui-azure-pack"]);
  updatePackageRange(tryAksPkg, packNames["adaptive-ui-github-pack"], packVersions["adaptive-ui-github-pack"]);

  updatePackageRange(solPkg, coreName, coreVersion);
  updatePackageRange(solPkg, packNames["adaptive-ui-azure-pack"], packVersions["adaptive-ui-azure-pack"]);
  updatePackageRange(solPkg, packNames["adaptive-ui-github-pack"], packVersions["adaptive-ui-github-pack"]);

  updatePackageRange(tripPkg, coreName, coreVersion);
  updatePackageRange(tripPkg, packNames["adaptive-ui-google-flights-pack"], packVersions["adaptive-ui-google-flights-pack"]);
  updatePackageRange(tripPkg, packNames["adaptive-ui-google-maps-pack"], packVersions["adaptive-ui-google-maps-pack"]);
  updatePackageRange(tripPkg, packNames["adaptive-ui-travel-data-pack"], packVersions["adaptive-ui-travel-data-pack"]);

  gitCommitPush(path.join(base, "demos", "adaptive-ui-try-aks"), `chore: update deps core ${coreVersion}`);
  gitCommitPush(path.join(base, "demos", "adaptive-ui-solution-architect"), `chore: update deps core ${coreVersion}`);
  gitCommitPush(path.join(base, "demos", "adaptive-ui-trip-notebook"), `chore: update deps core ${coreVersion}`);

  gitCommitPush(base, `chore: update submodules after ${bump} bump to core ${coreVersion}`);
  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          command: "release",
          mode: "execute",
          bump,
          coreVersion,
          packVersions,
          result: "completed",
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log("Release flow completed.");
}

function sync(options) {
  const jsonMode = Boolean(options.json);
  const out = (msg) => {
    if (!jsonMode) {
      console.log(msg);
    }
  };

  if (options.help) {
    const text = "Usage: node tooling/workspacectl.mjs sync [--dry-run] [--create-pr] [--branch <name>] [--base <main>] [--json]";
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            command: "sync",
            usage: text,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(text);
    }
    return;
  }

  const dryRun = Boolean(options["dry-run"]);
  const branch = String(options.branch || "auto/update-submodules");
  const createPr = Boolean(options["create-pr"]);
  const baseBranch = String(options.base || "main");

  if (dryRun) {
    out("[dry-run] Sync preview mode. No files will be modified and no PR will be created.");
    const summary = run("git submodule foreach --recursive 'branch=$(git symbolic-ref --short HEAD 2>/dev/null || true); if [ -n \"$branch\" ]; then git fetch origin $branch >/dev/null 2>&1 || true; local=$(git rev-parse --short HEAD); remote=$(git rev-parse --short origin/$branch 2>/dev/null || echo unknown); if [ \"$local\" != \"$remote\" ]; then echo $name:$branch:$local:$remote; fi; fi'", BASE, true);
    if (!summary) {
      out("[dry-run] No submodule pointer updates detected against tracked origin branches.");
    } else {
      out("[dry-run] Submodules with available upstream commits:");
      out(summary);
    }
    if (createPr) {
      out(`[dry-run] Would create/update PR from branch ${branch} to ${baseBranch} if pointer changes exist.`);
    }
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            command: "sync",
            mode: "dry-run",
            createPr,
            branch,
            baseBranch,
            changed: Boolean(summary),
            summary: summary ? summary.split("\n") : [],
          },
          null,
          2,
        ),
      );
    }
    return;
  }

  runInherit("git submodule update --init --recursive", BASE);
  runInherit("git submodule foreach --recursive 'branch=$(git symbolic-ref --short HEAD 2>/dev/null || true); if [ -n \"$branch\" ]; then git pull --ff-only origin \"$branch\" || true; fi'", BASE);
  const changed = run("git status --porcelain", BASE, true);
  if (!changed) {
    if (jsonMode) {
      console.log(JSON.stringify({ command: "sync", mode: "execute", result: "no-updates" }, null, 2));
    } else {
      console.log("No submodule updates detected.");
    }
    return;
  }

  if (!createPr) {
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            command: "sync",
            mode: "execute",
            result: "updates-detected",
            createPr: false,
          },
          null,
          2,
        ),
      );
    } else {
      console.log("Submodule updates detected. Run with --create-pr to push PR.");
    }
    return;
  }

  if (!hasCommand("gh")) {
    throw new Error("gh CLI is required for --create-pr");
  }

  runInherit(`git checkout -B ${branch}`, BASE);
  runInherit("git add -A", BASE);
  try {
    runInherit('git commit -m "chore: update submodule pointers"', BASE);
  } catch {
    console.log("No commit needed.");
    return;
  }
  runInherit(`git push -f origin ${branch}`, BASE);

  const existingPr = run(`gh pr list --head ${branch} --base ${baseBranch} --json number --jq '.[0].number // ""'`, BASE, true);
  if (existingPr) {
    if (jsonMode) {
      console.log(
        JSON.stringify(
          {
            command: "sync",
            mode: "execute",
            result: "pr-exists",
            branch,
            baseBranch,
            prNumber: Number(existingPr),
          },
          null,
          2,
        ),
      );
    } else {
      console.log(`PR already exists: #${existingPr}`);
    }
    return;
  }

  runInherit(
    `gh pr create --title "chore: update submodule pointers" --body "Automated submodule pointer update. Run \\\`git submodule update --init\\\` after merging." --base ${baseBranch} --head ${branch}`,
    BASE,
  );
  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          command: "sync",
          mode: "execute",
          result: "pr-created",
          branch,
          baseBranch,
        },
        null,
        2,
      ),
    );
  }
}

function commitSync(options) {
  const manifest = loadManifest();
  const defaultBranch = String(manifest.defaultBranch || "main");
  const dryRun = Boolean(options["dry-run"]);
  const branch = String(options.branch || "auto/update-submodules");
  const baseBranch = String(options.base || "main");
  const commitMessage = String(options.message || "chore: commit pending workspace changes");

  const repos = (manifest.repos || [])
    .map((repo) => repo.path)
    .filter((repoPath) => repoPath !== "api");

  const dirtyRepos = [];
  for (const repoPath of repos) {
    const repoDir = path.join(BASE, repoPath);
    if (!fs.existsSync(repoDir)) {
      continue;
    }
    const gitDir = path.join(repoDir, ".git");
    if (!fs.existsSync(gitDir)) {
      continue;
    }
    const dirty = run("git status --porcelain", repoDir, true);
    if (dirty) {
      dirtyRepos.push({ repoPath, repoDir });
    }
  }

  if (dryRun) {
    console.log("[dry-run] commit-sync preview");
    if (dirtyRepos.length === 0) {
      console.log("[dry-run] No dirty submodule repos detected.");
    } else {
      console.log("[dry-run] Dirty repos to commit/push:");
      for (const repo of dirtyRepos) {
        console.log(`- ${repo.repoPath}`);
      }
    }
    console.log(`[dry-run] Would run: sync --create-pr --branch ${branch} --base ${baseBranch}`);
    return;
  }

  for (const repo of dirtyRepos) {
    console.log(`Committing ${repo.repoPath}`);
    const currentBranch = run("git rev-parse --abbrev-ref HEAD", repo.repoDir, true);
    if (currentBranch === "HEAD") {
      runInherit(`git checkout ${defaultBranch}`, repo.repoDir);
    }
    runInherit("git add -A", repo.repoDir);
    try {
      runInherit(`git commit -m \"${commitMessage.replace(/\"/g, "\\\\\"")}\"`, repo.repoDir);
      const pushBranch = run("git rev-parse --abbrev-ref HEAD", repo.repoDir, true);
      runInherit(`git push origin ${pushBranch}`, repo.repoDir);
    } catch {
      console.log(`No commit created in ${repo.repoPath}`);
    }
  }

  sync({ "create-pr": true, branch, base: baseBranch });
}

function parseProvisionArgs(options) {
  const required = ["name", "resource-group", "location"];
  for (const key of required) {
    if (!options[key]) {
      throw new Error(`Missing required option --${key}`);
    }
  }
  const sku = options.sku || "Free";
  if (sku !== "Free" && sku !== "Standard") {
    throw new Error("--sku must be Free or Standard");
  }
  return {
    name: String(options.name),
    resourceGroup: String(options["resource-group"]),
    location: String(options.location),
    subscription: options.subscription ? String(options.subscription) : "",
    sku,
    domain: options.domain ? String(options.domain) : "",
    dnsZoneId: options["dns-zone-id"] ? String(options["dns-zone-id"]) : "",
    dnsZoneRg: options["dns-zone-rg"] ? String(options["dns-zone-rg"]) : "",
    dnsZoneName: options["dns-zone-name"] ? String(options["dns-zone-name"]) : "",
  };
}

function parseDnsZoneId(zoneId) {
  const rgMatch = zoneId.match(/[Rr]esource[Gg]roups\/([^/]+)/);
  const zoneMatch = zoneId.match(/[Dd][Nn][Ss][Zz]ones\/([^/]+)$/);
  if (!rgMatch || !zoneMatch) {
    throw new Error("Could not parse --dns-zone-id");
  }
  return { dnsZoneRg: rgMatch[1], dnsZoneName: zoneMatch[1] };
}

function provision(options) {
  if (!hasCommand("az")) {
    throw new Error("Azure CLI (az) is required");
  }

  const cfg = parseProvisionArgs(options);
  if (cfg.dnsZoneId) {
    const parsed = parseDnsZoneId(cfg.dnsZoneId);
    cfg.dnsZoneRg = parsed.dnsZoneRg;
    cfg.dnsZoneName = parsed.dnsZoneName;
  }

  if (cfg.domain && (!cfg.dnsZoneRg || !cfg.dnsZoneName)) {
    throw new Error("--domain requires --dns-zone-id or both --dns-zone-rg and --dns-zone-name");
  }

  try {
    run("az account show", BASE, true);
  } catch {
    runInherit("az login", BASE);
  }

  if (cfg.subscription) {
    runInherit(`az account set --subscription "${cfg.subscription}"`, BASE);
  }

  const subId = run("az account show --query id -o tsv", BASE, true);
  console.log(`Using subscription: ${subId}`);

  try {
    run(`az group show --name "${cfg.resourceGroup}"`, BASE, true);
  } catch {
    runInherit(`az group create --name "${cfg.resourceGroup}" --location "${cfg.location}"`, BASE);
  }

  try {
    run(`az staticwebapp show --name "${cfg.name}" --resource-group "${cfg.resourceGroup}"`, BASE, true);
  } catch {
    runInherit(`az staticwebapp create --name "${cfg.name}" --resource-group "${cfg.resourceGroup}" --location "${cfg.location}" --sku "${cfg.sku}"`, BASE);
  }

  const defaultHostname = run(`az staticwebapp show --name "${cfg.name}" --resource-group "${cfg.resourceGroup}" --query defaultHostname -o tsv`, BASE, true);
  let deployToken = run(`az staticwebapp secrets list --name "${cfg.name}" --resource-group "${cfg.resourceGroup}" --query properties.apiKey -o tsv`, BASE, true);
  if (!deployToken) {
    deployToken = run(`az staticwebapp secrets list --name "${cfg.name}" --resource-group "${cfg.resourceGroup}" --query apiKey -o tsv`, BASE, true);
  }

  if (cfg.domain) {
    let recordName = "";
    if (cfg.domain === cfg.dnsZoneName) {
      recordName = "@";
    } else if (cfg.domain.endsWith(`.${cfg.dnsZoneName}`)) {
      recordName = cfg.domain.slice(0, -(cfg.dnsZoneName.length + 1));
    } else {
      throw new Error(`Domain ${cfg.domain} is not in zone ${cfg.dnsZoneName}`);
    }

    runInherit(`az network dns record-set cname create --resource-group "${cfg.dnsZoneRg}" --zone-name "${cfg.dnsZoneName}" --name "${recordName}" --ttl 300`, BASE);
    runInherit(`az network dns record-set cname set-record --resource-group "${cfg.dnsZoneRg}" --zone-name "${cfg.dnsZoneName}" --record-set-name "${recordName}" --cname "${defaultHostname}"`, BASE);

    try {
      runInherit(`az staticwebapp hostname set --name "${cfg.name}" --resource-group "${cfg.resourceGroup}" --hostname "${cfg.domain}"`, BASE);
    } catch {
      console.log("Custom domain bind not ready yet. Retry later.");
    }
  }

  let repoSlug = "";
  try {
    repoSlug = repoSlugFromDir(BASE);
  } catch {
    repoSlug = "your-repo";
  }

  console.log("\nStatic Web App provisioned");
  console.log(`Name: ${cfg.name}`);
  console.log(`Resource group: ${cfg.resourceGroup}`);
  console.log(`Region: ${cfg.location}`);
  console.log(`SKU: ${cfg.sku}`);
  console.log(`Default hostname: https://${defaultHostname}`);
  if (cfg.domain) {
    console.log(`Custom domain: https://${cfg.domain}`);
  }
  console.log(`GitHub secret repo: ${repoSlug}`);
  console.log("Secret name: AZURE_STATIC_WEB_APPS_API_TOKEN");
  console.log(`Secret value: ${deployToken}`);
}

function usage() {
  console.log("Usage: node tooling/workspacectl.mjs <command> [options]");
  console.log("");
  console.log("Commands:");
  console.log("  doctor [--json]");
  console.log("  contract [--json]");
  console.log("  build");
  console.log("  start <trip-notebook|solution-architect|try-aks>");
  console.log("  release <patch|minor|major> [--dry-run] [--max-wait <seconds>] [--json]");
  console.log("  sync [--dry-run] [--create-pr] [--branch <name>] [--base <main>] [--json]");
  console.log("  commit-sync [--message <commit-message>] [--branch <name>] [--base <main>] [--dry-run]");
  console.log("  provision --name <swa> --resource-group <rg> --location <region> [--subscription <id>] [--sku <Free|Standard>] [--domain <fqdn>] [--dns-zone-id <id> | --dns-zone-rg <rg> --dns-zone-name <zone>]");
}

function main() {
  const [, , command, ...rest] = process.argv;
  const { options, positional } = parseOptions(rest);

  if (!command || command === "--help" || command === "-h" || options.help) {
    usage();
    process.exit(0);
  }

  if (command === "doctor") {
    doctor(options);
    return;
  }
  if (command === "contract") {
    contract(options);
    return;
  }
  if (command === "build") {
    build();
    return;
  }
  if (command === "start") {
    const app = positional[0];
    if (!app) throw new Error("start requires app name");
    start(app);
    return;
  }
  if (command === "release") {
    const bump = positional[0];
    if (!bump) throw new Error("release requires bump type");
    release(bump, options);
    return;
  }
  if (command === "sync") {
    sync(options);
    return;
  }
  if (command === "commit-sync") {
    commitSync(options);
    return;
  }
  if (command === "provision") {
    provision(options);
    return;
  }

  usage();
  process.exit(command ? 1 : 0);
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
