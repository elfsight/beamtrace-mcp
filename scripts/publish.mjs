#!/usr/bin/env node
/**
 * Interactive release: pick Cursor / MCP Registry / all, then semver bump or --version.
 * Cursor → bump plugin.json only. MCP → bump server.json + mcp-publisher publish.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pluginPath = path.join(repoRoot, ".cursor-plugin", "plugin.json");
const serverPath = path.join(repoRoot, "server.json");

const TARGETS = [
  { id: "cursor", label: "cursor" },
  { id: "mcp", label: "mcp registry" },
  { id: "all", label: "all" },
];
const BUMPS = ["patch", "minor", "major"];

function usage() {
  console.log(`Usage: node scripts/publish.mjs [--target cursor|mcp|all] [--bump patch|minor|major | --version x.y.z] [--yes]

Interactive by default. Cursor only bumps .cursor-plugin/plugin.json.
MCP bumps server.json, validates, then runs mcp-publisher publish.
--version sets both selected files to that version (optional v prefix).
`);
}

function parseSemver(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-.*)?$/.exec(version);
  if (!match) {
    throw new Error(`Unsupported version "${version}". Expected x.y.z`);
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
}

function formatSemver({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`;
}

function bumpSemver(version, bump) {
  let { major, minor, patch } = parseSemver(version);
  if (bump === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (bump === "minor") {
    minor += 1;
    patch = 0;
  } else {
    patch += 1;
  }
  return formatSemver({ major, minor, patch });
}

function resolveToVersion(from, bump, explicitVersion) {
  if (explicitVersion) {
    return formatSemver(parseSemver(explicitVersion));
  }
  return bumpSemver(from, bump);
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    if (result.error.code === "ENOENT") {
      console.error(
        `"${command}" not found. For MCP publish install mcp-publisher: https://github.com/modelcontextprotocol/registry/releases`
      );
      process.exit(1);
    }
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

async function choose(rl, title, options) {
  console.log(`\n${title}`);
  for (const [index, option] of options.entries()) {
    console.log(`  ${index + 1}) ${option}`);
  }
  while (true) {
    const answer = (await rl.question("> ")).trim().toLowerCase();
    const asNumber = Number(answer);
    if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= options.length) {
      return options[asNumber - 1];
    }
    if (options.includes(answer)) {
      return answer;
    }
    console.log(`Choose 1–${options.length} or one of: ${options.join(", ")}`);
  }
}

async function confirm(rl, message) {
  try {
    const answer = (await rl.question(`${message} [y/N] `)).trim().toLowerCase();
    return answer === "y" || answer === "yes";
  } catch {
    return false;
  }
}

function resolveTarget(raw) {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  if (normalized === "mcp registry") return "mcp";
  const match = TARGETS.find((entry) => entry.id === normalized || entry.label === normalized);
  return match?.id ?? null;
}

async function main() {
  const { values } = parseArgs({
    options: {
      target: { type: "string" },
      bump: { type: "string" },
      version: { type: "string" },
      yes: { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    strict: true,
  });

  if (values.help) {
    usage();
    return;
  }

  let target = resolveTarget(values.target);
  let bump = values.bump ?? null;
  let explicitVersion = values.version ?? null;

  if (values.target && !target) {
    console.error(`Invalid --target "${values.target}". Use: cursor, mcp, all`);
    process.exit(1);
  }
  if (bump && explicitVersion) {
    console.error("Use either --bump or --version, not both");
    process.exit(1);
  }
  if (bump && !BUMPS.includes(bump)) {
    console.error(`Invalid --bump "${bump}". Use: ${BUMPS.join(", ")}`);
    process.exit(1);
  }
  if (explicitVersion) {
    explicitVersion = formatSemver(parseSemver(explicitVersion));
  }

  const needsPrompt = !target || (!bump && !explicitVersion) || !values.yes;
  const rl = needsPrompt
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    if (!target) {
      const label = await choose(
        rl,
        "Publish target?",
        TARGETS.map((entry) => entry.label)
      );
      target = resolveTarget(label);
    }
    if (!bump && !explicitVersion) {
      bump = await choose(rl, "Semver bump?", BUMPS);
    }

    const plugin = await readJson(pluginPath);
    const server = await readJson(serverPath);
    const plan = [];

    if (target === "cursor" || target === "all") {
      plan.push({
        kind: "cursor",
        label: "Cursor plugin.json",
        from: plugin.version,
        to: resolveToVersion(plugin.version, bump, explicitVersion),
      });
    }
    if (target === "mcp" || target === "all") {
      plan.push({
        kind: "mcp",
        label: "MCP server.json",
        from: server.version,
        to: resolveToVersion(server.version, bump, explicitVersion),
      });
    }

    console.log("\nPlan:");
    for (const step of plan) {
      console.log(`  ${step.label}: ${step.from} → ${step.to}`);
    }
    if (target === "mcp" || target === "all") {
      console.log("  then: validate + mcp-publisher validate + publish");
    } else {
      console.log("  then: validate only (no registry publish)");
    }

    if (!values.yes) {
      const ok = await confirm(rl, "\nProceed?");
      if (!ok) {
        console.log("Aborted.");
        return;
      }
    }

    for (const step of plan) {
      if (step.kind === "cursor") {
        plugin.version = step.to;
        await writeJson(pluginPath, plugin);
        console.log(`Updated ${path.relative(repoRoot, pluginPath)} → ${step.to}`);
      } else {
        server.version = step.to;
        await writeJson(serverPath, server);
        console.log(`Updated ${path.relative(repoRoot, serverPath)} → ${step.to}`);
      }
    }

    run("node", [path.join(repoRoot, "scripts", "validate-template.mjs")]);

    if (target === "mcp" || target === "all") {
      run("mcp-publisher", ["validate"]);
      run("mcp-publisher", ["publish"]);
      console.log("MCP Registry publish finished.");
    } else {
      console.log("Cursor version bumped. Submit the plugin repo when ready.");
    }
  } finally {
    try {
      rl?.close();
    } catch {
      // ignore close races when stdin is a pipe
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
