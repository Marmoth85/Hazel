/**
 * Avance le temps Hardhat de 30 jours et mine un bloc.
 *
 * Usage :
 *   npx hardhat run scripts/advance-time.ts --network localhost
 */

import { network } from "hardhat";

const { ethers } = await network.connect({ network: "localhost", chainType: "l1" });

const DAYS = 30;
const SECONDS = DAYS * 24 * 60 * 60;

const before = await ethers.provider.getBlock("latest");
console.log(`\n── Avant ──────────────────────────────────────────────────`);
console.log(`  Bloc       ${before!.number}`);
console.log(`  Timestamp  ${new Date(before!.timestamp * 1000).toISOString()}`);

await ethers.provider.send("evm_increaseTime", [SECONDS]);
await ethers.provider.send("evm_mine", []);

const after = await ethers.provider.getBlock("latest");
console.log(`\n── Après (+${DAYS} jours) ──────────────────────────────────`);
console.log(`  Bloc       ${after!.number}`);
console.log(`  Timestamp  ${new Date(after!.timestamp * 1000).toISOString()}`);
console.log();
