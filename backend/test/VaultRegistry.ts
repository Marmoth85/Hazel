import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const TIMELOCK = 48n * 3_600n;
const MIN_TIMELOCK = 3_600n;

async function deployVaultRegistry() {
    const [owner, other] = await ethers.getSigners();
    const vaultRegistry = await ethers.deployContract('VaultRegistry', [TIMELOCK]);
    const mockVault = await ethers.deployContract('MockVault', ['Mock Vault', 'MV']);
    const fakeVault = await mockVault.getAddress();

    return { vaultRegistry, owner, other, fakeVault };
}

async function deployVaultRegistryWithQueued() {
    const ctx = await deployVaultRegistry();
    const { vaultRegistry, owner, fakeVault } = ctx;

    await vaultRegistry.connect(owner).queueVault(fakeVault);

    return ctx;
}

async function deployVaultRegistryWithRegistered() {
    const ctx = await deployVaultRegistryWithQueued();
    const { vaultRegistry, owner } = ctx;

    await networkHelpers.time.increase(Number(TIMELOCK) + 1);
    await vaultRegistry.connect(owner).registerVault(ctx.fakeVault);

    return ctx;
}

describe('VaultRegistry tests', function() {

    describe('Deployment tests', function() {
        let vaultRegistry: any;

        this.beforeEach(async () => {
            ({ vaultRegistry } = await networkHelpers.loadFixture(deployVaultRegistry));
        });

        it('VaultRegistry should store the timelock duration', async function() {
            expect(await vaultRegistry.timelockDuration()).to.equal(TIMELOCK);
        });

        it('VaultRegistry should have zero registered vaults', async function() {
            expect(await vaultRegistry.vaultCount()).to.equal(0n);
        });

        it('VaultRegistry should deploy with default maxVaults of 30', async function() {
            expect(await vaultRegistry.maxVaults()).to.equal(30n);
        });
    });

    describe('queueVault tests', function() {
        let vaultRegistry: any;
        let owner: any;
        let other: any;
        let fakeVault: string;

        this.beforeEach(async () => {
            ({ vaultRegistry, owner, other, fakeVault } =
                await networkHelpers.loadFixture(deployVaultRegistry));
        });

        it('queueVault should revert if called by non-owner', async function() {
            await expect(vaultRegistry.connect(other).queueVault(fakeVault))
                .to.be.revertedWithCustomError(vaultRegistry, 'OwnableUnauthorizedAccount');
        });

        it('queueVault should revert if vault address is zero', async function() {
            await expect(vaultRegistry.connect(owner).queueVault(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(vaultRegistry, 'ZeroAddress');
        });

        it('queueVault should set the enabledAt timestamp correctly', async function() {
            await vaultRegistry.connect(owner).queueVault(fakeVault);
            const block = await ethers.provider.getBlock('latest');
            const enabledAt = await vaultRegistry.pendingAt(fakeVault);
            expect(enabledAt).to.equal(BigInt(block!.timestamp) + TIMELOCK);
        });

        it('queueVault should emit VaultQueued event', async function() {
            await expect(vaultRegistry.connect(owner).queueVault(fakeVault))
                .to.emit(vaultRegistry, 'VaultQueued');
        });

        it('queueVault should revert if vault is already registered', async function() {
            await vaultRegistry.connect(owner).queueVault(fakeVault);
            await networkHelpers.time.increase(Number(TIMELOCK) + 1);
            await vaultRegistry.connect(owner).registerVault(fakeVault);
            await expect(vaultRegistry.connect(owner).queueVault(fakeVault))
                .to.be.revertedWithCustomError(vaultRegistry, 'AlreadyRegistered');
        });

        it('queueVault should revert if vault is already queued', async function() {
            await vaultRegistry.connect(owner).queueVault(fakeVault);
            await expect(vaultRegistry.connect(owner).queueVault(fakeVault))
                .to.be.revertedWithCustomError(vaultRegistry, 'AlreadyQueued');
        });
    });

    describe('registerVault tests', function() {
        let vaultRegistry: any;
        let owner: any;
        let fakeVault: string;

        this.beforeEach(async () => {
            ({ vaultRegistry, owner, fakeVault } =
                await networkHelpers.loadFixture(deployVaultRegistryWithQueued));
        });

        it('registerVault should revert if vault has not been queued', async function() {
            const unqueued = ethers.Wallet.createRandom().address;
            await expect(vaultRegistry.connect(owner).registerVault(unqueued))
                .to.be.revertedWithCustomError(vaultRegistry, 'NotQueued');
        });

        it('registerVault should revert if timelock has not elapsed', async function() {
            await expect(vaultRegistry.connect(owner).registerVault(fakeVault))
                .to.be.revertedWithCustomError(vaultRegistry, 'TimelockActive');
        });

        it('registerVault should revert if max vaults is reached', async function() {
            await vaultRegistry.connect(owner).setMaxVaults(1n);
            await networkHelpers.time.increase(Number(TIMELOCK) + 1);
            await vaultRegistry.connect(owner).registerVault(fakeVault);
            const extra = await ethers.deployContract('MockVault', ['Extra', 'EX']);
            await vaultRegistry.connect(owner).queueVault(await extra.getAddress());
            await networkHelpers.time.increase(Number(TIMELOCK) + 1);
            await expect(vaultRegistry.connect(owner).registerVault(await extra.getAddress()))
                .to.be.revertedWithCustomError(vaultRegistry, 'MaxVaultsReached');
        });

        it('registerVault should register the vault after timelock', async function() {
            await networkHelpers.time.increase(Number(TIMELOCK) + 1);
            await vaultRegistry.connect(owner).registerVault(fakeVault);
            expect(await vaultRegistry.isRegistered(fakeVault)).to.equal(true);
        });

        it('registerVault should add vault to the vaults array', async function() {
            await networkHelpers.time.increase(Number(TIMELOCK) + 1);
            await vaultRegistry.connect(owner).registerVault(fakeVault);
            expect(await vaultRegistry.vaultCount()).to.equal(1n);
            expect(await vaultRegistry.vaults(0n)).to.equal(fakeVault);
        });

        it('registerVault should clear the pending entry after registration', async function() {
            await networkHelpers.time.increase(Number(TIMELOCK) + 1);
            await vaultRegistry.connect(owner).registerVault(fakeVault);
            expect(await vaultRegistry.pendingAt(fakeVault)).to.equal(0n);
        });

        it('registerVault should emit VaultRegistered event', async function() {
            await networkHelpers.time.increase(Number(TIMELOCK) + 1);
            await expect(vaultRegistry.connect(owner).registerVault(fakeVault))
                .to.emit(vaultRegistry, 'VaultRegistered').withArgs(fakeVault);
        });
    });

    describe('removeVault tests', function() {
        let vaultRegistry: any;
        let owner: any;
        let other: any;
        let fakeVault: string;

        this.beforeEach(async () => {
            ({ vaultRegistry, owner, other, fakeVault } =
                await networkHelpers.loadFixture(deployVaultRegistryWithRegistered));
        });

        it('removeVault should revert if called by non-owner', async function() {
            await expect(vaultRegistry.connect(other).removeVault(fakeVault))
                .to.be.revertedWithCustomError(vaultRegistry, 'OwnableUnauthorizedAccount');
        });

        it('removeVault should revert if vault is not registered', async function() {
            const unknown = ethers.Wallet.createRandom().address;
            await expect(vaultRegistry.connect(owner).removeVault(unknown))
                .to.be.revertedWithCustomError(vaultRegistry, 'NotRegistered');
        });

        it('removeVault should mark vault as not registered', async function() {
            await vaultRegistry.connect(owner).removeVault(fakeVault);
            expect(await vaultRegistry.isRegistered(fakeVault)).to.equal(false);
        });

        it('removeVault should remove vault from the array', async function() {
            await vaultRegistry.connect(owner).removeVault(fakeVault);
            expect(await vaultRegistry.vaultCount()).to.equal(0n);
        });

        it('removeVault should emit VaultRemoved event', async function() {
            await expect(vaultRegistry.connect(owner).removeVault(fakeVault))
                .to.emit(vaultRegistry, 'VaultRemoved').withArgs(fakeVault);
        });
    });

    describe('setTimelockDuration tests', function() {
        let vaultRegistry: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ vaultRegistry, owner, other } = await networkHelpers.loadFixture(deployVaultRegistry));
        });

        it('setTimelockDuration should revert if called by non-owner', async function() {
            await expect(vaultRegistry.connect(other).setTimelockDuration(MIN_TIMELOCK))
                .to.be.revertedWithCustomError(vaultRegistry, 'OwnableUnauthorizedAccount');
        });

        it('setTimelockDuration should revert if duration is below minimum (1 hour)', async function() {
            await expect(vaultRegistry.connect(owner).setTimelockDuration(MIN_TIMELOCK - 1n))
                .to.be.revertedWithCustomError(vaultRegistry, 'TimelockTooShort');
        });

        it('setTimelockDuration should update the timelock duration', async function() {
            await vaultRegistry.connect(owner).setTimelockDuration(MIN_TIMELOCK);
            expect(await vaultRegistry.timelockDuration()).to.equal(MIN_TIMELOCK);
        });

        it('setTimelockDuration should emit TimelockUpdated event', async function() {
            await expect(vaultRegistry.connect(owner).setTimelockDuration(MIN_TIMELOCK))
                .to.emit(vaultRegistry, 'TimelockUpdated').withArgs(TIMELOCK, MIN_TIMELOCK);
        });
    });

    describe('setMaxVaults tests', function() {
        let vaultRegistry: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ vaultRegistry, owner, other } = await networkHelpers.loadFixture(deployVaultRegistry));
        });

        it('setMaxVaults should revert if called by non-owner', async function() {
            await expect(vaultRegistry.connect(other).setMaxVaults(20n))
                .to.be.revertedWithCustomError(vaultRegistry, 'OwnableUnauthorizedAccount');
        });

        it('setMaxVaults should revert if max is zero', async function() {
            await expect(vaultRegistry.connect(owner).setMaxVaults(0n))
                .to.be.revertedWithCustomError(vaultRegistry, 'ZeroAmount');
        });

        it('setMaxVaults should update maxVaults', async function() {
            await vaultRegistry.connect(owner).setMaxVaults(20n);
            expect(await vaultRegistry.maxVaults()).to.equal(20n);
        });

        it('setMaxVaults should emit MaxVaultsUpdated event', async function() {
            await expect(vaultRegistry.connect(owner).setMaxVaults(20n))
                .to.emit(vaultRegistry, 'MaxVaultsUpdated').withArgs(30n, 20n);
        });
    });

    describe('getVaults tests', function() {
        let vaultRegistry: any;
        let fakeVault: string;

        this.beforeEach(async () => {
            ({ vaultRegistry, fakeVault } =
                await networkHelpers.loadFixture(deployVaultRegistryWithRegistered));
        });

        it('getVaults should return all registered vaults', async function() {
            const vaults = await vaultRegistry.getVaults();
            expect(vaults.length).to.equal(1);
            expect(vaults[0]).to.equal(fakeVault);
        });
    });
});
