# Hazel — Frontend

Interface du protocole Hazel V2, un protocole DeFi à impact social. Les utilisateurs déposent des USDC dans des vaults ERC-4626, reçoivent des LP shares (hzUSDC) en retour, et le yield généré est redistribué vers le treasury, des associations socio-éducatives et un fonds d'assurance.

---

## Stack & prérequis

| Outil | Rôle |
|---|---|
| Node.js ≥ 20 + npm ≥ 9 | Runtime et gestionnaire de paquets |
| Next.js (version récente) | Framework — voir `AGENTS.md` pour les breaking changes |
| wagmi v3 + viem | Interactions blockchain |
| Reown AppKit | Connexion wallet (pas RainbowKit) |
| Tailwind CSS | Styling — bibliothèque de composants UI dans `/components/ui/` |
| sonner | Toasts de transaction |
| Recharts | Graphiques |

---

## Variables d'environnement

Créer un `.env.local` à la racine du dossier `frontend/hazel/` :

```bash
NEXT_PUBLIC_PROJECT_ID=          # Reown AppKit project ID

NEXT_PUBLIC_FROM_BLOCK=          # Bloc de déploiement des contrats (pour getLogs)
NEXT_PUBLIC_ADDR_HZ_STABLE=
NEXT_PUBLIC_ADDR_REVENUE_DISTRIBUTOR=
NEXT_PUBLIC_ADDR_GOV_STAKING=
NEXT_PUBLIC_ADDR_HAZEL=
NEXT_PUBLIC_ADDR_INSURANCE_FUND=
NEXT_PUBLIC_ADDR_VAULT_REGISTRY=
NEXT_PUBLIC_ADDR_USDC=
```

Deux jeux d'adresses sont maintenus dans `.env.local` (commentés/décommentés selon le réseau cible) : Hardhat localhost et Base Sepolia.

> **Important** : Next.js remplace les `NEXT_PUBLIC_*` statiquement à la compilation. Toujours utiliser la forme littérale dans le code — jamais une clé dynamique. Après toute modification du `.env.local`, relancer avec `rm -rf .next && npm run dev`.

---

## Lancer le projet

```bash
npm install
npm run dev
```

Réseau prérequis :
- **Hardhat local** : `npx hardhat node` dans `/backend`, puis déployer avec `HazelLocal.ts`
- **Base Sepolia** : aucun prérequis local — les adresses doivent correspondre au déploiement actuel dans le `.env.local`

Réseaux supportés : Arbitrum One (42161), Base Sepolia (84532), Hardhat (31337). Un `NetworkGuard` bloque l'interface sur tout autre réseau.

---

## Architecture des dossiers

```
app/
  page.tsx          Landing page (hors layout sidebar)
  (routes)/         Route group — scope le layout sidebar sans contribuer aux URLs
    dashboard/
    vaults/
    deposit/
    withdraw/
    staking/
    wrap/
    impact/
    insurance/
    admin/
hooks/              Hooks React métier (données blockchain, calculs côté client)
lib/
  contracts.ts      Adresses des contrats + exports des ABIs
  abis/             JSON des ABIs générés par Hardhat
  format.ts         Utilitaires d'affichage (USDC, shares, BPS, countdown…)
  errors.ts         Extraction du message revert depuis une erreur wagmi
components/
  ui/               Button, Card, Input, Badge, StatItem, Spinner
  layout/           Header, Sidebar, Footer, NetworkGuard
```

---

## ABIs

Les JSON dans `lib/abis/` sont générés par Hardhat. Après tout changement de contrat :

```bash
# dans /backend
npx hardhat compile
```

Copier ensuite les fichiers concernés depuis `backend/artifacts/contracts/<Nom>.sol/<Nom>.json` vers `frontend/hazel/lib/abis/`.

---

## Pages

| Route | Description |
|---|---|
| `/` | Landing page avec stats live (TVL, part impact, distributions aux associations) et CTA vers la sélection de vault. |
| `/dashboard` | Vue personnalisée de l'utilisateur : position par vault, valeur USDC, voting power et tier de staking. N'affiche que les vaults où l'utilisateur a une position active. |
| `/vaults` | Sélection du vault avec APY et part d'impact affichés ; redirige vers `/deposit?vault=` ou `/withdraw?vault=` selon le paramètre `?action=`. |
| `/deposit` | Formulaire de dépôt USDC → LP shares hzUSDC (approve si nécessaire + deposit). Les shares sont auto-stakées dans GovStaking à la réception, elles n'apparaissent pas dans le wallet. |
| `/withdraw` | Retrait LP shares → USDC en mode `redeem` (défaut) ou `withdraw`. Le mode `redeem` est obligatoire pour les sorties complètes afin d'éviter les orphan shares dues aux arrondis ERC-4626. |
| `/staking` | Gestion du staking de LP shares par vault : stake depuis le wallet (approve + stake), unstake partiel ou total, affichage du tier d'ancienneté et du voting power. |
| `/wrap` | Wrapping de LP shares stakées en tokens HZL liquides (une transaction par vault) ; redeem (HZL → wallet) ou unwrap (HZL → restake direct). Affiche un avertissement explicite sur la perte d'ancienneté irréversible. |
| `/impact` | Tableau de bord de l'impact social : répartition des fees en donut (associations, assurance, treasury), liste des associations, shares en attente de distribution. |
| `/insurance` | Lecture seule — solde et historique des sorties du fonds d'assurance. |
| `/admin` | Accès restreint à l'adresse owner. Paramètres du vault (fee rate, harvest interval), répartition BPS des fees, déclenchement du harvest et de la distribution, gestion des associations, payout du fonds d'assurance. |

---

## Conventions techniques

### État local post-transaction

wagmi cache les données blockchain et ne garantit pas un refetch immédiat après invalidation. Pour les valeurs qui doivent refléter l'état exact juste après une transaction confirmée (listes, indices), on maintient un **état local React** mis à jour dès la confirmation, sans attendre le cache wagmi.

Exemple concret : la liste des associations est maintenue dans `localAssocs`. Après chaque `removeAssociation` confirmé, on applique côté client la même logique swap-and-pop que le contrat, en réindexant les entrées. Cela garantit que les indices passés au prochain appel contrat sont toujours cohérents avec l'état on-chain réel — même si wagmi n'a pas encore rafraîchi ses données.

### Protection contre les effets en double

`invalidateAll()` change de référence après chaque appel, ce qui peut re-déclencher un `useEffect` dont `isSuccess` est encore `true`. Pattern à respecter pour chaque action transactionnelle :

```ts
const handled = useRef(false)
useEffect(() => { handled.current = false }, [hash])
useEffect(() => {
  if (!isSuccess || handled.current) return
  handled.current = true
  // logique de succès une seule fois
}, [isSuccess, invalidateAll])
```

### Invalidation du cache

Après chaque transaction confirmée, appeler `invalidateAll()` depuis `useInvalidateAll()` plutôt que les `refetch()` individuels des hooks. Ce hook est wrappé avec `useCallback` pour stabiliser sa référence et éviter les effets parasites.
