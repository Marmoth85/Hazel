import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const USDC_DECIMALS = 6n;
const HARVEST_INTERVAL = 86_400n;
const FEE_RATE = 1_000n;
const DEPOSIT = 1_000n * 10n ** USDC_DECIMALS;
const YIELD = 100n * 10n ** USDC_DECIMALS;

async function deployAll() {
    const [owner, user, treasury, other] = await ethers.getSigners();

    const mockUSDC = await ethers.deployContract('MockERC20', ['USD Coin', 'USDC', USDC_DECIMALS]);
    const insuranceFund = await ethers.deployContract('InsuranceFund', [ethers.ZeroAddress]);
    const revenueDistributor = await ethers.deployContract('RevenueDistributor', [
        treasury.address, await insuranceFund.getAddress()
    ]);
    const hzStable = await ethers.deployContract('HzStable', [
        await mockUSDC.getAddress(), // underlyingAsset
        ethers.ZeroAddress, // strategyAdapter
        await revenueDistributor.getAddress(),
        treasury.address,
        HARVEST_INTERVAL,
        FEE_RATE
    ]);
    const mockAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await hzStable.getAddress()]);
    const govStaking = await ethers.deployContract('GovStaking', []);
    const registry   = await ethers.deployContract('VaultRegistry', [0n]);

    await govStaking.setVaultRegistry(await registry.getAddress());
    await registry.queueVault(await hzStable.getAddress());
    await registry.registerVault(await hzStable.getAddress());

    await hzStable.setAdapter(await mockAdapter.getAddress());
    await insuranceFund.setVault(await hzStable.getAddress());
    await revenueDistributor.addVault(await hzStable.getAddress());
    await hzStable.setGovStaking(await govStaking.getAddress());

    return { mockUSDC, mockAdapter, insuranceFund, revenueDistributor, hzStable, govStaking, registry, owner, user, treasury, other };
}

async function deployAllWithDeposit() {
    const ctx = await deployAll();
    const { mockUSDC, hzStable, user } = ctx;

    await mockUSDC.mint(user.address, DEPOSIT);
    await mockUSDC.connect(user).approve(await hzStable.getAddress(), DEPOSIT);
    await hzStable.connect(user).deposit(DEPOSIT, user.address);

    return ctx;
}

async function deployAllWithYield() {
    const ctx = await deployAllWithDeposit();
    const { mockAdapter, hzStable } = ctx;

    await networkHelpers.time.increase(Number(HARVEST_INTERVAL) + 1);
    await hzStable.harvest();

    await mockAdapter.simulateYield(YIELD);
    await networkHelpers.time.increase(Number(HARVEST_INTERVAL) + 1);

    return ctx;
}

describe('HzStable Vault Tests', function() {

    describe('Deployment Tests', function() {
        let hzStable: any;
        let mockAdapter: any;
        let mockUSDC: any;
        let revenueDistributor: any;
        let other: any;

        this.beforeEach(async () => {
            ({ hzStable, mockAdapter, mockUSDC, revenueDistributor, other } = await networkHelpers.loadFixture(deployAll));
        });

        it('Proof of Deposit token should have correct name and symbol', async function() {
            expect(await hzStable.name()).to.equal('HazelStable');
            expect(await hzStable.symbol()).to.equal('hzUSDC');
        });

        it('Vault should have 9 decimals (USDC 6 + offset 3)', async function() {
            expect(await hzStable.decimals()).to.equal(9n);
        });

        it('Vault should have correct adapter address', async function() {
            expect(await hzStable.strategyAdapter()).to.equal(await mockAdapter.getAddress());
        });

        it('Vault should have correct revenueDistributor address', async function() {
            expect(await hzStable.revenueDistributor()).to.equal(await revenueDistributor.getAddress());
        });

        it('Vault should have correct fee rate', async function() {
            expect(await hzStable.feeRate()).to.equal(FEE_RATE);
        });

        it('Vault should have correct harvest interval', async function() {
            expect(await hzStable.harvestInterval()).to.equal(HARVEST_INTERVAL);
        });

        it('Vault should have 0 asset after deployment', async function() {
            expect(await hzStable.totalAssets()).to.equal(0n);
        });

        it('Vault deployment should revert if harvest interval is below 1 hour', async function() {
            await expect(ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, 3599n, FEE_RATE
            ])).to.be.revertedWithCustomError(hzStable, 'InvalidInterval');
        });

        it('Vault deployment should revert if harvest interval is above 30 days', async function() {
            await expect(ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, 2592001n, FEE_RATE
            ])).to.be.revertedWithCustomError(hzStable, 'InvalidInterval');
        });

        it('Vault deployment should revert if fee rate exceeds 100%', async function() {
            await expect(ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, ethers.ZeroAddress, HARVEST_INTERVAL, 10_001n
            ])).to.be.revertedWithCustomError(hzStable, 'FeeTooHigh');
        });

        it('Vault deployment should revert if revenueDistributor is zero address', async function() {
            await expect(ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, other.address, HARVEST_INTERVAL, FEE_RATE
            ])).to.be.revertedWithCustomError(hzStable, 'ZeroAddress');
        });

        it('Vault deployment should revert if treasury is zero address', async function() {
            await expect(ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, other.address, ethers.ZeroAddress, HARVEST_INTERVAL, FEE_RATE
            ])).to.be.revertedWithCustomError(hzStable, 'ZeroAddress');
        });

        it('Vault should make an infinite allowance for the adapter when deploying', async function() {
            const adapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), other.address]);
            const vault = await ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), await adapter.getAddress(), other.address, other.address, HARVEST_INTERVAL, FEE_RATE
            ]);
            expect(await mockUSDC.allowance(await vault.getAddress(), await adapter.getAddress())).to.equal(ethers.MaxUint256);
        });
    });

    describe('Deposit Tests', function() {
        let hzStable: any;
        let govStaking: any;
        let mockUSDC: any;
        let mockAdapter: any;
        let user: any;
        let other: any;

        this.beforeEach(async () => {
            ({ hzStable, govStaking, mockUSDC, mockAdapter, user, other } = await networkHelpers.loadFixture(deployAll));
        });

        it('Vault should auto-stake shares into govStaking after deposit', async function() {
            await mockUSDC.mint(user.address, DEPOSIT);
            await mockUSDC.connect(user).approve(await hzStable.getAddress(), DEPOSIT);
            await hzStable.connect(user).deposit(DEPOSIT, user.address);
            const staked = await govStaking.stakedAmountOf(user.address, await hzStable.getAddress());
            expect(staked).to.be.gt(0n);
        });

        it('Vault should leave zero shares in user wallet after deposit (all staked)', async function() {
            await mockUSDC.mint(user.address, DEPOSIT);
            await mockUSDC.connect(user).approve(await hzStable.getAddress(), DEPOSIT);
            await hzStable.connect(user).deposit(DEPOSIT, user.address);
            expect(await hzStable.balanceOf(user.address)).to.equal(0n);
        });

        it('Vault should reflect staked shares in maxRedeem', async function() {
            await mockUSDC.mint(user.address, DEPOSIT);
            await mockUSDC.connect(user).approve(await hzStable.getAddress(), DEPOSIT);
            await hzStable.connect(user).deposit(DEPOSIT, user.address);
            const staked = await govStaking.stakedAmountOf(user.address, await hzStable.getAddress());
            expect(await hzStable.maxRedeem(user.address)).to.equal(staked);
        });

        it('Vault should route deposited USDC to adapter', async function() {
            await mockUSDC.mint(user.address, DEPOSIT);
            await mockUSDC.connect(user).approve(await hzStable.getAddress(), DEPOSIT);
            await hzStable.connect(user).deposit(DEPOSIT, user.address);
            expect(await mockAdapter.balanceInUSDC()).to.equal(DEPOSIT);
        });

        it('Vault should reflect deposit in totalAssets', async function() {
            await mockUSDC.mint(user.address, DEPOSIT);
            await mockUSDC.connect(user).approve(await hzStable.getAddress(), DEPOSIT);
            await hzStable.connect(user).deposit(DEPOSIT, user.address);
            expect(await hzStable.totalAssets()).to.equal(DEPOSIT);
        });

        it('Vault should leave zero USDC in the vault contract itself', async function() {
            await mockUSDC.mint(user.address, DEPOSIT);
            await mockUSDC.connect(user).approve(await hzStable.getAddress(), DEPOSIT);
            await hzStable.connect(user).deposit(DEPOSIT, user.address);
            expect(await mockUSDC.balanceOf(await hzStable.getAddress())).to.equal(0n);
        });

        it('Vault should emit Deposit event', async function() {
            await mockUSDC.mint(user.address, DEPOSIT);
            await mockUSDC.connect(user).approve(await hzStable.getAddress(), DEPOSIT);
            const shares = await hzStable.previewDeposit(DEPOSIT);
            await expect(hzStable.connect(user).deposit(DEPOSIT, user.address))
                .to.emit(hzStable, 'Deposit').withArgs(user.address, user.address, DEPOSIT, shares);
        });

        it('Deposit should revert if adapter is not set after vault deployment', async function() {
            const freshVault = await ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, other.address, other.address, HARVEST_INTERVAL, FEE_RATE
            ]);
            await mockUSDC.mint(user.address, DEPOSIT);
            await mockUSDC.connect(user).approve(await freshVault.getAddress(), DEPOSIT);
            await expect(freshVault.connect(user).deposit(DEPOSIT, user.address))
                .to.be.revertedWithCustomError(freshVault, 'AdapterNotSet');
        });

        it('Deposit should revert if govStaking is not set after vault deployment', async function() {
            const freshVault = await ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(),ethers.ZeroAddress,other.address, other.address,HARVEST_INTERVAL, FEE_RATE
            ]);
            const freshAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await freshVault.getAddress()]);
            await freshVault.setAdapter(await freshAdapter.getAddress());
            await mockUSDC.mint(user.address, DEPOSIT);
            await mockUSDC.connect(user).approve(await freshVault.getAddress(), DEPOSIT);
            await expect(freshVault.connect(user).deposit(DEPOSIT, user.address))
                .to.be.revertedWithCustomError(freshVault, 'GovStakingNotSet');
        });

        it('Deposit should revert if user has insufficient USDC balance', async function() {
            await mockUSDC.connect(other).approve(await hzStable.getAddress(), DEPOSIT);
            await expect(hzStable.connect(other).deposit(DEPOSIT, other.address))
                .to.be.revertedWithCustomError(mockUSDC, 'ERC20InsufficientBalance');
        });

        it('Deposit should revert if user has not approved the vault with a sufficient amount', async function() {
            await mockUSDC.mint(user.address, DEPOSIT);
            await expect(hzStable.connect(user).deposit(DEPOSIT, user.address))
                .to.be.revertedWithCustomError(mockUSDC, 'ERC20InsufficientAllowance');
        });
    });

    describe('Withdraw Tests', function() {
        let hzStable: any;
        let govStaking: any;
        let mockUSDC: any;
        let user: any;
        let other: any;

        this.beforeEach(async () => {
            ({ hzStable, govStaking, mockUSDC, user, other } = await networkHelpers.loadFixture(deployAllWithDeposit));
        });

        it('Redeem should auto-unstake and burn shares', async function() {
            const shares = await hzStable.maxRedeem(user.address);
            await hzStable.connect(user).redeem(shares, user.address, user.address);
            expect(await govStaking.stakedAmountOf(user.address, await hzStable.getAddress())).to.equal(0n);
        });

        it('Redeem should send USDC back to receiver', async function() {
            const shares = await hzStable.maxRedeem(user.address);
            await hzStable.connect(user).redeem(shares, user.address, user.address);
            expect(await mockUSDC.balanceOf(user.address)).to.be.closeTo(DEPOSIT, 1n);
        });

        it('Redeem should emit Withdraw event', async function() {
            const shares = await hzStable.maxRedeem(user.address);
            await expect(hzStable.connect(user).redeem(shares, user.address, user.address))
                .to.emit(hzStable, 'Withdraw');
        });

        it('Redeem should revert when redeeming more shares than staked', async function() {
            const shares = await hzStable.maxRedeem(user.address);
            await expect(hzStable.connect(user).redeem(shares + 1n, user.address, user.address))
                .to.be.revertedWithCustomError(hzStable, 'ERC4626ExceededMaxRedeem');
        });

        it('Redeem should revert if third party redeems without share allowance', async function() {
            const shares = await hzStable.maxRedeem(user.address);
            await expect(hzStable.connect(other).redeem(shares, other.address, user.address))
                .to.be.revertedWithCustomError(hzStable, 'ERC20InsufficientAllowance');
        });

        // delegated redemption test - will never happen in frontend app, but possible use with direct contract interaction
        it('Redeem should allow third party to redeem with share allowance', async function() {
            const shares = await hzStable.maxRedeem(user.address);
            await hzStable.connect(user).approve(other.address, shares);
            await hzStable.connect(other).redeem(shares, other.address, user.address);
            expect(await mockUSDC.balanceOf(other.address)).to.be.gt(0n);
        });
    });

    describe('maxRedeem / maxWithdraw tests', function() {
        let hzStable: any;
        let mockUSDC: any;
        let user: any;
        let other: any;

        this.beforeEach(async () => {
            ({ hzStable, mockUSDC, user, other } = await networkHelpers.loadFixture(deployAllWithDeposit));
        });

        it('MaxRedeem should fall back to super.maxRedeem when govStaking is not set after deployment', async function() {
            const freshVault = await ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, other.address, other.address, HARVEST_INTERVAL, FEE_RATE
            ]);
            expect(await freshVault.maxRedeem(user.address)).to.equal(0n);
        });

        it('MaxWithdraw should return correct value based on staked balance', async function() {
            const redeem = await hzStable.maxRedeem(user.address);
            expect(await hzStable.maxWithdraw(user.address)).to.equal(await hzStable.convertToAssets(redeem));
        });
    });

    describe('Harvest - timing tests', function() {
        let hzStable: any;

        this.beforeEach(async () => {
            ({ hzStable } = await networkHelpers.loadFixture(deployAllWithDeposit));
        });

        it('Harvest should revert if harvest interval has not elapsed', async function() {
            await expect(hzStable.harvest()).to.be.revertedWithCustomError(hzStable, 'HarvestNotReady');
        });

        it('Harvest should succeed once harvest interval has elapsed', async function() {
            await networkHelpers.time.increase(Number(HARVEST_INTERVAL) + 1);
            await hzStable.harvest();
        });

        it('Harvest should update lastHarvest timestamp after harvest', async function() {
            await networkHelpers.time.increase(Number(HARVEST_INTERVAL) + 1);
            await hzStable.harvest();
            const block = await ethers.provider.getBlock('latest');
            expect(await hzStable.lastHarvest()).to.equal(BigInt(block!.timestamp));
        });

        it('Harvest should not revert if supply is zero and interval elapsed', async function() {
            const { hzStable: freshVault } = await networkHelpers.loadFixture(deployAll);
            await networkHelpers.time.increase(Number(HARVEST_INTERVAL) + 1);
            await freshVault.harvest();
        });
    });

    describe('Harvest - fee distribution tests', function() {
        let hzStable: any;
        let revenueDistributor: any;
        let owner: any;

        this.beforeEach(async () => {
            ({ hzStable, revenueDistributor, owner } = await networkHelpers.loadFixture(deployAllWithYield));
        });

        it('Should mint fee shares to revenueDistributor', async function() {
            await hzStable.harvest();
            expect(await hzStable.balanceOf(await revenueDistributor.getAddress())).to.be.gt(0n);
        });

        it('Should emit Harvested event', async function() {
            await expect(hzStable.harvest()).to.emit(hzStable, 'Harvested');
        });

        it('Should emit FeesMinted event pointing to revenueDistributor', async function() {
            await expect(hzStable.harvest())
                .to.emit(hzStable, 'FeesMinted');
        });

        it('Should update highWaterMark to new higher share price', async function() {
            const hwmBefore = await hzStable.highWaterMark();
            await hzStable.harvest();
            expect(await hzStable.highWaterMark()).to.be.gt(hwmBefore);
        });

        it('Should not mint fees on second harvest if no new yield', async function() {
            await hzStable.harvest();
            const rdBalance = await hzStable.balanceOf(await revenueDistributor.getAddress());
            await networkHelpers.time.increase(Number(HARVEST_INTERVAL) + 1);
            await hzStable.harvest();
            expect(await hzStable.balanceOf(await revenueDistributor.getAddress())).to.equal(rdBalance);
        });

        it('Should not mint fees when feeRate is zero (feeAssets == 0 branch)', async function() {
            await hzStable.connect(owner).setFeeRate(0n);
            await hzStable.harvest();
            expect(await hzStable.balanceOf(await revenueDistributor.getAddress())).to.equal(0n);
        });
    });

    describe('setAdapter tests', function() {
        let hzStable: any;
        let mockUSDC: any;
        let mockAdapter: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ hzStable, mockUSDC, mockAdapter, owner, other } = await networkHelpers.loadFixture(deployAllWithDeposit));
        });

        it('setAdapter should revert if it is called by non-owner', async function() {
            const newAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await hzStable.getAddress()]);
            await expect(hzStable.connect(other).setAdapter(await newAdapter.getAddress()))
                .to.be.revertedWithCustomError(hzStable, 'OwnableUnauthorizedAccount');
        });

        it('setAdapter should revert if zero address is passed', async function() {
            await expect(hzStable.connect(owner).setAdapter(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(hzStable, 'ZeroAddress');
        });

        it('setAdapter should move all funds to the new adapter', async function() {
            const newAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await hzStable.getAddress()]);
            await hzStable.connect(owner).setAdapter(await newAdapter.getAddress());
            expect(await newAdapter.balanceInUSDC()).to.equal(DEPOSIT);
        });

        it('setAdapter should drain the old adapter to zero', async function() {
            const newAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await hzStable.getAddress()]);
            await hzStable.connect(owner).setAdapter(await newAdapter.getAddress());
            expect(await mockAdapter.balanceInUSDC()).to.equal(0n);
        });

        it('setAdapter should update adapter address', async function() {
            const newAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await hzStable.getAddress()]);
            await hzStable.connect(owner).setAdapter(await newAdapter.getAddress());
            expect(await hzStable.strategyAdapter()).to.equal(await newAdapter.getAddress());
        });

        it('setAdapter should emit AdapterUpdated event', async function() {
            const newAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await hzStable.getAddress()]);
            await expect(hzStable.connect(owner).setAdapter(await newAdapter.getAddress()))
                .to.emit(hzStable, 'AdapterUpdated')
                .withArgs(await mockAdapter.getAddress(), await newAdapter.getAddress());
        });

        it('setAdapter should preserve totalAssets after migration', async function() {
            const newAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await hzStable.getAddress()]);
            await hzStable.connect(owner).setAdapter(await newAdapter.getAddress());
            expect(await hzStable.totalAssets()).to.equal(DEPOSIT);
        });

        it('setAdapter should set adapter when previously unset (initial setup)', async function() {
            const freshVault = await ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, other.address, other.address, HARVEST_INTERVAL, FEE_RATE
            ]);
            const freshAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await freshVault.getAddress()]);
            await freshVault.connect(owner).setAdapter(await freshAdapter.getAddress());
            expect(await freshVault.strategyAdapter()).to.equal(await freshAdapter.getAddress());
        });

        it('setAdapter should emit AdapterUpdated with zero address as old adapter on initial setup', async function() {
            const freshVault = await ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, other.address, other.address, HARVEST_INTERVAL, FEE_RATE
            ]);
            const freshAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await freshVault.getAddress()]);
            await expect(freshVault.connect(owner).setAdapter(await freshAdapter.getAddress()))
                .to.emit(freshVault, 'AdapterUpdated')
                .withArgs(ethers.ZeroAddress, await freshAdapter.getAddress());
        });

        it('setAdapter should emit AdapterUpdated with old adapter address as old adapter and new adapter address as new adapter when an adapter is already set', async function() {
            const freshAdapter = await ethers.deployContract('MockAdapter', [await mockUSDC.getAddress(), await hzStable.getAddress()]);
            await expect(hzStable.connect(owner).setAdapter(await freshAdapter.getAddress()))
                .to.emit(hzStable, 'AdapterUpdated')
                .withArgs(await hzStable.strategyAdapter(), await freshAdapter.getAddress());
        });
    });

    describe('revokeAdapterApproval tests', function() {
        let hzStable: any;
        let mockUSDC: any;
        let mockAdapter: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ hzStable, mockUSDC, mockAdapter, owner, other } =
                await networkHelpers.loadFixture(deployAllWithDeposit));
        });

        it('revokeAdapterApproval should revert if called by non-owner', async function() {
            await expect(hzStable.connect(other).revokeAdapterApproval())
                .to.be.revertedWithCustomError(hzStable, 'OwnableUnauthorizedAccount');
        });

        it('revokeAdapterApproval should revoke vault allowance toward adapter', async function() {
            await hzStable.connect(owner).revokeAdapterApproval();
            expect(await mockUSDC.allowance(await hzStable.getAddress(), await mockAdapter.getAddress())).to.equal(0n);
        });
    });

    describe('Admin setters tests', function() {
        let hzStable: any;
        let mockUSDC: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ hzStable, mockUSDC, owner, other } = await networkHelpers.loadFixture(deployAll));
        });

        it('setGovStaking should revert if not owner', async function() {
            await expect(hzStable.connect(other).setGovStaking(other.address))
                .to.be.revertedWithCustomError(hzStable, 'OwnableUnauthorizedAccount');
        });

        it('setGovStaking should revert if already set', async function() {
            await expect(hzStable.connect(owner).setGovStaking(other.address))
                .to.be.revertedWithCustomError(hzStable, 'GovStakingAlreadySet');
        });

        it('setGovStaking should revert with zero address', async function() {
            const freshVault = await ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, other.address, other.address, HARVEST_INTERVAL, FEE_RATE
            ]);
            await expect(freshVault.connect(owner).setGovStaking(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(freshVault, 'ZeroAddress');
        });

        it('setGovStaking should set govStaking address when unset', async function() {
            const freshVault = await ethers.deployContract('HzStable', [
                await mockUSDC.getAddress(), ethers.ZeroAddress, other.address, other.address, HARVEST_INTERVAL, FEE_RATE
            ]);
            const gs = await ethers.deployContract('GovStaking', []);
            await freshVault.connect(owner).setGovStaking(await gs.getAddress());
            expect(await freshVault.govStaking()).to.equal(await gs.getAddress());
        });

        it('setHarvestInterval should revert if not owner', async function() {
            await expect(hzStable.connect(other).setHarvestInterval(7200n))
                .to.be.revertedWithCustomError(hzStable, 'OwnableUnauthorizedAccount');
        });

        it('setHarvestInterval should revert if below 1 hour', async function() {
            await expect(hzStable.connect(owner).setHarvestInterval(3599n))
                .to.be.revertedWithCustomError(hzStable, 'InvalidInterval');
        });

        it('setHarvestInterval should revert if above 30 days', async function() {
            await expect(hzStable.connect(owner).setHarvestInterval(30n * 86_400n + 1n))
                .to.be.revertedWithCustomError(hzStable, 'InvalidInterval');
        });

        it('setHarvestInterval should update harvestInterval', async function() {
            await hzStable.connect(owner).setHarvestInterval(7_200n);
            expect(await hzStable.harvestInterval()).to.equal(7_200n);
        });

        it('setHarvestInterval should emit HarvestIntervalUpdated event', async function() {
            await expect(hzStable.connect(owner).setHarvestInterval(7_200n))
                .to.emit(hzStable, 'HarvestIntervalUpdated').withArgs(HARVEST_INTERVAL, 7_200n);
        });

        it('setFeeRate should revert if not owner', async function() {
            await expect(hzStable.connect(other).setFeeRate(500n))
                .to.be.revertedWithCustomError(hzStable, 'OwnableUnauthorizedAccount');
        });

        it('setFeeRate should revert if above 100 percent of basis points', async function() {
            await expect(hzStable.connect(owner).setFeeRate(10_001n))
                .to.be.revertedWithCustomError(hzStable, 'FeeTooHigh');
        });

        it('setFeeRate should update feeRate', async function() {
            await hzStable.connect(owner).setFeeRate(500n);
            expect(await hzStable.feeRate()).to.equal(500n);
        });

        it('setProtocolTreasury should revert if not owner', async function() {
            await expect(hzStable.connect(other).setProtocolTreasury(other.address))
                .to.be.revertedWithCustomError(hzStable, 'OwnableUnauthorizedAccount');
        });

        it('setProtocolTreasury should revert with zero address', async function() {
            await expect(hzStable.connect(owner).setProtocolTreasury(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(hzStable, 'ZeroAddress');
        });

        it('setProtocolTreasury should emit TreasuryUpdated event', async function() {
            const old = await hzStable.protocolTreasury();
            await expect(hzStable.connect(owner).setProtocolTreasury(other.address))
                .to.emit(hzStable, 'TreasuryUpdated').withArgs(old, other.address);
        });

        it('setRevenueDistributor should revert if not owner', async function() {
            await expect(hzStable.connect(other).setRevenueDistributor(other.address))
                .to.be.revertedWithCustomError(hzStable, 'OwnableUnauthorizedAccount');
        });

        it('setRevenueDistributor should revert with zero address', async function() {
            await expect(hzStable.connect(owner).setRevenueDistributor(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(hzStable, 'ZeroAddress');
        });

        it('setRevenueDistributor should update revenueDistributor', async function() {
            await hzStable.connect(owner).setRevenueDistributor(other.address);
            expect(await hzStable.revenueDistributor()).to.equal(other.address);
        });
    });
});
