import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureDockerEnvironment } from "./init-docker-env.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
ensureDockerEnvironment();

const docker = spawn(
  "docker",
  ["compose", "--env-file", ".env.docker", "up", "--build"],
  { cwd: projectRoot, stdio: "inherit" },
);

docker.on("error", (error) => {
  console.error("Could not start Docker Compose. Is Docker Desktop/Engine running?", error.message);
  process.exit(1);
});

docker.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
