import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const USDC_DEC = 6n;
const DEPOSIT  = 1_000n * 10n ** USDC_DEC;


async function deployAdapterAave() {
    const [owner, vault, other] = await ethers.getSigners();

    const usdc = await ethers.deployContract('MockERC20', ['USD Coin', 'USDC', USDC_DEC]);
    const aUsdc = await ethers.deployContract('MockERC20', ['Aave USD Coin', 'aUSDC', USDC_DEC]);
    const aavePool = await ethers.deployContract('MockAavePool', [
        await usdc.getAddress(),
        await aUsdc.getAddress()
    ]);
    const adapter  = await ethers.deployContract('AdapterAave', [
        vault.address,
        await usdc.getAddress(),
        await aUsdc.getAddress(),
        await aavePool.getAddress()
    ]);

    await usdc.mint(vault.address, DEPOSIT);
    await usdc.connect(vault).approve(await adapter.getAddress(), DEPOSIT);

    return { usdc, aUsdc, aavePool, adapter, owner, vault, other };
}

async function deployAdapterAaveFunded() {
    const ctx = await deployAdapterAave();
    const { adapter, vault } = ctx;
    await adapter.connect(vault).deposit(DEPOSIT);
    return ctx;
}

describe('AdapterAave tests', function() {

    describe('Deployment tests', function() {
        let adapter: any;
        let usdc: any;
        let aUsdc: any;
        let aavePool: any;
        let vault: any;

        this.beforeEach(async () => {
            ({ adapter, usdc, aUsdc, aavePool, vault } = await networkHelpers.loadFixture(deployAdapterAave));
        });

        it('Deployment should store the vault address', async function() {
            expect(await adapter.vault()).to.equal(vault.address);
        });

        it('Deployment should store the USDC address', async function() {
            expect(await adapter.usdc()).to.equal(await usdc.getAddress());
        });

        it('Deployment should store the aUSDC address', async function() {
            expect(await adapter.aUsdc()).to.equal(await aUsdc.getAddress());
        });

        it('Deployment should store the aavePool address', async function() {
            expect(await adapter.aavePool()).to.equal(await aavePool.getAddress());
        });

        it('Deployment should approve aavePool with max USDC allowance on construction', async function() {
            expect(await usdc.allowance(await adapter.getAddress(), await aavePool.getAddress()))
                .to.equal(ethers.MaxUint256);
        });

        it('Deployment should revert if vault is zero address', async function() {
            await expect(ethers.deployContract('AdapterAave', [
                ethers.ZeroAddress,
                await usdc.getAddress(),
                await aUsdc.getAddress(),
                await aavePool.getAddress()
            ])).to.be.revertedWithCustomError(adapter, 'ZeroAddress');
        });

        it('Deployment should revert if usdc is zero address', async function() {
            await expect(ethers.deployContract('AdapterAave', [
                vault.address,
                ethers.ZeroAddress,
                await aUsdc.getAddress(),
                await aavePool.getAddress()
            ])).to.be.revertedWithCustomError(adapter, 'ZeroAddress');
        });

        it('Deployment should revert if aUsdc is zero address', async function() {
            await expect(ethers.deployContract('AdapterAave', [
                vault.address,
                await usdc.getAddress(),
                ethers.ZeroAddress,
                await aavePool.getAddress()
            ])).to.be.revertedWithCustomError(adapter, 'ZeroAddress');
        });

        it('Deployment should revert if aavePool is zero address', async function() {
            await expect(ethers.deployContract('AdapterAave', [
                vault.address,
                await usdc.getAddress(),
                await aUsdc.getAddress(),
                ethers.ZeroAddress
            ])).to.be.revertedWithCustomError(adapter, 'ZeroAddress');
        });
    });

    describe('deposit tests', function() {
        let adapter: any;
        let usdc: any;
        let aUsdc: any;
        let vault: any;
        let other: any;

        this.beforeEach(async () => {
            ({ adapter, usdc, aUsdc, vault, other } = await networkHelpers.loadFixture(deployAdapterAave));
        });

        it('deposit should revert if not called by vault', async function() {
            await expect(adapter.connect(other).deposit(DEPOSIT))
                .to.be.revertedWithCustomError(adapter, 'OnlyVault');
        });

        it('deposit should pull USDC from vault', async function() {
            await adapter.connect(vault).deposit(DEPOSIT);
            expect(await usdc.balanceOf(vault.address)).to.equal(0n);
        });

        it('deposit should give adapter aUSDC equal to deposited amount', async function() {
            await adapter.connect(vault).deposit(DEPOSIT);
            expect(await aUsdc.balanceOf(await adapter.getAddress())).to.equal(DEPOSIT);
        });
    });

    describe('withdraw tests', function() {
        let adapter: any;
        let usdc: any;
        let aUsdc: any;
        let vault: any;
        let other: any;

        this.beforeEach(async () => {
            ({ adapter, usdc, aUsdc, vault, other } = await networkHelpers.loadFixture(deployAdapterAaveFunded));
        });

        it('Should revert if not called by vault', async function() {
            await expect(adapter.connect(other).withdraw(DEPOSIT))
                .to.be.revertedWithCustomError(adapter, 'OnlyVault');
        });

        it('Should transfer USDC back to vault', async function() {
            await adapter.connect(vault).withdraw(DEPOSIT);
            expect(await usdc.balanceOf(vault.address)).to.equal(DEPOSIT);
        });

        it('Should burn adapter aUSDC on withdraw', async function() {
            await adapter.connect(vault).withdraw(DEPOSIT);
            expect(await aUsdc.balanceOf(await adapter.getAddress())).to.equal(0n);
        });
    });

    describe('withdrawAll tests', function() {
        let adapter: any;
        let usdc: any;
        let aUsdc: any;
        let vault: any;
        let other: any;

        this.beforeEach(async () => {
            ({ adapter, usdc, aUsdc, vault, other } = await networkHelpers.loadFixture(deployAdapterAave));
        });

        it('withdrawAll should revert if not called by vault', async function() {
            await expect(adapter.connect(other).withdrawAll())
                .to.be.revertedWithCustomError(adapter, 'OnlyVault');
        });

        it('withdrawAll should return early without reverting when aUSDC balance is zero', async function() {
            expect(await aUsdc.balanceOf(await adapter.getAddress())).to.equal(0n);
            await adapter.connect(vault).withdrawAll();
        });

        it('withdrawAll should withdraw entire aUSDC balance and return USDC to vault', async function() {
            await adapter.connect(vault).deposit(DEPOSIT);
            await adapter.connect(vault).withdrawAll();
            expect(await usdc.balanceOf(vault.address)).to.equal(DEPOSIT);
            expect(await aUsdc.balanceOf(await adapter.getAddress())).to.equal(0n);
        });
    });

    describe('balanceInUSDC tests', function() {
        let adapter: any;
        let vault: any;

        this.beforeEach(async () => {
            ({ adapter, vault } = await networkHelpers.loadFixture(deployAdapterAave));
        });

        it('balanceInUSDC should return zero before any deposit', async function() {
            expect(await adapter.balanceInUSDC()).to.equal(0n);
        });

        it('balanceInUSDC should return aUSDC balance equal to deposited amount', async function() {
            await adapter.connect(vault).deposit(DEPOSIT);
            expect(await adapter.balanceInUSDC()).to.equal(DEPOSIT);
        });
    });

    describe('revokeApprovals tests', function() {
        let adapter: any;
        let usdc: any;
        let aavePool: any;
        let vault: any;
        let other: any;

        this.beforeEach(async () => {
            ({ adapter, usdc, aavePool, vault, other } = await networkHelpers.loadFixture(deployAdapterAave));
        });

        it('revokeApprovals should revert if not called by vault', async function() {
            await expect(adapter.connect(other).revokeApprovals())
                .to.be.revertedWithCustomError(adapter, 'OnlyVault');
        });

        it('revokeApprovals should set USDC allowance to zero for aavePool', async function() {
            await adapter.connect(vault).revokeApprovals();
            expect(await usdc.allowance(await adapter.getAddress(), await aavePool.getAddress()))
                .to.equal(0n);
        });
    });
});
