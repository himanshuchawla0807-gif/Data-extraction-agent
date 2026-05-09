import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const pythonCandidates =
  process.platform === "win32"
    ? [join(root, ".venv", "Scripts", "python.exe"), "python"]
    : [join(root, ".venv", "bin", "python"), "python3", "python"];

const python = pythonCandidates.find((candidate) => {
  if (candidate.includes(root)) {
    return existsSync(candidate);
  }
  return true;
});

const child = spawn(python, [join(root, "cli.py"), ...process.argv.slice(2)], {
  cwd: root,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});

child.on("error", (error) => {
  console.error(`Failed to start Oriplex Data Gateway: ${error.message}`);
  process.exit(1);
});
