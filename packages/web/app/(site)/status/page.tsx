import type { Metadata } from "next";
import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "viem/chains";
import { ALKAHEST_BASE_SEPOLIA, genlayerChain } from "@bench/core/browser";
import { genlayer } from "@bench/core";
import { Container, PageHero } from "@/components/site/blocks";
import { ArrowUpRight } from "@/components/site/icons";
import { PUBLIC } from "@/lib/config";

export const metadata: Metadata = { title: "Status & deployments", description: "Live networks and contract addresses, checked against the chain." };
export const revalidate = 60;

type Row = { name: string; network: string; address?: string; href?: string; state: "live" | "missing" | "pending" | "unknown"; detail: string };

const STUDIO_B = "0x6E7aB064add7eE67Ba1cEd35BC496293c65515f0";

async function codeAt(rpc: "4221" | "base", address: Address): Promise<boolean | undefined> {
  try {
    const client = createPublicClient({ chain: rpc === "4221" ? genlayerChain : baseSepolia, transport: http(undefined, { timeout: 8000 }) });
    const code = await client.getCode({ address });
    return Boolean(code && code !== "0x");
  } catch {
    return undefined;
  }
}

async function judgeCases(address: Address, network: "studionet" | "bradbury"): Promise<number | undefined> {
  try {
    return Number(await genlayer({ network }).client.readContract({ address, functionName: "case_count", args: [] }));
  } catch {
    return undefined;
  }
}

export default async function Status() {
  const studio = PUBLIC.judgeStudionet;
  const [studioCases, studioBCases, a4221, aBase, bradburyCases] = await Promise.all([
    studio ? judgeCases(studio, "studionet") : Promise.resolve(undefined),
    judgeCases(STUDIO_B, "studionet"),
    codeAt("4221", PUBLIC.alkahest.trustedOracleArbiter),
    codeAt("base", ALKAHEST_BASE_SEPOLIA.trustedOracleArbiter),
    PUBLIC.judge ? judgeCases(PUBLIC.judge, "bradbury") : Promise.resolve(undefined),
  ]);

  const rows: Row[] = [
    {
      name: "BenchJudge",
      network: "Testnet Bradbury",
      address: PUBLIC.judge,
      href: PUBLIC.judge && `https://explorer-bradbury.genlayer.com/address/${PUBLIC.judge}`,
      state: PUBLIC.judge ? (bradburyCases === undefined ? "unknown" : "live") : "pending",
      detail: PUBLIC.judge ? `${bradburyCases ?? "?"} cases` : "Not configured for this deployment",
    },
    {
      name: "BenchJudge (free preview sandbox)",
      network: "GenLayer Studionet",
      address: studio,
      href: studio && `https://explorer-studio.genlayer.com/address/${studio}`,
      state: studioCases === undefined ? "unknown" : "live",
      detail: studioCases === undefined ? "Couldn't reach Studionet" : `${studioCases} cases`,
    },
    {
      name: "BenchJudgeB (Plan B)",
      network: "GenLayer Studionet → Base Sepolia",
      address: STUDIO_B,
      href: `https://explorer-studio.genlayer.com/address/${STUDIO_B}`,
      state: studioBCases === undefined ? "unknown" : "live",
      detail: studioBCases === undefined ? "Couldn't reach Studionet" : `${studioBCases} cases`,
    },
    {
      name: "Alkahest TrustedOracleArbiter",
      network: "GenLayer Chain 4221",
      address: PUBLIC.alkahest.trustedOracleArbiter,
      href: `https://explorer.testnet-chain.genlayer.com/address/${PUBLIC.alkahest.trustedOracleArbiter}`,
      state: a4221 === undefined ? "unknown" : a4221 ? "live" : "missing",
      detail: a4221 ? "Contract code present" : "No code at the published address; needs pnpm deploy:alkahest",
    },
    {
      name: "Alkahest TrustedOracleArbiter",
      network: "Base Sepolia",
      address: ALKAHEST_BASE_SEPOLIA.trustedOracleArbiter,
      href: `https://sepolia.basescan.org/address/${ALKAHEST_BASE_SEPOLIA.trustedOracleArbiter}`,
      state: aBase === undefined ? "unknown" : aBase ? "live" : "missing",
      detail: aBase ? "Contract code present" : "No code found",
    },
  ];

  const badge = {
    live: "bg-[#e7f6ee] text-pass",
    missing: "bg-[#fdecea] text-fail",
    pending: "bg-[#fff4e5] text-warn",
    unknown: "bg-wash text-muted",
  } as const;

  return (
    <>
      <PageHero
        eyebrow="Status"
        title="What's live, right now."
        lede="Every row below is checked against the chain when this page renders, refreshed every minute."
      />
      <Container className="pb-28">
        <div className="card divide-y divide-line">
          {rows.map((r) => (
            <div key={r.name + r.network} className="grid gap-3 px-6 py-5 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
              <div>
                <p className="font-medium text-ink">{r.name}</p>
                <p className="text-sm text-muted">{r.network}</p>
              </div>
              <div className="min-w-0">
                {r.address ? (
                  <a href={r.href} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 font-mono text-xs text-blue">
                    <span className="truncate">{r.address}</span>
                    <ArrowUpRight className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="text-sm text-faint">not deployed</span>
                )}
                <p className="mt-1 text-sm text-muted">{r.detail}</p>
              </div>
              <span className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-medium capitalize ${badge[r.state]}`}>{r.state}</span>
            </div>
          ))}
        </div>
        <p className="mt-6 max-w-2xl text-sm text-muted">
          Bradbury deployments need testnet GEN, which the GenLayer faucet grants to a GitHub account older than three months holding 0.01 ETH on
          Ethereum mainnet.
        </p>
      </Container>
    </>
  );
}
