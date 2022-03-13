import { ChainId, Fetcher, Route, Token, WETH } from "@uniswap/sdk";
import axios from "axios";
import { Contract } from "ethers";

export const DAI_ADDR = "0x6B175474E89094C44Da98b954EedeAC495271d0F";
export const ETH_ADDR = "0xc0e8de0d4262b3fef33169088a483061a11850eb";
export const TOKE_ADDR = "0x2e9d63788249371f1DFC918a52f8d799F4a38C94";
export const ROUTER_V2_ADDR = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D";
export const TOKE_ETH_LP = "0x5Fa464CEfe8901d66C09b85d5Fcdc55b3738c688";
export const TOKEMAK_REWARDS = "0x79dD22579112d8a5F7347c5ED7E609e60da713C5";
export const TOKEMAK_REWARD_HASH = "0x5ec3EC6A8aC774c7d53665ebc5DDf89145d02fB6";

export const MAX_INT =
  "115792089237316195423570985008687907853269984665640564039457584007913129639935";

// a user that actually uses tokemak
// change this based on this: https://v2.info.uniswap.org/pair/0x5fa464cefe8901d66c09b85d5fcdc55b3738c688
// ideally, we should set up a user that has a balance of staked LP tokens in tokemak and then fork mainnet for most consistent results
// since the users on that list may remove their lp positions
// needs to be all lowercase for the tokemak api request
export const IMPERSONATE_ACCT = "0x9e0bcE7ec474B481492610eB9dd5D69EB03718D5";

// staking pool on tokemak for the toke-eth lp token
// from https://docs.tokemak.xyz/protocol-information/contract-interactions
export const TOKE_ETH_LP_POOL = "0x1b429e75369ea5cd84421c1cc182cee5f3192fd3";

// https://etherscan.io/address/0xbbfC7D1D53116830326478F77F489530CEC7Ba8a#code
export const TOKEMAK_POOL_ABI =
  require("../artifacts/contracts/interfaces/ILiquidityPool.sol/ILiquidityPool.json").abi;

// source:
// https://etherscan.io/address/0x79dD22579112d8a5F7347c5ED7E609e60da713C5#code#F56#L1
// https://ethereum.stackexchange.com/questions/92298/keccak256-hash-different-in-solidity-and-web3js
// https://github.com/steven4354/tokemak-smart-contracts-public/blob/11170b4cc8801500fdb8080416f3278c2a0649c0/contracts/interfaces/IRewards.sol#L20
export const TOKEMAK_REWARDS_ABI =
  require("../tokemak/contracts/interfaces/IRewards.sol/IRewards.json").abi;

// https://etherscan.io/address/0x5ec3EC6A8aC774c7d53665ebc5DDf89145d02fB6#code#F1#L14
// found on github: https://github.com/0xDejenn/tokemak-rewards/blob/9eddd0a1ad3664079b5dff99012da8b20dd29609/abis/rewards-hash.json
export const REWARD_HASH_ABI = require("../tokemak/reward-hash.json");

export const getTOKEPriceinWETH = async () => {
  const TOKE = new Token(ChainId.MAINNET, TOKE_ADDR, 18);

  const TOKEWETHPair = await Fetcher.fetchPairData(TOKE, WETH[ChainId.MAINNET]);

  const route = new Route([TOKEWETHPair], WETH[ChainId.MAINNET]);

  const priceStr = route.midPrice.toSignificant(6); // 1 eth = 92 toke (feb 22, 2022)
  return parseFloat(priceStr);
};

// wallet is a public address
export const getTokemakeOffchainData = async (
  tokemakRewardHash: Contract,
  wallet: string
) => {
  try {
    const latestCycleIndex = await tokemakRewardHash.latestCycleIndex();
    console.log(`latestCycleIndex: ${latestCycleIndex}`);

    const { latestClaimable, cycle } = await tokemakRewardHash.cycleHashes(
      latestCycleIndex
    );
    console.log(`latestClaimable: ${latestClaimable}`);

    // use claimable hash to get recipient info from cloudflare
    const url = `https://cloudflare-ipfs.com/ipfs/${latestClaimable}/${wallet.toLowerCase()}.json`;
    const { data } = await axios.get(url);

    return data;
  } catch (e) {
    console.error(e);
    return null;
  }
};
