// Starts a Hardhat node (chain id 4221) for the local Alkahest tests and stops it afterwards.
import { spawn, type ChildProcess } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const LOCAL_RPC = "http://127.0.0.1:8546";
let node: ChildProcess | undefined;

async function rpcUp(): Promise<boolean> {
  try {
    const r = await fetch(LOCAL_RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

export async function setup() {
  if (await rpcUp()) return;
  const here = dirname(fileURLToPath(import.meta.url));
  node = spawn("npx", ["hardhat", "node", "--config", join(here, "hardhat.config.cjs"), "--port", "8546"], {
    cwd: here,
    stdio: "ignore",
    detached: true, // own process group, so teardown stops npx and the node it starts
  });
  for (let i = 0; i < 120; i++) {
    if (await rpcUp()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("hardhat node did not start on :8546");
}

export async function teardown() {
  if (node?.pid) {
    try {
      process.kill(-node.pid, "SIGTERM");
    } catch {
      node.kill();
    }
  }
}
