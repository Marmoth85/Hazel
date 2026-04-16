/**
 * Mint 10 000 USDC aux 5 premiers comptes Hardhat.
 *
 * Usage :
 *   npx hardhat run scripts/seed.ts --network localhost
 */

import { network } from "hardhat";
import { readFileSync } from "fs";
import { resolve } from "path";

const { ethers } = await network.connect({ network: "localhost", chainType: "l1" });

const USDC_AMOUNT = ethers.parseUnits("10000", 6);

const deployed: Record<string, string> = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "../ignition/deployments/chain-31337/deployed_addresses.json"), "utf-8")
);
const addr = (k: string) => deployed[`HazelLocal#${k}`];

const usdc = await ethers.getContractAt("MockERC20", addr("MockERC20"));
const signers = await ethers.getSigners();

console.log("\n── Mint USDC ──────────────────────────────────────────────");
for (const signer of signers.slice(0, 5)) {
  await usdc.mint(signer.address, USDC_AMOUNT);
  console.log(`  ${signer.address}  +${ethers.formatUnits(USDC_AMOUNT, 6)} USDC`);
}

console.log("\n── Adresses déployées ─────────────────────────────────────");
const keys = ["MockERC20", "HzStable", "MockAdapter", "GovStaking", "Hazel", "VaultRegistry", "InsuranceFund", "RevenueDistributor"];
for (const key of keys) {
  console.log(`  ${key.padEnd(22)} ${addr(key)}`);
}
