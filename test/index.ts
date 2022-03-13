import { ChainId, Fetcher, Route, Token, WETH } from "@uniswap/sdk";
import { expect } from "chai";
import { Contract, ContractFactory } from "ethers";
import hre, { ethers } from "hardhat";
import web3 from "web3";

// abis
import Erc20 = require("../uniswap/build/ERC20.json");
import Router = require("../uniswap/build/IUniswapV2Router02.json");
import UniswapV2Pair = require("../uniswap/build/IUniswapV2Pair.json");

import {
  getTOKEPriceinWETH,
  IMPERSONATE_ACCT,
  MAX_INT,
  REWARD_HASH_ABI,
  ROUTER_V2_ADDR,
  TOKEMAK_POOL_ABI,
  TOKEMAK_REWARDS,
  TOKEMAK_REWARDS_ABI,
  TOKEMAK_REWARD_HASH,
  TOKE_ADDR,
  TOKE_ETH_LP,
  TOKE_ETH_LP_POOL,
  // eslint-disable-next-line node/no-missing-import
} from "./utils";
import axios from "axios";

// hoisting these up since used throughout
// TODO: clean up this hoisting and make before sections below cleaner
let accounts: any;
let router: Contract;
let toke: Contract;
let tokeEthLP: Contract;
let tokemakUniLPPool: Contract;
let signer: any; // impersonated account
let otherAccounts: any;
let tokemakRewards: Contract;
let tokemakRewardHash: Contract;

// why the beneficiary version is needed:
// https://forum.openzeppelin.com/t/transferfrom-always-reverts-with-revert-erc20-transfer-amount-exceeds-allowance/3993
let tokeEthLPBeneficiary: Contract;
let tokeBeneficiary: Contract;

describe("Uniswap", () => {
  before(async () => {
    // impersonate an actual user of tokemak
    await hre.network.provider.request({
      method: "hardhat_impersonateAccount",
      params: [IMPERSONATE_ACCT],
    });
    signer = await ethers.getSigner(IMPERSONATE_ACCT);
    otherAccounts = await ethers.getSigners();

    // send funds from our test acct to above user
    const ourAcctSigner = (await ethers.getSigners())[0];
    await ourAcctSigner.sendTransaction({
      to: IMPERSONATE_ACCT,
      value: ethers.utils.parseEther("1000"), // 1000 ether
    });

    // TODO: temporary, fix this later
    accounts = [
      {
        address: IMPERSONATE_ACCT,
      },
      {
        address: IMPERSONATE_ACCT,
      },
    ];

    router = new hre.ethers.Contract(ROUTER_V2_ADDR, Router.abi, signer);
    tokeEthLP = new hre.ethers.Contract(TOKE_ETH_LP, UniswapV2Pair.abi, signer);
    tokeEthLPBeneficiary = new hre.ethers.Contract(
      TOKE_ETH_LP,
      UniswapV2Pair.abi,
      otherAccounts[0]
    );
    toke = new ethers.Contract(TOKE_ADDR, Erc20.abi, signer);
    tokeBeneficiary = new ethers.Contract(
      TOKE_ADDR,
      Erc20.abi,
      otherAccounts[0]
    );
    tokemakUniLPPool = new ethers.Contract(
      TOKE_ETH_LP_POOL,
      TOKEMAK_POOL_ABI,
      signer
    );
  });

  xit("Should get pricing data from Uniswap for ETH <-> USDC swap", async () => {
    const USDC = new Token(
      ChainId.MAINNET,
      "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      6
    );
    const DAI = new Token(
      ChainId.MAINNET,
      "0x6B175474E89094C44Da98b954EedeAC495271d0F",
      18
    );

    const USDCWETHPair = await Fetcher.fetchPairData(
      USDC,
      WETH[ChainId.MAINNET]
    );
    const DAIUSDCPair = await Fetcher.fetchPairData(DAI, USDC);

    const route = new Route([USDCWETHPair, DAIUSDCPair], WETH[ChainId.MAINNET]);

    console.log("weth usdc mid price ", route.midPrice.toSignificant(6)); // 2799.24 (as of feb 28, 2022)
    console.log(
      "weth usdc mid price invert",
      route.midPrice.invert().toSignificant(6)
    ); // 0.000357239 (as of feb 28, 2022)
  });

  xit("Should get price for Uniswap ETH <-> TOKE swap", async () => {
    const TOKE = new Token(ChainId.MAINNET, TOKE_ADDR, 18);

    const TOKEWETHPair = await Fetcher.fetchPairData(
      TOKE,
      WETH[ChainId.MAINNET]
    );

    const route = new Route([TOKEWETHPair], WETH[ChainId.MAINNET]);
    console.log("weth toke mid price ", route.midPrice.toSignificant(6)); // 1 eth = 92 toke (feb 22, 2022)
    console.log(
      "weth toke mid price invert",
      route.midPrice.invert().toSignificant(6)
    ); // 1 eth = 92 toke (feb 22, 2022)
  });

  it("Should allow swap of 10 ETH to TOKE", async () => {
    const bal = await toke.balanceOf(accounts[0].address);

    const time = Math.floor(Date.now() / 1000) + 200000;
    const deadline = ethers.BigNumber.from(time);
    const WETH_ADDR = await router.WETH();

    // TODO: use a conversion for tokens instead of wei
    // workaround since Tokemak is 18 decimal places as well
    let amountOfToke = ((await getTOKEPriceinWETH()) * 10).toString();
    amountOfToke = web3.utils.toWei(amountOfToke, "ether");

    await router.swapETHForExactTokens(
      amountOfToke, // trade 10 eth for toke
      [WETH_ADDR, TOKE_ADDR],
      accounts[0].address,
      deadline,
      { value: web3.utils.toWei("10.5", "ether") } // trade 10 eth for toke, added hefty .5 for slippage, fees
    );

    const newbal = await toke.balanceOf(accounts[0].address);
    // log(`${bal.toString()} -> ${newbal.toString()}`);
  });

  xit("Should allow swap of TOKE to exact amount of ETH", async () => {
    const bal = await toke.balanceOf(accounts[0].address);
    expect(bal > 0).to.be.true;

    const time = Math.floor(Date.now() / 1000) + 200000;
    const deadline = ethers.BigNumber.from(time);
    const WETH_ADDR = await router.WETH();

    let amountOfEth = "0.1";
    amountOfEth = web3.utils.toWei(amountOfEth, "ether");

    await toke.approve(router.address, MAX_INT);

    const allowance = await toke.allowance(accounts[0].address, router.address);
    console.log("allowance", allowance);

    await router.swapTokensForExactETH(
      amountOfEth, // trade toke for .1 eth
      MAX_INT,
      [TOKE_ADDR, WETH_ADDR],
      accounts[0].address,
      deadline
    );

    const newbal = await toke.balanceOf(accounts[0].address);
    console.log(`${bal.toString()} -> ${newbal.toString()}`);
  });

  it("Should swap exact amount of TOKE to ETH", async () => {
    const bal = await toke.balanceOf(accounts[0].address);
    expect(bal > 0).to.be.true;

    const time = Math.floor(Date.now() / 1000) + 200000;
    const deadline = ethers.BigNumber.from(time);
    const WETH_ADDR = await router.WETH();

    let amountOfToke = "0.1";
    amountOfToke = web3.utils.toWei(amountOfToke, "ether"); // toke is also 18 places

    await toke.approve(router.address, MAX_INT);

    const allowance = await toke.allowance(accounts[0].address, router.address);
    // console.log("allowance", allowance);

    await router.swapExactTokensForETH(
      amountOfToke, // trade .1 toke for eth
      0,
      [TOKE_ADDR, WETH_ADDR],
      accounts[0].address,
      deadline
    );

    const newbal = await toke.balanceOf(accounts[0].address);
    // console.log(`${bal.toString()} -> ${newbal.toString()}`);
  });

  // working
  xit("Should allow transferFrom with toke", async () => {
    const otherAccounts = await ethers.getSigners();
    const bal = await toke.balanceOf(accounts[0].address);

    await toke.approve(otherAccounts[0].address, MAX_INT);

    const allowance = await toke.allowance(
      signer.address,
      otherAccounts[0].address
    );

    await tokeBeneficiary.transferFrom(
      signer.address,
      otherAccounts[0].address,
      bal.div(10)
    );
  });

  it("Should allow deposit of 50% ETH and 50% TOKE (worth about 20 ETH total) to get LP token", async () => {
    const bal = await toke.balanceOf(accounts[0].address);

    // allow uniswap to access token
    // 'TransferHelper: TRANSFER_FROM_FAILED'
    // https://ethereum.stackexchange.com/questions/87926/uniswap-transaction-fails-with-transferhelper-transfer-from-failed
    await toke.approve(router.address, bal);

    const time = Math.floor(Date.now() / 1000) + 200000;
    const deadline = ethers.BigNumber.from(time);

    await router.addLiquidityETH(
      TOKE_ADDR,
      bal,
      0,
      0,
      accounts[0].address,
      deadline,
      // added 1 extra eth for some buffer, only for easier testing
      // don't do this in prod
      { value: web3.utils.toWei("11", "ether") }
    );

    // confirm lp balance
    const lpBal = await tokeEthLP.balanceOf(accounts[0].address);
    expect(lpBal > 0).to.be.true;
  });

  xit("Should show correct supply of lp tokens", async () => {
    const supply = await tokeEthLP.totalSupply();
    expect(supply > 0).to.be.true;
  });

  // working but disabled so we can have some lp tokens for the autocompounder
  xit("Should allow transfer for toke eth lp v2", async () => {
    const otherAccounts = await ethers.getSigners();
    await tokeEthLP.approve(otherAccounts[0].address, MAX_INT);
    const allowance = await tokeEthLP.allowance(
      signer.address,
      otherAccounts[0].address
    );
    expect(allowance > 0).to.be.true;

    const balance = await tokeEthLP.balanceOf(signer.address);
    await tokeEthLPBeneficiary.transferFrom(
      signer.address,
      otherAccounts[0].address,
      balance.div(2)
    );
  });
});

describe("Tokemak", () => {
  before(async () => {
    tokemakRewards = new ethers.Contract(
      TOKEMAK_REWARDS,
      TOKEMAK_REWARDS_ABI,
      signer
    );

    tokemakRewardHash = new ethers.Contract(
      TOKEMAK_REWARD_HASH,
      REWARD_HASH_ABI,
      signer
    );
  });

  // working
  xit("Should allow staking + unstaking of ETH/TOKE lp", async () => {
    const lpBal = await tokeEthLP.balanceOf(accounts[0].address);

    await tokeEthLP.approve(tokemakUniLPPool.address, lpBal);
    await tokemakUniLPPool.deposit(lpBal);
  });

  xit("Should allow unstaking of a small (test) amount of ETH/TOKE lp", async () => {
    await tokemakUniLPPool.requestWithdrawal("1");
    const withdrawalinfo = await tokemakUniLPPool.requestedWithdrawals(
      accounts[0].address
    );
    console.log("withdrawalinfo", withdrawalinfo);

    const latestCycleIndex = await tokemakRewardHash.latestCycleIndex();
    console.log("latestCycleIndex", latestCycleIndex);

    // withdrawal allowed when the current cycle is after the minimum cycle for withdrawal
    if (withdrawalinfo[0] < latestCycleIndex) {
      await tokemakUniLPPool.withdraw("1");
    }
  });

  // TODO: this should ideally use a wallet set up better with real toke eth lp rewards from us
  // due to tokemak using offchain data to calculate rewards
  // https://docs.tokemak.xyz/toke/liquidity-direction/claiming-rewards-from-contract#example-payload
  xit("Allow collection of rewards", async () => {
    // get claimable hash from rewardshash contract
    const latestCycleIndex = await tokemakRewardHash.latestCycleIndex();
    const { latestClaimable, cycle } = await tokemakRewardHash.cycleHashes(
      latestCycleIndex
    );
    expect(latestClaimable).to.not.be.false;

    // use claimable hash to get recipient info from cloudflare
    const url = `https://cloudflare-ipfs.com/ipfs/${latestClaimable}/${IMPERSONATE_ACCT.toLowerCase()}.json`;

    const { data } = await axios.get(url);
    expect(data).to.not.be.false;

    // get amount claimable using recipient info
    // https://github.com/Tokemak/tokemak-smart-contracts-public/blob/main/contracts/interfaces/IRewards.sol#L20
    const rewardAmt = await tokemakRewards.getClaimableAmount(data.payload);
    expect(rewardAmt > 0).to.not.be.false;

    await tokemakRewards.claim(
      data.payload,
      data.signature.v,
      data.signature.r,
      data.signature.s
    );
  });
});
