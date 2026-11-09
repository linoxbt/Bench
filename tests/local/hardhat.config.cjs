// Local EVM for tests/local: a GenLayer-Chain stand-in (chain id 4221) running Alkahest's real bytecode.
module.exports = {
  networks: {
    hardhat: {
      chainId: 4221,
      hardfork: "cancun",
      allowUnlimitedContractSize: true,
      mining: { auto: true, interval: 1000 }, // new blocks keep coming, as on a live chain
    },
  },
};
