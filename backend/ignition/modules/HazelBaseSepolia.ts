import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const HazelBaseSepoliaModule = buildModule("HazelBaseSepolia", (m) => {
  const deployer = m.getAccount(0);
  const treasury = m.getParameter("treasury", deployer);
  const harvestInterval = m.getParameter("harvestInterval", 86400n);
  const feeRate = m.getParameter("feeRate", 1000n);
  const aUsdc = m.getParameter<string>("aUsdc");
  const aavePool = m.getParameter<string>("aavePool");

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
  m.call(hzStable, "setAdapter", [adapter]);
  m.call(insuranceFund, "setVault", [hzStable]);
  m.call(govStaking, "setHZL", [hzl]);
  m.call(govStaking, "setVaultRegistry", [vaultRegistry]);
  m.call(hzStable, "setGovStaking", [govStaking]);
  m.call(hzl, "setVaultRegistry", [vaultRegistry]);
  m.call(revenueDistributor, "addVault", [hzStable]);

  const queueVault = m.call(vaultRegistry, "queueVault", [hzStable]);
  m.call(vaultRegistry, "registerVault", [hzStable], { after: [queueVault] });

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
