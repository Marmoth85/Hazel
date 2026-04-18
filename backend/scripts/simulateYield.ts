/**
 * Injecte du yield dans MockAdapter.
 * Si highWaterMark == 0 (premier run post-déploiement), déclenche un harvest
 * de bootstrap pour l'initialiser, puis injecte le yield — le prochain harvest
 * depuis la dapp minttera réellement les fees.
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

const hwm: bigint = await hzStable.highWaterMark();
if (hwm === 0n) {
  console.log("\n── Bootstrap highWaterMark ─────────────────────────────────");
  console.log("  highWaterMark == 0 → harvest() de bootstrap…");
  const tx = await hzStable.harvest();
  await tx.wait();
  console.log(`  highWaterMark initialisé à : ${ethers.formatUnits(await hzStable.highWaterMark(), 6)} USDC/share`);
}

const ppsBefore     = await hzStable.convertToAssets(ethers.parseUnits("1", 9));
const balanceBefore = await mockAdapter.balanceInUSDC();

await mockAdapter.simulateYield(YIELD_AMOUNT);

const ppsAfter     = await hzStable.convertToAssets(ethers.parseUnits("1", 9));
const balanceAfter = await mockAdapter.balanceInUSDC();

console.log(`\n── Yield injecté ───────────────────────────────────────────`);
console.log(`  Balance adapter : ${ethers.formatUnits(balanceBefore, 6)} → ${ethers.formatUnits(balanceAfter, 6)} USDC`);
console.log(`  PPS             : ${ethers.formatUnits(ppsBefore, 6)} → ${ethers.formatUnits(ppsAfter, 6)} USDC/share`);
console.log(`  totalAssets()   : ${ethers.formatUnits(await hzStable.totalAssets(), 6)} USDC`);
console.log("\n  Lance harvest() depuis la dapp pour distribuer les fees.");
console.log("  Le PPS baissera légèrement (fees prélevées) puis se stabilisera au-dessus du HWM précédent.");
