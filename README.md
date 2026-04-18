# Hazel

Protocole DeFi à impact social — certification RS6515.

Les utilisateurs déposent des USDC dans des vaults ERC-4626. Le yield généré est réparti entre des associations socio-éducatives, un fonds d'assurance et le treasury. Les déposants reçoivent des LP shares (hzUSDC) auto-stakées dans le contrat de gouvernance, leur conférant un voting power croissant avec l'ancienneté.

---

## Architecture

```
USDC
 └─► HzStable (ERC-4626)
       ├─ AdapterAave          Délégation du yield vers Aave V3
       ├─ GovStaking           Staking des LP shares + tiers d'ancienneté
       ├─ RevenueDistributor   Répartition des fees (associations / insurance / treasury)
       ├─ InsuranceFund        Fonds de sécurité
       ├─ HZL (ERC-20)         Token liquide issu du wrapping de shares stakées
       └─ VaultRegistry        Registre des vaults
```

---

## Contrats déployés

| Contrat | Rôle | Base Sepolia |
|---|---|---|
| HzStable | Vault ERC-4626 USDC | `0xEaE5813a44EF3F51840978e847154C2F61b82aCA` |
| GovStaking | Staking + voting power | `0xEa3fDcD6B02656429C49C0352c3f1bA3A5522bE7` |
| RevenueDistributor | Distribution du yield | `0x337b4492E88eC89d40CaCff4E1a1c43B7C76d463` |
| InsuranceFund | Fonds d'assurance | `0x7B620d07FA78B4ea878985616fE9424cb9Da5A4D` |
| VaultRegistry | Registre des vaults | `0x6473D01723172a745c568437cD0D51a0AD3d0f9B` |
| HZL (Hazel) | Token liquide wrappé | `0xe7A8b3B1E0b021aA8F2280bEB7e51f1e195929ce` |
| AdapterAave | Intégration Aave V3 | `0x1e7588C0e8A10db5D506b045ECDA097fEf91Ea92` |

Réseau cible : **Base Sepolia** (chainId 84532). L'interface supporte également Hardhat localhost (31337) et Arbitrum One (42161).

---

## Stack

| Couche | Outils |
|---|---|
| Smart contracts | Solidity 0.8.32, OpenZeppelin ^5.0, Hardhat v3 |
| Déploiement | Hardhat Ignition |
| Frontend | Next.js (App Router), wagmi v3 + viem, TailwindCSS |
| Wallet | Reown AppKit |
| Licence | BUSL-1.1 |

---

## Lancer le projet

### Backend

Voir [`backend/README.md`](backend/README.md) pour les détails complets.

```bash
cd backend
npm install

# Réseau local
npx hardhat node
npx hardhat ignition deploy ignition/modules/HazelLocal.ts --network localhost

# Tests
npx hardhat test
```

### Frontend

Voir [`frontend/hazel/README.md`](frontend/hazel/README.md) pour les détails complets.

```bash
cd frontend/hazel
npm install
npm run dev
```

Configurer le fichier `.env.local` avec les adresses des contrats et le project ID Reown avant de lancer.

---

## Redéploiement Base Sepolia

```bash
cd backend
npx hardhat ignition deploy ignition/modules/HazelBaseSepolia.ts --network baseSepolia --parameters ignition/parameters.base-sepolia.json --reset
```

Mettre à jour le `.env.local` du frontend avec les nouvelles adresses depuis `deployed_addresses.json`, puis relancer avec `rm -rf .next && npm run dev`.
