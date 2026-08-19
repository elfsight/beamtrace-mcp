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

const pluginNamePattern = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/;

function addError(message) {
  errors.push(message);
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

const allowedMcpTransports = new Set(["http", "sse", "streamable-http"]);

function collectMcpServerEntries(mcpConfig) {
  if (!mcpConfig || typeof mcpConfig !== "object" || Array.isArray(mcpConfig)) {
    return [];
  }
  if (mcpConfig.mcpServers && typeof mcpConfig.mcpServers === "object") {
    return Object.entries(mcpConfig.mcpServers);
  }
  return Object.entries(mcpConfig);
}

function validateMcpJson(mcpConfig) {
  const entries = collectMcpServerEntries(mcpConfig);
  if (entries.length === 0) {
    addError("mcp.json must define at least one MCP server entry.");
    return [];
  }

  const urls = [];
  for (const [serverName, serverConfig] of entries) {
    if (!serverConfig || typeof serverConfig !== "object" || Array.isArray(serverConfig)) {
      addError(`mcp.json server "${serverName}" must be an object.`);
      continue;
    }
    const url = serverConfig.url;
    if (typeof url !== "string" || !/^https:\/\/\S+$/.test(url)) {
      addError(`mcp.json server "${serverName}" needs an https "url".`);
    } else {
      urls.push(url);
    }
    const transport = serverConfig.transport ?? serverConfig.type;
    if (transport !== undefined && !allowedMcpTransports.has(transport)) {
      addError(
        `mcp.json server "${serverName}" has invalid transport/type "${transport}". Use http, sse, or streamable-http.`
      );
    }
  }
  return urls;
}

function validateServerJson(serverManifest, mcpUrls) {
  if (typeof serverManifest.name !== "string" || !/^[a-zA-Z0-9.-]+\/[a-zA-Z0-9._-]+$/.test(serverManifest.name)) {
    addError('server.json "name" must be reverse-DNS with a single "/" (e.g. com.beamtrace/mcp).');
  }
  if (typeof serverManifest.version !== "string" || serverManifest.version.length === 0) {
    addError('server.json "version" is required.');
  }
  if (typeof serverManifest.description !== "string" || serverManifest.description.length === 0) {
    addError('server.json "description" is required.');
  } else if (serverManifest.description.length > 100) {
    addError(
      `server.json "description" is ${serverManifest.description.length} chars; MCP Registry max is 100.`
    );
  }
  if (typeof serverManifest.title === "string" && serverManifest.title.length > 100) {
    addError(`server.json "title" is ${serverManifest.title.length} chars; max is 100.`);
  }

  const remotes = serverManifest.remotes;
  if (!Array.isArray(remotes) || remotes.length === 0) {
    addError('server.json must include a non-empty "remotes" array for remote-only packaging.');
    return;
  }

  const remoteUrls = [];
  for (const [index, remote] of remotes.entries()) {
    if (!remote || typeof remote !== "object") {
      addError(`server.json remotes[${index}] must be an object.`);
      continue;
    }
    if (remote.type !== "streamable-http" && remote.type !== "sse") {
      addError(`server.json remotes[${index}].type must be "streamable-http" or "sse".`);
    }
    if (typeof remote.url !== "string" || !/^https:\/\/\S+$/.test(remote.url)) {
      addError(`server.json remotes[${index}] needs an https "url".`);
    } else {
      remoteUrls.push(remote.url);
    }
  }

  if (mcpUrls.length > 0 && remoteUrls.length > 0) {
    const mcpSet = new Set(mcpUrls);
    const overlap = remoteUrls.some((url) => mcpSet.has(url));
    if (!overlap) {
      addError("mcp.json URL(s) do not match any server.json remotes[].url.");
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

  if (pluginManifest.license === "MIT" && !(await pathExists(path.join(repoRoot, "LICENSE")))) {
    addError('plugin.json claims "MIT" but LICENSE file is missing.');
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

  const agentsDir = path.join(repoRoot, "agents");
  if (await pathExists(agentsDir)) {
    for (const file of await walkFiles(agentsDir)) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".md" || ext === ".mdc" || ext === ".markdown") {
        await validateFrontmatterFile(file, "agent", ["name", "description"]);
      }
    }
  }

  const commandsDir = path.join(repoRoot, "commands");
  if (await pathExists(commandsDir)) {
    for (const file of await walkFiles(commandsDir)) {
      const ext = path.extname(file).toLowerCase();
      if (ext === ".md" || ext === ".mdc" || ext === ".markdown") {
        await validateFrontmatterFile(file, "command", ["name", "description"]);
      }
    }
  }

  const mcpPath = path.join(repoRoot, "mcp.json");
  const mcpConfig = await readJsonFile(mcpPath, "mcp.json");
  const mcpUrls = mcpConfig ? validateMcpJson(mcpConfig) : [];

  const serverPath = path.join(repoRoot, "server.json");
  const serverManifest = await readJsonFile(serverPath, "server.json");
  if (serverManifest) {
    validateServerJson(serverManifest, mcpUrls);
  }

  if (await pathExists(path.join(repoRoot, ".cursor-plugin", "marketplace.json"))) {
    addError(
      "marketplace.json found — this repo is a single-plugin layout. Remove .cursor-plugin/marketplace.json."
    );
  }

  summarizeAndExit();
}

function summarizeAndExit() {
  if (errors.length > 0) {
    console.error("Validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exit(1);
  }
  console.log("Validation passed.");
}

await main();
