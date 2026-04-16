import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const STAKE_AMOUNT = 500n * 10n ** 9n; // 500 hzUSDC shares

async function deployGovStaking() {
    const [owner, user, hzlEOA, other] = await ethers.getSigners();

    const lpToken = await ethers.deployContract('MockERC20', ['HazelStable', 'hzUSDC', 9n]);
    const registry = await ethers.deployContract('VaultRegistry', [0n]);
    const govStaking = await ethers.deployContract('GovStaking', []);

    await govStaking.connect(owner).setVaultRegistry(await registry.getAddress());
    await registry.connect(owner).queueVault(await lpToken.getAddress());
    await registry.connect(owner).registerVault(await lpToken.getAddress());

    return { lpToken, registry, govStaking, owner, user, hzlEOA, other };
}

async function deployGovStakingWithStake() {
    const ctx = await deployGovStaking();
    const { lpToken, govStaking, user } = ctx;

    await lpToken.mint(user.address, STAKE_AMOUNT);
    await lpToken.connect(user).approve(await govStaking.getAddress(), STAKE_AMOUNT);
    await govStaking.connect(user).stake(await lpToken.getAddress(), STAKE_AMOUNT);

    return ctx;
}

describe('GovStaking tests', function() {

    describe('Deployment tests', function() {
        let govStaking: any;
        let registry: any;

        this.beforeEach(async () => {
            ({ govStaking, registry } = await networkHelpers.loadFixture(deployGovStaking));
        });

        it('Contract should be deployed with no HZL address set', async function() {
            expect(await govStaking.hzl()).to.equal(ethers.ZeroAddress);
        });

    });

    describe('setHZL tests', function() {
        let govStaking: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ govStaking, owner, other } = await networkHelpers.loadFixture(deployGovStaking));
        });

        it('setHZL should revert if called by non-owner', async function() {
            await expect(govStaking.connect(other).setHZL(other.address))
                .to.be.revertedWithCustomError(govStaking, 'OwnableUnauthorizedAccount');
        });

        it('setHZL should revert if address is zero', async function() {
            await expect(govStaking.connect(owner).setHZL(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(govStaking, 'ZeroAddress');
        });

        it('setHZL should update the HZL address', async function() {
            await govStaking.connect(owner).setHZL(other.address);
            expect(await govStaking.hzl()).to.equal(other.address);
        });

        it('setHZL should revert if HZL is already set', async function() {
            await govStaking.connect(owner).setHZL(other.address);
            await expect(govStaking.connect(owner).setHZL(other.address))
                .to.be.revertedWithCustomError(govStaking, 'HZLAlreadySet');
        });
    });

    describe('setVaultRegistry tests', function() {
        let govStaking: any;
        let registry: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ govStaking, registry, owner, other } = await networkHelpers.loadFixture(deployGovStaking));
        });

        it('setVaultRegistry should revert if called by non-owner', async function() {
            await expect(govStaking.connect(other).setVaultRegistry(await registry.getAddress()))
                .to.be.revertedWithCustomError(govStaking, 'OwnableUnauthorizedAccount');
        });

        it('setVaultRegistry should revert if address is zero', async function() {
            const fresh = await ethers.deployContract('GovStaking', []);
            await expect(fresh.connect(owner).setVaultRegistry(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(fresh, 'ZeroAddress');
        });

        it('setVaultRegistry should update the vaultRegistry address', async function() {
            const newGovStaking = await ethers.deployContract('GovStaking', []);
            const newRegistry   = await ethers.deployContract('VaultRegistry', [0n]);
            await newGovStaking.connect(owner).setVaultRegistry(await newRegistry.getAddress());
            expect(await newGovStaking.vaultRegistry()).to.equal(await newRegistry.getAddress());
        });

        it('setVaultRegistry should revert if registry is already set', async function() {
            await expect(govStaking.connect(owner).setVaultRegistry(await registry.getAddress()))
                .to.be.revertedWithCustomError(govStaking, 'RegistryAlreadySet');
        });
    });

    describe('stake tests', function() {
        let govStaking: any;
        let lpToken: any;
        let user: any;
        let other: any;

        this.beforeEach(async () => {
            ({ govStaking, lpToken, user, other } = await networkHelpers.loadFixture(deployGovStaking));
        });

        it('stake should revert if vaultRegistry is not set', async function() {
            const freshGs = await ethers.deployContract('GovStaking', []);
            await expect(freshGs.connect(user).stake(await lpToken.getAddress(), STAKE_AMOUNT))
                .to.be.revertedWithCustomError(freshGs, 'VaultRegistryNotSet');
        });

        it('stake should revert if vault is not registered', async function() {
            const fakeVault = other.address;
            await expect(govStaking.connect(user).stake(fakeVault, STAKE_AMOUNT))
                .to.be.revertedWithCustomError(govStaking, 'UnauthorizedVault');
        });

        it('stake should revert if amount is zero', async function() {
            await expect(govStaking.connect(user).stake(await lpToken.getAddress(), 0n))
                .to.be.revertedWithCustomError(govStaking, 'ZeroAmount');
        });

        it('stake should revert if user has no LP tokens', async function() {
            await lpToken.connect(other).approve(await govStaking.getAddress(), STAKE_AMOUNT);
            await expect(govStaking.connect(other).stake(await lpToken.getAddress(), STAKE_AMOUNT))
                .to.be.revertedWithCustomError(lpToken, 'ERC20InsufficientBalance');
        });

        it('stake should revert if user has not approved govStaking', async function() {
            await lpToken.mint(user.address, STAKE_AMOUNT);
            await expect(govStaking.connect(user).stake(await lpToken.getAddress(), STAKE_AMOUNT))
                .to.be.revertedWithCustomError(lpToken, 'ERC20InsufficientAllowance');
        });

        it('stake should transfer LP tokens from user to govStaking', async function() {
            await lpToken.mint(user.address, STAKE_AMOUNT);
            await lpToken.connect(user).approve(await govStaking.getAddress(), STAKE_AMOUNT);
            await govStaking.connect(user).stake(await lpToken.getAddress(), STAKE_AMOUNT);
            expect(await lpToken.balanceOf(await govStaking.getAddress())).to.equal(STAKE_AMOUNT);
        });

        it('stake should record correct stakedAmount', async function() {
            await lpToken.mint(user.address, STAKE_AMOUNT);
            await lpToken.connect(user).approve(await govStaking.getAddress(), STAKE_AMOUNT);
            await govStaking.connect(user).stake(await lpToken.getAddress(), STAKE_AMOUNT);
            const info = await govStaking.stakes(user.address, await lpToken.getAddress());
            expect(info.stakedAmount).to.equal(STAKE_AMOUNT);
        });

        it('stake should set weightedTimestamp to the current block timestamp', async function() {
            await lpToken.mint(user.address, STAKE_AMOUNT);
            await lpToken.connect(user).approve(await govStaking.getAddress(), STAKE_AMOUNT);
            await govStaking.connect(user).stake(await lpToken.getAddress(), STAKE_AMOUNT);
            const block = await ethers.provider.getBlock('latest');
            const info  = await govStaking.stakes(user.address, await lpToken.getAddress());
            expect(info.weightedTimestamp).to.equal(BigInt(block!.timestamp));
        });

        it('stake should emit Staked event', async function() {
            await lpToken.mint(user.address, STAKE_AMOUNT);
            await lpToken.connect(user).approve(await govStaking.getAddress(), STAKE_AMOUNT);
            await expect(govStaking.connect(user).stake(await lpToken.getAddress(), STAKE_AMOUNT))
                .to.emit(govStaking, 'Staked')
                .withArgs(user.address, await lpToken.getAddress(), STAKE_AMOUNT);
        });

        it('stake should accumulate stakedAmount on second stake', async function() {
            const SECOND = 200n * 10n ** 9n;
            await lpToken.mint(user.address, STAKE_AMOUNT + SECOND);
            await lpToken.connect(user).approve(await govStaking.getAddress(), STAKE_AMOUNT + SECOND);
            await govStaking.connect(user).stake(await lpToken.getAddress(), STAKE_AMOUNT);
            await govStaking.connect(user).stake(await lpToken.getAddress(), SECOND);
            const info = await govStaking.stakes(user.address, await lpToken.getAddress());
            expect(info.stakedAmount).to.equal(STAKE_AMOUNT + SECOND);
        });
    });

    describe('unstake tests', function() {
        let govStaking: any;
        let lpToken: any;
        let user: any;

        this.beforeEach(async () => {
            ({ govStaking, lpToken, user } = await networkHelpers.loadFixture(deployGovStakingWithStake));
        });

        it('unstake should revert if amount is zero', async function() {
            await expect(govStaking.connect(user).unstake(await lpToken.getAddress(), 0n))
                .to.be.revertedWithCustomError(govStaking, 'InvalidAmount');
        });

        it('unstake should revert if amount exceeds staked balance', async function() {
            await expect(govStaking.connect(user).unstake(await lpToken.getAddress(), STAKE_AMOUNT + 1n))
                .to.be.revertedWithCustomError(govStaking, 'InvalidAmount');
        });

        it('unstake should return LP tokens to user', async function() {
            await govStaking.connect(user).unstake(await lpToken.getAddress(), STAKE_AMOUNT);
            expect(await lpToken.balanceOf(user.address)).to.equal(STAKE_AMOUNT);
        });

        it('unstake should decrease stakedAmount', async function() {
            const PARTIAL = STAKE_AMOUNT / 2n;
            await govStaking.connect(user).unstake(await lpToken.getAddress(), PARTIAL);
            const info = await govStaking.stakes(user.address, await lpToken.getAddress());
            expect(info.stakedAmount).to.equal(STAKE_AMOUNT - PARTIAL);
        });

        it('unstake should emit Unstaked event', async function() {
            await expect(govStaking.connect(user).unstake(await lpToken.getAddress(), STAKE_AMOUNT))
                .to.emit(govStaking, 'Unstaked')
                .withArgs(user.address, await lpToken.getAddress(), STAKE_AMOUNT);
        });
    });

    describe('stakeOnBehalf tests', function() {
        let govStaking: any;
        let lpToken: any;
        let owner: any;
        let user: any;
        let hzlEOA: any;
        let other: any;

        this.beforeEach(async () => {
            ({ govStaking, lpToken, owner, user, hzlEOA, other } = await networkHelpers.loadFixture(deployGovStaking));
            await govStaking.connect(owner).setHZL(hzlEOA.address);
        });

        it('stakeOnBehalf should revert if vaultRegistry is not set', async function() {
            const freshGs = await ethers.deployContract('GovStaking', []);
            await freshGs.connect(owner).setHZL(hzlEOA.address);
            await expect(freshGs.connect(hzlEOA).stakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT))
                .to.be.revertedWithCustomError(freshGs, 'VaultRegistryNotSet');
        });

        it('stakeOnBehalf should revert if caller is not vault or HZL', async function() {
            await lpToken.mint(other.address, STAKE_AMOUNT);
            await lpToken.connect(other).approve(await govStaking.getAddress(), STAKE_AMOUNT);
            await expect(govStaking.connect(other).stakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT))
                .to.be.revertedWithCustomError(govStaking, 'Unauthorized');
        });

        it('stakeOnBehalf should revert if vault is not registered', async function() {
            const fakeVault = other.address;
            await expect(govStaking.connect(hzlEOA).stakeOnBehalf(user.address, fakeVault, STAKE_AMOUNT))
                .to.be.revertedWithCustomError(govStaking, 'UnauthorizedVault');
        });

        it('stakeOnBehalf should revert if amount is zero', async function() {
            await expect(govStaking.connect(hzlEOA).stakeOnBehalf(user.address, await lpToken.getAddress(), 0n))
                .to.be.revertedWithCustomError(govStaking, 'ZeroAmount');
        });

        it('stakeOnBehalf should allow HZL contract to stakeOnBehalf', async function() {
            await lpToken.mint(hzlEOA.address, STAKE_AMOUNT);
            await lpToken.connect(hzlEOA).approve(await govStaking.getAddress(), STAKE_AMOUNT);
            await govStaking.connect(hzlEOA).stakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT);
            expect(await govStaking.stakedAmountOf(user.address, await lpToken.getAddress())).to.equal(STAKE_AMOUNT);
        });

        it('stakeOnBehalf should emit Staked event for recipient', async function() {
            await lpToken.mint(hzlEOA.address, STAKE_AMOUNT);
            await lpToken.connect(hzlEOA).approve(await govStaking.getAddress(), STAKE_AMOUNT);
            await expect(govStaking.connect(hzlEOA).stakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT))
                .to.emit(govStaking, 'Staked')
                .withArgs(user.address, await lpToken.getAddress(), STAKE_AMOUNT);
        });

        it('stakeOnBehalf should update weightedTimestamp correctly', async function() {
            await lpToken.mint(hzlEOA.address, STAKE_AMOUNT);
            await lpToken.connect(hzlEOA).approve(await govStaking.getAddress(), STAKE_AMOUNT);
            await govStaking.connect(hzlEOA).stakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT);
            const block = await ethers.provider.getBlock('latest');
            const info  = await govStaking.stakes(user.address, await lpToken.getAddress());
            expect(info.weightedTimestamp).to.equal(BigInt(block!.timestamp));
        });
    });

    describe('unstakeOnBehalf', function() {
        let govStaking: any;
        let lpToken: any;
        let owner: any;
        let user: any;
        let hzlEOA: any;
        let other: any;

        this.beforeEach(async () => {
            ({ govStaking, lpToken, owner, user, hzlEOA, other } = await networkHelpers.loadFixture(deployGovStakingWithStake));
            await govStaking.connect(owner).setHZL(hzlEOA.address);
        });

        it('unstakeOnBehalf should revert if caller is not the vault', async function() {
            await expect(govStaking.connect(other).unstakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT))
                .to.be.revertedWithCustomError(govStaking, 'OnlyVault');
        });

        it('unstakeOnBehalf should revert if caller is HZL (not vault)', async function() {
            await expect(govStaking.connect(hzlEOA).unstakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT))
                .to.be.revertedWithCustomError(govStaking, 'OnlyVault');
        });

        it('unstakeOnBehalf should revert if amount exceeds staked balance', async function() {
            // simulate "redeem/withdraw" from frontend which leads to unstakeOnBehalf calls from the vault (lpToken contract)
            await ethers.provider.send('hardhat_impersonateAccount', [await lpToken.getAddress()]);
            await ethers.provider.send('hardhat_setBalance', [await lpToken.getAddress(), '0x' + (10n ** 18n).toString(16)]);
            const vaultSigner = await ethers.getSigner(await lpToken.getAddress());

            await expect(govStaking.connect(vaultSigner).unstakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT + 1n))
                .to.be.revertedWithCustomError(govStaking, 'InsufficientStaked');
            await ethers.provider.send('hardhat_stopImpersonatingAccount', [await lpToken.getAddress()]);
        });

        it('unstakeOnBehalf should decrement stakedAmount and return shares to vault', async function() {
            // simulate "redeem/withdraw" from frontend which leads to unstakeOnBehalf calls from the vault (lpToken contract)
            await ethers.provider.send('hardhat_impersonateAccount', [await lpToken.getAddress()]);
            await ethers.provider.send('hardhat_setBalance', [await lpToken.getAddress(), '0x' + (10n ** 18n).toString(16)]);
            const vaultSigner = await ethers.getSigner(await lpToken.getAddress());

            await govStaking.connect(vaultSigner).unstakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT);
            const info = await govStaking.stakes(user.address, await lpToken.getAddress());
            expect(info.stakedAmount).to.equal(0n);
            // Shares returned to vault (lpToken contract itself)
            expect(await lpToken.balanceOf(await lpToken.getAddress())).to.equal(STAKE_AMOUNT);
            await ethers.provider.send('hardhat_stopImpersonatingAccount', [await lpToken.getAddress()]);
        });

        it('unstakeOnBehalf should emit Unstaked event', async function() {
            await ethers.provider.send('hardhat_impersonateAccount', [await lpToken.getAddress()]);
            await ethers.provider.send('hardhat_setBalance', [await lpToken.getAddress(), '0x' + (10n ** 18n).toString(16)]);
            const vaultSigner = await ethers.getSigner(await lpToken.getAddress());
            await expect(govStaking.connect(vaultSigner).unstakeOnBehalf(user.address, await lpToken.getAddress(), STAKE_AMOUNT))
                .to.emit(govStaking, 'Unstaked')
                .withArgs(user.address, await lpToken.getAddress(), STAKE_AMOUNT);
            await ethers.provider.send('hardhat_stopImpersonatingAccount', [await lpToken.getAddress()]);
        });
    });

    describe('stakedAmountOf tests', function() {
        let govStaking: any;
        let lpToken: any;
        let user: any;
        let other: any;

        this.beforeEach(async () => {
            ({ govStaking, lpToken, user, other } = await networkHelpers.loadFixture(deployGovStakingWithStake));
        });

        it('stakedAmountOf should return the staked amount for a user and vault', async function() {
            expect(await govStaking.stakedAmountOf(user.address, await lpToken.getAddress())).to.equal(STAKE_AMOUNT);
        });

        it('stakedAmountOf should return 0 for a user with no stake', async function() {
            expect(await govStaking.stakedAmountOf(other.address, await lpToken.getAddress())).to.equal(0n);
        });

        it('stakedAmountOf should reflect partial unstake', async function() {
            const PARTIAL = STAKE_AMOUNT / 4n;
            await govStaking.connect(user).unstake(await lpToken.getAddress(), PARTIAL);
            expect(await govStaking.stakedAmountOf(user.address, await lpToken.getAddress())).to.equal(STAKE_AMOUNT - PARTIAL);
        });
    });

    describe('withdrawStake tests', function() {
        let govStaking: any;
        let lpToken: any;
        let owner: any;
        let user: any;
        let hzlEOA: any;
        let other: any;

        this.beforeEach(async () => {
            ({ govStaking, lpToken, owner, user, hzlEOA, other } = await networkHelpers.loadFixture(deployGovStakingWithStake));
            // Use hzlEOA as a mock HZL contract for access control tests
            await govStaking.connect(owner).setHZL(hzlEOA.address);
        });

        it('withdrawStake should revert if caller is not the HZL contract', async function() {
            await expect(govStaking.connect(other).withdrawStake(user.address, await lpToken.getAddress(), 100n))
                .to.be.revertedWithCustomError(govStaking, 'OnlyHZL');
        });

        it('withdrawStake should revert if amount exceeds staked balance', async function() {
            await expect(govStaking.connect(hzlEOA).withdrawStake(user.address, await lpToken.getAddress(), STAKE_AMOUNT + 1n))
                .to.be.revertedWithCustomError(govStaking, 'InsufficientStaked');
        });

        it('withdrawStake should decrease stakedAmount after withdrawStake', async function() {
            const WITHDRAW = STAKE_AMOUNT / 2n;
            await govStaking.connect(hzlEOA).withdrawStake(user.address, await lpToken.getAddress(), WITHDRAW);
            const info = await govStaking.stakes(user.address, await lpToken.getAddress());
            expect(info.stakedAmount).to.equal(STAKE_AMOUNT - WITHDRAW);
        });

        it('withdrawStake should transfer LP tokens to HZL contract', async function() {
            await govStaking.connect(hzlEOA).withdrawStake(user.address, await lpToken.getAddress(), STAKE_AMOUNT);
            expect(await lpToken.balanceOf(hzlEOA.address)).to.equal(STAKE_AMOUNT);
        });

        it('withdrawStake should emit StakeWithdrawn event', async function() {
            await expect(govStaking.connect(hzlEOA).withdrawStake(user.address, await lpToken.getAddress(), STAKE_AMOUNT))
                .to.emit(govStaking, 'StakeWithdrawn')
                .withArgs(user.address, await lpToken.getAddress(), STAKE_AMOUNT);
        });
    });

    describe('getVotingPower tests', function() {
        let govStaking: any;
        let lpToken: any;
        let user: any;

        this.beforeEach(async () => {
            ({ govStaking, lpToken, user } = await networkHelpers.loadFixture(deployGovStakingWithStake));
        });

        it('getVotingPower should return 0 if user has not staked', async function() {
            const { govStaking: fresh, lpToken: lp, other } = await networkHelpers.loadFixture(deployGovStaking);
            expect(await fresh.getVotingPower(other.address, await lp.getAddress())).to.equal(0n);
        });

        it('getVotingPower should apply ×1.0 multiplier within the first 30 days (tier 0)', async function() {
            const power = await govStaking.getVotingPower(user.address, await lpToken.getAddress());
            // STAKE_AMOUNT * 100 / 100 = STAKE_AMOUNT
            expect(power).to.equal(STAKE_AMOUNT);
        });

        it('getVotingPower should apply x1.25 multiplier after 30 days (tier 1)', async function() {
            await networkHelpers.time.increase(30 * 24 * 3600 + 1);
            const power = await govStaking.getVotingPower(user.address, await lpToken.getAddress());
            expect(power).to.equal(STAKE_AMOUNT * 125n / 100n);
        });

        it('getVotingPower should apply x1.5 multiplier after 90 days (tier 2)', async function() {
            await networkHelpers.time.increase(90 * 24 * 3600 + 1);
            const power = await govStaking.getVotingPower(user.address, await lpToken.getAddress());
            expect(power).to.equal(STAKE_AMOUNT * 150n / 100n);
        });

        it('getVotingPower should apply x2.0 multiplier after 180 days (tier 3)', async function() {
            await networkHelpers.time.increase(180 * 24 * 3600 + 1);
            const power = await govStaking.getVotingPower(user.address, await lpToken.getAddress());
            expect(power).to.equal(STAKE_AMOUNT * 200n / 100n);
        });

        it('getVotingPower should apply x2.5 multiplier after 1 year (tier 4)', async function() {
            await networkHelpers.time.increase(365 * 24 * 3600 + 1);
            const power = await govStaking.getVotingPower(user.address, await lpToken.getAddress());
            expect(power).to.equal(STAKE_AMOUNT * 250n / 100n);
        });

        it('getVotingPower should reduce voting power proportionally after withdrawStake (wrap)', async function() {
            const [owner, , hzlEOA] = await ethers.getSigners();
            await govStaking.connect(owner).setHZL(hzlEOA.address);
            const HALF = STAKE_AMOUNT / 2n;
            // Simulate wrap: half the stake leaves GovStaking
            await govStaking.connect(hzlEOA).withdrawStake(user.address, await lpToken.getAddress(), HALF);
            // Only the remaining half counts toward voting power (multiplier ×1.0 same block)
            const power = await govStaking.getVotingPower(user.address, await lpToken.getAddress());
            expect(power).to.equal(HALF);
        });
    });
});
