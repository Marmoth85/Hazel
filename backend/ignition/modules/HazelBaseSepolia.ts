import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const INITIAL_DEPOSIT = 100_000_000n; // 100 USDC — Protocol-Owned Liquidity

const HazelBaseSepoliaModule = buildModule("HazelBaseSepolia", (m) => {
  const deployer = m.getAccount(0);
  const treasury = m.getParameter("treasury", deployer);
  const harvestInterval = m.getParameter("harvestInterval", 86400n);
  const feeRate = m.getParameter("feeRate", 1000n);
  const aUsdc = m.getParameter<string>("aUsdc");
  const aavePool = m.getParameter<string>("aavePool", "0x8bAB6d1b75f19e9eD9fCe8b9BD338844fF79aE27"); // Aave V3 Base Sepolia

  const usdc = m.contractAt("MockERC20", "0xba50Cd2A20f6DA35D788639E581bca8d0B5d4D5f"); // fake usdc from aave base sepolia faucet

  const insuranceFund = m.contract("InsuranceFund", [
    "0x0000000000000000000000000000000000000000",
  ]);

  const revenueDistributor = m.contract("RevenueDistributor", [
    treasury,
    insuranceFund,
  ]);

  const hzStable = m.contract("HzStable", [
    usdc,
    "0x0000000000000000000000000000000000000000",
    revenueDistributor,
    treasury,
    harvestInterval,
    feeRate,
  ]);

  const adapter = m.contract("AdapterAave", [hzStable, usdc, aUsdc, aavePool]);

  const vaultRegistry = m.contract("VaultRegistry", [0n]);

  const govStaking = m.contract("GovStaking", []);

  const hzl = m.contract("Hazel", [govStaking]);

  // --- wiring ---
  const setAdapter = m.call(hzStable, "setAdapter", [adapter]);
  m.call(insuranceFund, "setVault", [hzStable]);
  m.call(govStaking, "setHZL", [hzl]);
  m.call(govStaking, "setVaultRegistry", [vaultRegistry]);
  const setGovStaking = m.call(hzStable, "setGovStaking", [govStaking]);
  m.call(hzl, "setVaultRegistry", [vaultRegistry]);
  m.call(revenueDistributor, "addVault", [hzStable]);

  const queueVault = m.call(vaultRegistry, "queueVault", [hzStable]);
  const registerVault = m.call(vaultRegistry, "registerVault", [hzStable], { after: [queueVault] });

  // --- Protocol-Owned Liquidity ---
  // Anchors PPS at 1.0 from genesis so the vault is never empty.
  const approvePOL = m.call(usdc, "approve", [hzStable, INITIAL_DEPOSIT]);
  m.call(hzStable, "deposit", [INITIAL_DEPOSIT, treasury], {
    after: [approvePOL, setAdapter, setGovStaking, registerVault],
  });

  return {
    usdc,
    insuranceFund,
    revenueDistributor,
    hzStable,
    adapter,
    vaultRegistry,
    govStaking,
    hzl,
  };
});

export default HazelBaseSepoliaModule;
