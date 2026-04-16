/**
 * Injecte du yield dans MockAdapter sans déclencher de harvest.
 * Après exécution, totalAssets() du vault retourne une valeur plus haute —
 * le harvest peut être déclenché depuis la dapp.
 *
 * Usage :
 *   npx hardhat run scripts/simulateYield.ts --network localhost
 */

import { network } from "hardhat";
import { readFileSync } from "fs";
import { resolve } from "path";

const { ethers } = await network.connect({ network: "localhost", chainType: "l1" });

const YIELD_AMOUNT = ethers.parseUnits("500", 6);

const deployed: Record<string, string> = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../ignition/deployments/chain-31337/deployed_addresses.json"), "utf-8")
);
const addr = (k: string) => deployed[`HazelLocal#${k}`];

const mockAdapter = await ethers.getContractAt("MockAdapter", addr("MockAdapter"));
const hzStable    = await ethers.getContractAt("HzStable",    addr("HzStable"));

const balanceBefore = await mockAdapter.balanceInUSDC();
await mockAdapter.simulateYield(YIELD_AMOUNT);
const balanceAfter = await mockAdapter.balanceInUSDC();

console.log(`\nBalance adapter : ${ethers.formatUnits(balanceBefore, 6)} → ${ethers.formatUnits(balanceAfter, 6)} USDC`);
console.log(`totalAssets()   : ${ethers.formatUnits(await hzStable.totalAssets(), 6)} USDC`);
console.log("\nYield injecté — lance harvest() depuis la dapp pour distribuer les fees.");
