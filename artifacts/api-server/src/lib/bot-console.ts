// A deliberately narrow "console" for the bot dashboard.
//
// Users want to type things like `pip install requests` or `npm install axios`
// to add a dependency to their bot. We do NOT expose a real shell — that would
// let one user run arbitrary code against the shared Render container (and
// its 512MB RAM budget) that also hosts every other user's bot. Instead we:
//   1. Parse the command against a strict whitelist (pip/npm install|uninstall only).
//   2. Validate every package token against a safe-charset regex (no shell
//      metacharacters, no flags besides a small allowlist).
//   3. Edit requirements.txt / package.json directly in R2 (the source of
//      truth — see downloadBotFiles) instead of running the package manager
//      inside the console request itself.
//   4. Trigger the existing restart pipeline, which already re-runs
//      `pip install -r requirements.txt` / `npm install` with the same
//      timeouts and memory caps used for every normal boot.
//
// A global queue serializes installs across ALL bots on this instance so we
// never run two pip/npm processes at once — on a 512MB free-tier box, two
// concurrent installs is a common way to trigger an OOM kill that then shows
// up to users as random "errored" bots or Discord gateway latency spikes.

const PIP_RE = /^(?:pip3?|python3?\s+-m\s+pip)\s+(install|uninstall)\s+(.+)$/i;
const NPM_RE = /^npm\s+(install|i|uninstall|remove|un)\s+(.+)$/i;

// Package name charset: letters, digits, `. _ - @ / [ ] , = < > ~ ! +`
// (covers pip extras/version specifiers and npm scoped packages/versions).
const SAFE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._\-@/[\],=<>~!+]*$/;
const PIP_IGNORED_FLAGS = new Set(["-U", "--upgrade", "--user"]);
const NPM_IGNORED_FLAGS = new Set(["-S", "--save", "-D", "--save-dev", "-g", "--global"]);

const MAX_PACKAGES = 5;
const MAX_COMMAND_LENGTH = 200;

export interface ParsedConsoleCommand {
  manager: "pip" | "npm";
  action: "install" | "uninstall";
  packages: string[];
}

export class ConsoleCommandError extends Error {}

export function parseConsoleCommand(rawCommand: string, language: string): ParsedConsoleCommand {
  const command = rawCommand.trim().replace(/\s+/g, " ");
  if (!command) throw new ConsoleCommandError("Escribe un comando, por ejemplo: pip install requests");
  if (command.length > MAX_COMMAND_LENGTH) throw new ConsoleCommandError("Comando demasiado largo.");

  const pipMatch = command.match(PIP_RE);
  const npmMatch = command.match(NPM_RE);

  if (pipMatch && language !== "python") {
    throw new ConsoleCommandError("Este bot es de JavaScript — usa `npm install <paquete>`.");
  }
  if (npmMatch && language !== "javascript") {
    throw new ConsoleCommandError("Este bot es de Python — usa `pip install <paquete>`.");
  }
  if (!pipMatch && !npmMatch) {
    throw new ConsoleCommandError(
      language === "python"
        ? "Solo se permite: pip install <paquete> / pip uninstall <paquete>"
        : "Solo se permite: npm install <paquete> / npm uninstall <paquete>"
    );
  }

  const match = pipMatch || npmMatch!;
  const manager: "pip" | "npm" = pipMatch ? "pip" : "npm";
  const actionWord = match[1].toLowerCase();
  const action: "install" | "uninstall" = actionWord === "install" || actionWord === "i" ? "install" : "uninstall";

  const ignoredFlags = manager === "pip" ? PIP_IGNORED_FLAGS : NPM_IGNORED_FLAGS;
  const tokens = match[2].split(" ").filter((t) => t.length > 0 && !ignoredFlags.has(t));

  if (tokens.length === 0) throw new ConsoleCommandError("Indica al menos un paquete.");
  if (tokens.length > MAX_PACKAGES) throw new ConsoleCommandError(`Máximo ${MAX_PACKAGES} paquetes por comando.`);

  for (const token of tokens) {
    if (token.startsWith("-")) {
      throw new ConsoleCommandError(`Opción no permitida: ${token}`);
    }
    if (!SAFE_TOKEN.test(token)) {
      throw new ConsoleCommandError(`Nombre de paquete inválido: "${token}"`);
    }
  }

  return { manager, action, packages: tokens };
}

function packageBaseName(pkg: string, manager: "pip" | "npm"): string {
  if (manager === "npm") {
    // Scoped packages keep their leading @scope/, only strip a trailing @version.
    const at = pkg.indexOf("@", pkg.startsWith("@") ? 1 : 0);
    return at === -1 ? pkg : pkg.slice(0, at);
  }
  return pkg.split(/[=<>!~[]/)[0];
}

export function applyToRequirementsTxt(existing: string, cmd: ParsedConsoleCommand): { content: string; changed: string[] } {
  const lines = existing.split("\n").map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith("#"));
  const changed: string[] = [];

  if (cmd.action === "install") {
    for (const pkg of cmd.packages) {
      const base = packageBaseName(pkg, "pip").toLowerCase();
      const idx = lines.findIndex((l) => packageBaseName(l, "pip").toLowerCase() === base);
      if (idx >= 0) lines[idx] = pkg; else lines.push(pkg);
      changed.push(pkg);
    }
  } else {
    for (const pkg of cmd.packages) {
      const base = packageBaseName(pkg, "pip").toLowerCase();
      const before = lines.length;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (packageBaseName(lines[i], "pip").toLowerCase() === base) lines.splice(i, 1);
      }
      if (lines.length !== before) changed.push(pkg);
    }
  }

  return { content: lines.join("\n") + "\n", changed };
}

export function applyToPackageJson(existing: string, cmd: ParsedConsoleCommand): { content: string; changed: string[] } {
  let pkgJson: any;
  try {
    pkgJson = JSON.parse(existing);
  } catch {
    throw new ConsoleCommandError("package.json actual no es JSON válido — arréglalo desde el Administrador de Archivos primero.");
  }
  if (typeof pkgJson.dependencies !== "object" || pkgJson.dependencies === null) pkgJson.dependencies = {};

  const changed: string[] = [];
  if (cmd.action === "install") {
    for (const pkg of cmd.packages) {
      const at = pkg.startsWith("@") ? pkg.indexOf("@", 1) : pkg.indexOf("@");
      const name = at === -1 ? pkg : pkg.slice(0, at);
      const version = at === -1 ? "latest" : pkg.slice(at + 1);
      pkgJson.dependencies[name] = version;
      changed.push(pkg);
    }
  } else {
    for (const pkg of cmd.packages) {
      const name = packageBaseName(pkg, "npm");
      if (pkgJson.dependencies[name] !== undefined) {
        delete pkgJson.dependencies[name];
        changed.push(pkg);
      }
    }
  }

  return { content: JSON.stringify(pkgJson, null, 2) + "\n", changed };
}

// Global install queue: serialize all pip/npm installs across every bot on
// this instance so we never spike CPU/RAM with concurrent installs.
let installQueue: Promise<void> = Promise.resolve();

export function queueInstall<T>(job: () => Promise<T>): Promise<T> {
  const run = installQueue.then(job, job);
  installQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}
