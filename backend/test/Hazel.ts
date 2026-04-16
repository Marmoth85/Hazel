import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const USDC_DECIMAL= 6n;
const HARVEST_INTERVAL = 86_400n;
const FEE_RATE = 1_000n;
const DEPOSIT = 1_000n * 10n ** USDC_DECIMAL;

async function deployHZLStack() {
    const [owner, user, treasury, other] = await ethers.getSigners();

    const mockUSDC = await ethers.deployContract('MockERC20', ['USD Coin', 'USDC', USDC_DECIMAL]);
    const insuranceFund = await ethers.deployContract('InsuranceFund', [ethers.ZeroAddress]);
    const revenueDistributor = await ethers.deployContract('RevenueDistributor', [
        treasury.address, await insuranceFund.getAddress(),
    ]);
    const hzStable = await ethers.deployContract('HzStable', [
        await mockUSDC.getAddress(),
        ethers.ZeroAddress, // adapter set post-deployment
        await revenueDistributor.getAddress(),
        treasury.address,
        HARVEST_INTERVAL,
        FEE_RATE
    ]);
    const mockAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await hzStable.getAddress()]);
    const govStaking = await ethers.deployContract('GovStaking', []);
    const registry = await ethers.deployContract('VaultRegistry', [0n]);
    const hzl = await ethers.deployContract('Hazel', [await govStaking.getAddress()]);

    await govStaking.connect(owner).setVaultRegistry(await registry.getAddress());
    await registry.connect(owner).queueVault(await hzStable.getAddress());
    await registry.connect(owner).registerVault(await hzStable.getAddress());

    await hzStable.setAdapter(await mockAdapter.getAddress());
    await insuranceFund.setVault(await hzStable.getAddress());
    await revenueDistributor.addVault(await hzStable.getAddress());
    await govStaking.connect(owner).setHZL(await hzl.getAddress());
    await hzStable.setGovStaking(await govStaking.getAddress());
    await hzl.connect(owner).setVaultRegistry(await registry.getAddress());

    return { mockUSDC, mockAdapter, hzStable, govStaking, hzl, registry, owner, user, treasury, other };
}

async function deployHZLStackWithStake() {
    const ctx = await deployHZLStack();
    const { mockUSDC, hzStable, govStaking, user } = ctx;

    await mockUSDC.mint(user.address, DEPOSIT);
    await mockUSDC.connect(user).approve(await hzStable.getAddress(), DEPOSIT);
    await hzStable.connect(user).deposit(DEPOSIT, user.address);

    // Shares auto-staked on deposit — read from GovStaking, not balanceOf
    const lpShares = await govStaking.stakedAmountOf(user.address, await hzStable.getAddress());

    return { ...ctx, lpShares };
}

describe('Hazel tests', function() {

    describe('Deployment tests', function() {
        let hzl: any;
        let govStaking: any;

        this.beforeEach(async () => {
            ({ hzl, govStaking } = await networkHelpers.loadFixture(deployHZLStack));
        });

        it('Hazel Deployment should revert if govStaking address is zero', async function() {
            await expect(ethers.deployContract('Hazel', [ethers.ZeroAddress]))
                .to.be.revertedWithCustomError({ interface: (await ethers.getContractFactory('Hazel')).interface } as any, 'ZeroAddress');
        });

        it('Hazel should have correct name and symbol after deployment', async function() {
            expect(await hzl.name()).to.equal('Hazel Liquid Restaking');
            expect(await hzl.symbol()).to.equal('HZL');
        });

        it('Hazel should store the govStaking address', async function() {
            expect(await hzl.govStaking()).to.equal(await govStaking.getAddress());
        });

        it('Hazel should have zero supply at deployment', async function() {
            expect(await hzl.totalSupply()).to.equal(0n);
        });

        it('Hazel should have no vaults in pool', async function() {
            expect(await hzl.poolVaultCount()).to.equal(0n);
        });
    });

    describe('wrap tests', function() {
        let hzl: any;
        let hzStable: any;
        let govStaking: any;
        let user: any;
        let lpShares: bigint;

        this.beforeEach(async () => {
            ({ hzl, hzStable, govStaking, user, lpShares } = await networkHelpers.loadFixture(deployHZLStackWithStake));
        });

        it('Hazel wrap should revert if amount is zero', async function() {
            await expect(hzl.connect(user).wrap(await hzStable.getAddress(), 0n))
                .to.be.revertedWithCustomError(hzl, 'ZeroAmount');
        });

        it('Hazel wrap should revert if user has insufficient staked LP shares', async function() {
            await expect(hzl.connect(user).wrap(await hzStable.getAddress(), lpShares + 1n))
                .to.be.revertedWithCustomError(govStaking, 'InsufficientStaked');
        });

        it('Hazel wrap should mint HZL tokens to user on first wrap (1:1 ratio)', async function() {
            await hzl.connect(user).wrap(await hzStable.getAddress(), lpShares);
            expect(await hzl.balanceOf(user.address)).to.equal(lpShares);
        });

        it('Hazel wrap should increase pool balance for the vault', async function() {
            await hzl.connect(user).wrap(await hzStable.getAddress(), lpShares);
            expect(await hzl.pool(await hzStable.getAddress())).to.equal(lpShares);
        });

        it('Hazel wrap should register the vault in the pool on first wrap', async function() {
            await hzl.connect(user).wrap(await hzStable.getAddress(), lpShares);
            expect(await hzl.poolVaultCount()).to.equal(1n);
            expect(await hzl.poolVaults(0n)).to.equal(await hzStable.getAddress());
        });

        it('Hazel wrap should not register the same vault twice in pool', async function() {
            const HALF = lpShares / 2n;
            await hzl.connect(user).wrap(await hzStable.getAddress(), HALF);
            await hzl.connect(user).wrap(await hzStable.getAddress(), HALF);
            expect(await hzl.poolVaultCount()).to.equal(1n);
        });

        it('Hazel wrap should decrement stakedAmount in GovStaking after wrap', async function() {
            await hzl.connect(user).wrap(await hzStable.getAddress(), lpShares);
            const info = await govStaking.stakes(user.address, await hzStable.getAddress());
            expect(info.stakedAmount).to.equal(0n);
        });

        it('Hazel wrap should emit Wrapped event', async function() {
            await expect(hzl.connect(user).wrap(await hzStable.getAddress(), lpShares))
                .to.emit(hzl, 'Wrapped')
                .withArgs(user.address, await hzStable.getAddress(), lpShares, lpShares);
        });

        it('Should transfer LP shares from GovStaking to HZL contract', async function() {
            await hzl.connect(user).wrap(await hzStable.getAddress(), lpShares);
            expect(await hzStable.balanceOf(await hzl.getAddress())).to.equal(lpShares);
        });

        it('Hazel wrap should revert with EmptyPool when pool value rounds to zero', async function() {
            const { hzl: freshHzl, govStaking: gs, registry, owner, user: u } = await networkHelpers.loadFixture(deployHZLStack);
            const mockVault = await ethers.deployContract('MockVault', ['MV', 'MV']);
            await registry.connect(owner).queueVault(await mockVault.getAddress());
            await registry.connect(owner).registerVault(await mockVault.getAddress());
            await mockVault.mint(u.address, 2n);
            await mockVault.connect(u).approve(await gs.getAddress(), 2n);
            await gs.connect(u).stake(await mockVault.getAddress(), 2n);
            await freshHzl.connect(u).wrap(await mockVault.getAddress(), 1n);
            await expect(freshHzl.connect(u).wrap(await mockVault.getAddress(), 1n))
                .to.be.revertedWithCustomError(freshHzl, 'EmptyPool');
        });
    });

    describe('redeem tests', function() {
        let hzl: any;
        let hzStable: any;
        let user: any;
        let other: any;
        let lpShares: bigint;

        this.beforeEach(async () => {
            ({ hzl, hzStable, user, other, lpShares } = await networkHelpers.loadFixture(deployHZLStackWithStake));
            await hzl.connect(user).wrap(await hzStable.getAddress(), lpShares);
        });

        it('Hazel redeem should remove vault from pool when fully redeemed', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await hzl.connect(user).redeem(hzlBalance);
            expect(await hzl.pool(await hzStable.getAddress())).to.equal(0n);
            expect(await hzl.poolVaultCount()).to.equal(0n);
        });

        it('Hazel redeem should revert if amount is zero', async function() {
            await expect(hzl.connect(user).redeem(0n))
                .to.be.revertedWithCustomError(hzl, 'ZeroAmount');
        });

        it('Hazel redeem should revert if holder has insufficient HZL', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await expect(hzl.connect(user).redeem(hzlBalance + 1n))
                .to.be.revertedWithCustomError(hzl, 'ERC20InsufficientBalance');
        });

        it('Hazel redeem should burn HZL tokens on redeem', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await hzl.connect(user).redeem(hzlBalance);
            expect(await hzl.balanceOf(user.address)).to.equal(0n);
        });

        it('Hazel redeem should return LP shares pro-rata to user', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await hzl.connect(user).redeem(hzlBalance);
            expect(await hzStable.balanceOf(user.address)).to.equal(lpShares);
        });

        it('Hazel redeem should emit Redeemed event', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await expect(hzl.connect(user).redeem(hzlBalance))
                .to.emit(hzl, 'Redeemed')
                .withArgs(user.address, hzlBalance);
        });

        it('Hazel redeem should allow any HZL holder to redeem (not just original wrapper)', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await hzl.connect(user).transfer(other.address, hzlBalance);
            await hzl.connect(other).redeem(hzlBalance);
            expect(await hzStable.balanceOf(other.address)).to.equal(lpShares);
        });

        it('Hazel redeem should return partial LP shares on partial redeem', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            const HALF_HZL = hzlBalance / 2n;
            await hzl.connect(user).redeem(HALF_HZL);
            expect(await hzStable.balanceOf(user.address)).to.be.closeTo(lpShares / 2n, 1n);
        });

        it('Hazel redeem should skip vault when lpShare rounds to zero', async function() {
            const [owner, , , , dustUser] = await ethers.getSigners();
            const vault2 = await ethers.deployContract('MockVault', ['V2', 'V2']);
            const registry = await hzl.vaultRegistry();
            const vaultRegistry = await ethers.getContractAt('VaultRegistry', registry);
            await vaultRegistry.connect(owner).queueVault(await vault2.getAddress());
            await vaultRegistry.connect(owner).registerVault(await vault2.getAddress());

            // wrap 1_000 LP from vault2 -> pool[vault2]=1_000, ~1_000 HZL minted
            await vault2.mint(dustUser.address, 1_000n);
            const gs = await ethers.getContractAt('GovStaking', await hzl.govStaking());
            await vault2.connect(dustUser).approve(await gs.getAddress(), 1_000n);
            await gs.connect(dustUser).stake(await vault2.getAddress(), 1_000n);
            await hzl.connect(dustUser).wrap(await vault2.getAddress(), 1_000n);

            // redeem 2_000 HZL: vault2 lpShare = 1_000 * 2_000 / supply rounds to 0 -> skipped
            await hzl.connect(user).redeem(2_000n);
            expect(await hzl.pool(await vault2.getAddress())).to.equal(1_000n);
            expect(await vault2.balanceOf(user.address)).to.equal(0n);
        });
    });

    describe('unwrap tests', function() {
        let hzl: any;
        let hzStable: any;
        let govStaking: any;
        let user: any;
        let other: any;
        let lpShares: bigint;

        this.beforeEach(async () => {
            ({ hzl, hzStable, govStaking, user, other, lpShares } = await networkHelpers.loadFixture(deployHZLStackWithStake));
            // User wraps all auto-staked LP shares into HZL
            await hzl.connect(user).wrap(await hzStable.getAddress(), lpShares);
        });

        it('Hazel unwrap should remove vault from pool when fully unwrapped', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await hzl.connect(user).unwrap(hzlBalance);
            expect(await hzl.pool(await hzStable.getAddress())).to.equal(0n);
            expect(await hzl.poolVaultCount()).to.equal(0n);
        });

        it('Hazel unwrap should revert if amount is zero', async function() {
            await expect(hzl.connect(user).unwrap(0n))
                .to.be.revertedWithCustomError(hzl, 'ZeroAmount');
        });

        it('Hazel unwrap should revert if holder has insufficient HZL', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await expect(hzl.connect(user).unwrap(hzlBalance + 1n))
                .to.be.revertedWithCustomError(hzl, 'ERC20InsufficientBalance');
        });

        it('Hazel unwrap should burn HZL tokens on unwrap', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await hzl.connect(user).unwrap(hzlBalance);
            expect(await hzl.balanceOf(user.address)).to.equal(0n);
        });

        it('Hazel unwrap should restake LP shares directly into GovStaking (not to wallet)', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await hzl.connect(user).unwrap(hzlBalance);
            // LP shares go into GovStaking, not user wallet
            expect(await hzStable.balanceOf(user.address)).to.equal(0n);
            expect(await govStaking.stakedAmountOf(user.address, await hzStable.getAddress())).to.equal(lpShares);
        });

        it('Hazel unwrap should emit Unwrapped event', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            await expect(hzl.connect(user).unwrap(hzlBalance))
                .to.emit(hzl, 'Unwrapped')
                .withArgs(user.address, hzlBalance);
        });

        it('Hazel unwrap should allow any HZL holder to unwrap (not just original wrapper)', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            // Transfer HZL to other, who unwraps
            await hzl.connect(user).transfer(other.address, hzlBalance);
            await hzl.connect(other).unwrap(hzlBalance);
            expect(await govStaking.stakedAmountOf(other.address, await hzStable.getAddress())).to.equal(lpShares);
        });

        it('Hazel unwrap should return partial LP shares to GovStaking on partial unwrap', async function() {
            const hzlBalance = await hzl.balanceOf(user.address);
            const HALF_HZL = hzlBalance / 2n;
            await hzl.connect(user).unwrap(HALF_HZL);
            const staked = await govStaking.stakedAmountOf(user.address, await hzStable.getAddress());
            expect(staked).to.be.closeTo(lpShares / 2n, 1n);
        });

        it('Hazel unwrap should skip vault when lpShare rounds to zero', async function() {
            const [owner, , , , dustUser] = await ethers.getSigners();
            const vault2 = await ethers.deployContract('MockVault', ['V2', 'V2']);
            const vaultRegistry = await ethers.getContractAt('VaultRegistry', await hzl.vaultRegistry());
            await vaultRegistry.connect(owner).queueVault(await vault2.getAddress());
            await vaultRegistry.connect(owner).registerVault(await vault2.getAddress());

            // wrap 1_000 LP from vault2 -> pool[vault2]=1_000, ~1_000 HZL minted
            await vault2.mint(dustUser.address, 1_000n);
            const gs = await ethers.getContractAt('GovStaking', await hzl.govStaking());
            await vault2.connect(dustUser).approve(await gs.getAddress(), 1_000n);
            await gs.connect(dustUser).stake(await vault2.getAddress(), 1_000n);
            await hzl.connect(dustUser).wrap(await vault2.getAddress(), 1_000n);

            // unwrap 2_000 HZL: vault2 lpShare = 1_000 * 2_000 / supply rounds to 0 -> skipped
            await hzl.connect(user).unwrap(2_000n);
            expect(await hzl.pool(await vault2.getAddress())).to.equal(1_000n);
            expect(await gs.stakedAmountOf(user.address, await vault2.getAddress())).to.equal(0n);
        });
    });

    describe('setVaultRegistry tests', function() {
        let hzl: any;
        let owner: any;
        let other: any;
        let registry: any;

        this.beforeEach(async () => {
            ({ hzl, owner, other, registry } = await networkHelpers.loadFixture(deployHZLStack));
        });

        it('Hazel setVaultRegistry should revert if called by non-owner', async function() {
            await expect(hzl.connect(other).setVaultRegistry(other.address))
                .to.be.revertedWithCustomError(hzl, 'OwnableUnauthorizedAccount');
        });

        it('Hazel setVaultRegistry should revert if registry is already set', async function() {
            await expect(hzl.connect(owner).setVaultRegistry(await registry.getAddress()))
                .to.be.revertedWithCustomError(hzl, 'RegistryAlreadySet');
        });

        it('Hazel setVaultRegistry should revert if address is zero', async function() {
            const freshHzl = await ethers.deployContract('Hazel', [await (await ethers.deployContract('GovStaking', [])).getAddress()]);
            await expect(freshHzl.connect(owner).setVaultRegistry(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(freshHzl, 'ZeroAddress');
        });

        it('Hazel setVaultRegistry should store the vaultRegistry address', async function() {
            expect(await hzl.vaultRegistry()).to.equal(await registry.getAddress());
        });
    });

    describe('wrap VaultRegistry checks', function() {
        let hzl: any;
        let hzStable: any;
        let user: any;
        let lpShares: bigint;

        this.beforeEach(async () => {
            ({ hzl, hzStable, user, lpShares } = await networkHelpers.loadFixture(deployHZLStackWithStake));
        });

        it('Hazel wrap should revert if vaultRegistry is not set', async function() {
            const freshGs = await ethers.deployContract('GovStaking', []);
            const freshHzl = await ethers.deployContract('Hazel', [await freshGs.getAddress()]);
            await expect(freshHzl.connect(user).wrap(await hzStable.getAddress(), lpShares))
                .to.be.revertedWithCustomError(freshHzl, 'VaultRegistryNotSet');
        });

        it('Hazel wrap should revert if vault is not registered', async function() {
            const unregistered = ethers.Wallet.createRandom().address;
            await expect(hzl.connect(user).wrap(unregistered, lpShares))
                .to.be.revertedWithCustomError(hzl, 'UnauthorizedVault');
        });
    });
});
