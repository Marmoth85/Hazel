import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const INITIAL_DEPOSIT = 100_000_000n; // 100 USDC — Protocol-Owned Liquidity

const HazelLocalModule = buildModule("HazelLocal", (m) => {
  const deployer = m.getAccount(0);
  const harvestInterval = m.getParameter("harvestInterval", 86400n);
  const feeRate = m.getParameter("feeRate", 1000n);

  // 1. MockERC20 — USDC simulé (6 décimales)
  const usdc = m.contract("MockERC20", ["USD Coin", "USDC", 6]);

  // 2. InsuranceFund — vault câblé post-déploiement
  const insuranceFund = m.contract("InsuranceFund", [ZERO_ADDRESS]);

  // 3. RevenueDistributor
  const revenueDistributor = m.contract("RevenueDistributor", [
    deployer,
    insuranceFund,
  ]);

  // 4. HzStable — adapter câblé post-déploiement (pas de dépendance circulaire)
  const hzStable = m.contract("HzStable", [
    usdc,
    ZERO_ADDRESS,
    revenueDistributor,
    deployer,
    harvestInterval,
    feeRate,
  ]);

  // 5. MockAdapter
  const mockAdapter = m.contract("MockAdapter", [usdc, hzStable]);

  // 6. VaultRegistry — timelock = 0 (enregistrement immédiat en local)
  const vaultRegistry = m.contract("VaultRegistry", [0n]);

  // 7. GovStaking
  const govStaking = m.contract("GovStaking", []);

  // 8. Hazel (HZL)
  const hzl = m.contract("Hazel", [govStaking]);

  // --- wiring post-déploiement ---
  const setAdapter = m.call(hzStable, "setAdapter", [mockAdapter]);
  m.call(insuranceFund, "setVault", [hzStable]);
  m.call(govStaking, "setHZL", [hzl]);
  m.call(govStaking, "setVaultRegistry", [vaultRegistry]);
  const setGovStaking = m.call(hzStable, "setGovStaking", [govStaking]);
  m.call(hzl, "setVaultRegistry", [vaultRegistry]);
  m.call(revenueDistributor, "addVault", [hzStable]);

  const queueVault = m.call(vaultRegistry, "queueVault", [hzStable]);
  const registerVault = m.call(vaultRegistry, "registerVault", [hzStable], { after: [queueVault] });

  // --- Protocol-Owned Liquidity ---
  const mintPOL    = m.call(usdc, "mint", [deployer, INITIAL_DEPOSIT]);
  const approvePOL = m.call(usdc, "approve", [hzStable, INITIAL_DEPOSIT], { after: [mintPOL] });
  m.call(hzStable, "deposit", [INITIAL_DEPOSIT, deployer], {
    after: [approvePOL, setAdapter, setGovStaking, registerVault],
  });

  return {
    usdc,
    insuranceFund,
    revenueDistributor,
    hzStable,
    mockAdapter,
    vaultRegistry,
    govStaking,
    hzl,
  };
});

export default HazelLocalModule;
