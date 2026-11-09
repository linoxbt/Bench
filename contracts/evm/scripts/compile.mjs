// Compile BenchUSD.sol with solc-js (no network, no Foundry needed) into artifacts/BenchUSD.json.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const require = createRequire(import.meta.url);

const input = {
  language: "Solidity",
  sources: { "BenchUSD.sol": { content: readFileSync(join(root, "BenchUSD.sol"), "utf8") } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "cancun",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

function findImports(path) {
  try {
    return { contents: readFileSync(require.resolve(path), "utf8") };
  } catch {
    return { error: `not found: ${path}` };
  }
}

const out = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const errors = (out.errors ?? []).filter((e) => e.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(e.formattedMessage);
  process.exit(1);
}
const c = out.contracts["BenchUSD.sol"].BenchUSD;
mkdirSync(join(root, "artifacts"), { recursive: true });
writeFileSync(
  join(root, "artifacts", "BenchUSD.json"),
  JSON.stringify({ contractName: "BenchUSD", compiler: solc.version(), abi: c.abi, bytecode: "0x" + c.evm.bytecode.object }, null, 2) + "\n",
);
console.log(`BenchUSD compiled with solc ${solc.version()}`);
