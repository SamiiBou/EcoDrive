require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

const { PRIVATE_KEY, XRPL_EVM_RPC_URL } = process.env;

module.exports = {
  solidity: "0.8.27",
  networks: {
    xrplEvm: {
      url: XRPL_EVM_RPC_URL,
      chainId: 1440002,
      accounts: [`0x${PRIVATE_KEY}`],
      gas: "auto",
      gasPrice: "auto",
    },
  },
};
