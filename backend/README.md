# Hazel — Backend

Protocole DeFi à impact social.  
Les utilisateurs déposent des USDC dans un vault ERC-4626. Le yield généré est réparti entre le protocole, des associations socio-éducatives, un fonds d'assurance et les déposants (dilution résiduelle). Un token de liquid restaking (HZL) permet de débloquer la liquidité sans quitter entièrement sa position.

**Chain cible :** Arbitrum One  
**Licence :** BUSL-1.1

---

## Prérequis & installation

### Environnement

- Node.js ≥ 20
- npm ≥ 10

```bash
cd backend
npm install
```

### Variables d'environnement — Keystore Hardhat

Les clés privées et URLs sensibles sont gérées via le **keystore chiffré de Hardhat v3**, sans fichier `.env`. Le keystore chiffre les valeurs localement (`~/.hardhat/keystore`) avec un mot de passe demandé à chaque utilisation.

```bash
# Enregistrer une variable dans le keystore (invite un mot de passe de chiffrement)
npx hardhat keystore set EVM_TEST_PRIVATE_KEY
npx hardhat keystore set ARBITRUM_RPC_URL
npx hardhat keystore set BASE_SEPOLIA_RPC_URL
npx hardhat keystore set SEPOLIA_RPC_URL        # testnet Sepolia uniquement
```

> Ne jamais commiter de clé privée en clair. Le fichier `.env` n'est pas utilisé.

Variables requises selon le réseau :

| Variable | Local | Base Sepolia | Arbitrum |
|---|:---:|:---:|:---:|
| `EVM_TEST_PRIVATE_KEY` | — | ✓ | ✓ |
| `BASE_SEPOLIA_RPC_URL` | — | ✓ | — |
| `ARBITRUM_RPC_URL`     | — | — | ✓ |

---

## Déploiement

### Local (Hardhat node)

```bash
# Terminal 1 — démarrer le nœud local (chainId 31337, port 8545)
npx hardhat node

# Terminal 2 — déployer les contrats
npx hardhat ignition deploy ignition/modules/HazelLocal.ts --network localhost

# Approvisionner les comptes de test en USDC (10 000 USDC × 5 comptes)
npx hardhat run scripts/seed.ts --network localhost
```

Les adresses déployées sont affichées par le script de seed et sauvegardées dans :
`ignition/deployments/chain-31337/deployed_addresses.json`

Pour connecter MetaMask au nœud local :
- Réseau : `http://localhost:8545`, chainId `31337`
- Clé privée account #0 : `0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80`

### Base Sepolia

1. Renseigner l'adresse du déployeur comme treasury dans le fichier de paramètres :

```json
// ignition/parameters.base-sepolia.json
{
  "HazelBaseSepolia": {
    "treasury": "0xVOTRE_ADRESSE",
    "harvestInterval": 86400,
    "feeRate": 1000
  }
}
```

2. Déployer :

```bash
npx hardhat ignition deploy ignition/modules/HazelBaseSepolia.ts \
  --network baseSepolia \
  --parameters ignition/parameters.base-sepolia.json
```

### Scripts utilitaires (local uniquement)

```bash
# Simuler du yield dans MockAdapter — à exécuter après au moins un dépôt dans le vault
npx hardhat run scripts/simulateYield.ts --network localhost
```

---

## Tests

```bash
# Tous les tests
npx hardhat test

# Avec rapport de coverage
npx hardhat test --coverage
```

277 tests, tous passants. Coverage 100% sur tous les contrats de production (hors mocks).

---

## Architecture technique

### Contrats

| Contrat | Rôle |
|---|---|
| `HzStable.sol` | Vault ERC-4626 principal. Accepte USDC, délègue le yield à un `IAdapter`, auto-stake les shares dans `GovStaking` à chaque dépôt. |
| `AdapterAave.sol` | Implémentation `IAdapter` pour Aave V3. Détient les aUSDC. Swappable via `setAdapter()` sans redéployer le vault. |
| `RevenueDistributor.sol` | Reçoit les fee shares mintées au harvest. Les distribue vers treasury, associations et InsuranceFund selon des poids configurables en BPS. |
| `InsuranceFund.sol` | Accumule une fraction des fee shares comme réserve. Permet un `payout()` d'urgence pour compenser les utilisateurs lésés. |
| `GovStaking.sol` | Custody des LP shares. Calcule le voting power via un multiplicateur de tier (×1.0 à ×2.5) basé sur la durée de staking. |
| `Hazel.sol` | Token HZL de liquid restaking. Permet de wrapper des LP shares en HZL ou de les unwrapper pour restaurer le voting power. |
| `VaultRegistry.sol` | Whitelist des vaults autorisés avec timelock configurable (queue + register). |

### Flux de dépôt

```
User → approve(USDC, hzStable) → deposit(assets)
  └─ HzStable._deposit()
       ├─ safeTransferFrom(user → vault)
       ├─ adapter.deposit(assets)          ← USDC envoyé vers Aave
       ├─ _mint(address(this), shares)     ← shares mintées sur le vault
       └─ govStaking.stakeOnBehalf(user)   ← shares transférées au staking
```

Dans ce flux, les shares ne transitent jamais par le wallet de l'utilisateur.
`Hazel.redeem()` retourne les LP shares dans le wallet (suivi d'un `GovStaking.stake()` manuel), mais cette opération n'est pas exposée par la dApp — réservée aux interactions directes avec les contrats.

### Flux de retrait

```
User → withdraw(assets)
  └─ HzStable._withdraw()
       ├─ govStaking.unstakeOnBehalf(user) ← shares retournent au vault
       ├─ _burn(address(this), shares)
       ├─ adapter.withdraw(assets)         ← USDC récupéré depuis Aave
       └─ safeTransfer(USDC → user)
```

### Flux HZL — wrap / unwrap / redeem

```
User → wrap(vault, lpAmount)
  └─ Hazel.wrap()
       ├─ govStaking.withdrawStake(user)   ← LP shares quittent GovStaking → pool HZL
       └─ _mint(user, hzlAmount)           ← HZL mintés au ratio NAV

User → unwrap(hzlAmount)
  └─ Hazel.unwrap()
       ├─ _burn(user, hzlAmount)
       ├─ forceApprove(govStaking, lpShare)
       └─ govStaking.stakeOnBehalf(user)   ← LP shares restakées, voting power restauré

User → redeem(hzlAmount)          ← non exposé dans la dApp en V1 mais sera possible en V2 couplé à un zapper.
  └─ Hazel.redeem()
       ├─ _burn(user, hzlAmount)
       └─ safeTransfer(vault → user)       ← LP shares dans le wallet
            └─ user peut ensuite : govStaking.stake() pour restaker manuellement
```

`wrap` et `unwrap` sont les opérations standard exposées par la dApp. `redeem` est réservé aux interactions directes avec les contrats — l'utilisateur récupère ses LP shares mais perd son ancienneté de staking définitivement.

### Harvest

```
anyone → harvest()
  ├─ currentPrice = convertToAssets(1 share)
  ├─ si currentPrice <= highWaterMark → return silencieux (pas de fees)
  ├─ _mintFeeShares() → mint vers RevenueDistributor (dilution pure, pas de sortie de cash)
  └─ highWaterMark = currentPrice
```

### Modules Ignition

| Module | Réseau | Adapter | Timelock VaultRegistry |
|---|---|---|---|
| `HazelLocal.ts` | `localhost` | MockAdapter | 0 |
| `HazelBaseSepolia.ts` | `baseSepolia` | MockAdapter | 0 |
| `HazelArbitrum.ts` | `arbitrum` | AdapterAave | 48h |

---

## Sécurité

### Inflation attack et brûlures silencieuses (ERC-4626)

`HzStable` surcharge `_decimalsOffset()` pour retourner `3`, donnant aux shares une précision de 9 décimales contre 6 pour l'USDC. Ce mécanisme, combiné aux *virtual shares* d'OpenZeppelin, élimine deux classes d'attaques liées aux vaults ERC-4626 :

**Inflation attack** : sans offset, un attaquant peut déposer 1 wei, puis envoyer directement une grande quantité d'USDC au vault pour gonfler le prix par share. Le dépôt suivant d'un utilisateur légitime est arrondi à 0 shares, et l'attaquant récupère sa mise augmentée des fonds de la victime. Avec un offset de 3, les formules de conversion utilisent `totalShares + 10³` et `totalAssets + 1` comme dénominateurs virtuels — rendre l'attaque profitable exigerait une donation de l'ordre de `10³ × totalAssets`, ce qui la rend économiquement absurde.

**Brûlures silencieuses** : un transfert direct d'USDC vers le vault (hors `deposit()`) gonfle `totalAssets()` sans créer de shares. Sans offset, cela peut arrondir à 0 le résultat de `convertToShares()` pour de petits dépôts. L'offset de 3 réduit ce risque d'un facteur 1 000 : un dépôt de 1 USDC produit au minimum 10³ shares, rendant les pertes par arrondi négligeables.

### Reentrancy

`HzStable._deposit()` et `_withdraw()` suivent strictement le pattern CEI (Checks-Effects-Interactions) : les effets (mint/burn, mise à jour du staking) précèdent toutes les interactions externes (transferts ERC-20, appels adapter). Aucun callback externe ne peut ré-entrer dans un état intermédiaire.

### Approbations ERC-20 non standard

Toutes les approbations utilisent `SafeERC20.forceApprove()` (OpenZeppelin), évitant les conditions de course sur les tokens qui ne respectent pas strictement l'EIP-20. `revokeApprovals()` est disponible dans chaque adapter pour geler les interactions en urgence.

### Migration d'adapter

`setAdapter()` impose un ordre strict : `withdrawAll()` → `revokeApprovals()` → révoquer l'approval du vault → mettre à jour le pointeur → approuver le nouvel adapter → re-déployer les fonds. L'approval de l'ancien adapter est révoquée **après** le retrait complet, jamais avant.

### Dépendance circulaire au déploiement

`HzStable` accepte `adapter = address(0)` au constructeur. `totalAssets()` retourne 0 si aucun adapter n'est câblé, évitant tout revert silencieux pendant la fenêtre de déploiement. `setAdapter()` est le premier appel post-déploiement.

### Contrôle d'accès aux fonctions sensibles

- `stakeOnBehalf()` — vault ou HZL uniquement selon le flux.
- `unstakeOnBehalf()` — vault uniquement.
- `withdrawStake()` — HZL uniquement.
- `setGovStaking()` — one-time, immutable après le premier appel.
- `setHZL()` / `setVaultRegistry()` — one-time sur leurs contrats respectifs.

### High watermark

Les fees ne sont prélevées que si `currentPrice > highWaterMark`. Un yield négatif (perte) ne déclenche aucun revert : `yieldPerShare` est calculé en `int256` et `harvest()` retourne silencieusement si la valeur est ≤ 0.

### Whitelist des vaults

`GovStaking` et `HZL` vérifient `VaultRegistry.isRegistered()` avant toute interaction, protégeant contre l'injection de vaults arbitraires. L'ajout d'un vault passe par un timelock (48h en production).

### Tokens ERC-20 non conformes

`using SafeERC20 for IERC20` sur tous les contrats : `safeTransfer`, `safeTransferFrom`, `forceApprove` — aucun appel direct à `.transfer()` ou `.approve()`.
