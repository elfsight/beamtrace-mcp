#!/usr/bin/env node
/**
 * Validate a single-plugin Cursor repo (plugin at repository root).
 * Adapted from cursor/plugin-template for multi-plugin marketplaces.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

const pluginNamePattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

function addError(message) {
  errors.push(message);
}

function addWarning(message) {
  warnings.push(message);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(filePath, context) {
  if (!(await pathExists(filePath))) {
    addError(`${context} is missing: ${filePath}`);
    return null;
  }
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    addError(`${context} contains invalid JSON (${filePath}): ${error.message}`);
    return null;
  }
}

function normalizeNewlines(content) {
  return content.replace(/\r\n/g, "\n");
}

function parseFrontmatter(content) {
  const normalized = normalizeNewlines(content);
  if (!normalized.startsWith("---\n")) {
    return null;
  }
  const closingIndex = normalized.indexOf("\n---\n", 4);
  if (closingIndex === -1) {
    return null;
  }
  const frontmatterBlock = normalized.slice(4, closingIndex);
  const fields = {};
  for (const line of frontmatterBlock.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    fields[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return fields;
}

async function walkFiles(dirPath) {
  const files = [];
  const stack = [dirPath];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(entryPath);
      else if (entry.isFile()) files.push(entryPath);
    }
  }
  return files;
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (value.startsWith("http://") || value.startsWith("https://")) return true;
  if (path.isAbsolute(value)) return false;
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  return !normalized.startsWith("../") && normalized !== "..";
}

function extractPathValues(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => extractPathValues(entry));
  if (value && typeof value === "object") {
    const candidates = [];
    if (typeof value.path === "string") candidates.push(value.path);
    if (typeof value.file === "string") candidates.push(value.file);
    return candidates;
  }
  return [];
}

async function validateReferencedPath(pluginDir, fieldName, pathValue) {
  if (pathValue.startsWith("http://") || pathValue.startsWith("https://")) return;
  if (!isSafeRelativePath(pathValue)) {
    addError(
      `field "${fieldName}" has invalid path "${pathValue}". Use a relative path without ".." or absolute prefixes.`
    );
    return;
  }
  const resolved = path.resolve(pluginDir, pathValue);
  if (!(await pathExists(resolved))) {
    addError(`field "${fieldName}" references missing path "${pathValue}".`);
  }
}

async function validateFrontmatterFile(filePath, componentName, requiredKeys) {
  const content = await fs.readFile(filePath, "utf8");
  const parsed = parseFrontmatter(content);
  const relativeFile = path.relative(repoRoot, filePath);
  if (!parsed) {
    addError(`${componentName} file missing YAML frontmatter: ${relativeFile}`);
    return;
  }
  for (const key of requiredKeys) {
    if (!parsed[key] || parsed[key].length === 0) {
      addError(`${componentName} file missing "${key}" in frontmatter: ${relativeFile}`);
    }
  }
}

async function main() {
  const manifestPath = path.join(repoRoot, ".cursor-plugin", "plugin.json");
  const pluginManifest = await readJsonFile(manifestPath, "Plugin manifest");
  if (!pluginManifest) {
    summarizeAndExit();
    return;
  }

  if (typeof pluginManifest.name !== "string" || !pluginNamePattern.test(pluginManifest.name)) {
    addError('"name" in plugin.json must be lowercase and use only alphanumerics, hyphens, and periods.');
  }

  for (const field of ["logo", "rules", "skills", "agents", "commands", "hooks", "mcpServers"]) {
    for (const value of extractPathValues(pluginManifest[field])) {
      await validateReferencedPath(repoRoot, field, value);
    }
  }

  const rulesDir = path.join(repoRoot, "rules");
  if (await pathExists(rulesDir)) {
    for (const file of await walkFiles(rulesDir)) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".md" || ext === ".mdc" || ext === ".markdown") {
        await validateFrontmatterFile(file, "rule", ["description"]);
      }
    }
  }

  const skillsDir = path.join(repoRoot, "skills");
  if (await pathExists(skillsDir)) {
    for (const file of await walkFiles(skillsDir)) {
      if (path.basename(file) === "SKILL.md") {
        await validateFrontmatterFile(file, "skill", ["name", "description"]);
      }
    }
  }

  if (!(await pathExists(path.join(repoRoot, "mcp.json")))) {
    addWarning("no mcp.json file found (only needed when using MCP servers).");
  }

  if (await pathExists(path.join(repoRoot, ".cursor-plugin", "marketplace.json"))) {
    addError(
      "marketplace.json found — this repo is a single-plugin layout. Remove .cursor-plugin/marketplace.json."
    );
  }

  summarizeAndExit();
}

function summarizeAndExit() {
  if (warnings.length > 0) {
    console.log("Warnings:");
    for (const warning of warnings) console.log(`- ${warning}`);
    console.log("");
  }
  if (errors.length > 0) {
    console.error("Validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("Validation passed.");
}

await main();
