import type { NextConfig } from "next";

const config: NextConfig = {
  transpilePackages: ["@bench/core"],
  serverExternalPackages: ["genlayer-js", "alkahest-ts"],
};

export default config;
