import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

const SHARES = 10_000n * 10n ** 9n;
const BPS = 10_000n;

async function deployRevenueDistributor() {
    const [owner, treasury, assoc1, assoc2, other] = await ethers.getSigners();

    const mockVaultToken = await ethers.deployContract('MockERC20', ['HazelStable', 'hzUSDC', 9n]);
    const insuranceFund = await ethers.deployContract('InsuranceFund', [await mockVaultToken.getAddress()]);
    const revenueDistributor = await ethers.deployContract('RevenueDistributor', [
        treasury.address,
        await insuranceFund.getAddress()
    ]);

    return { mockVaultToken, insuranceFund, revenueDistributor, owner, treasury, assoc1, assoc2, other };
}

async function deployRevenueDistributorWithVault() {
    const ctx = await deployRevenueDistributor();
    const { mockVaultToken, revenueDistributor, owner } = ctx;

    await revenueDistributor.connect(owner).addVault(await mockVaultToken.getAddress());

    return ctx;
}

async function deployRevenueDistributorFunded() {
    const ctx = await deployRevenueDistributorWithVault();
    const { mockVaultToken, revenueDistributor } = ctx;

    await mockVaultToken.mint(await revenueDistributor.getAddress(), SHARES);

    return ctx;
}

describe('RevenueDistributor tests', function() {

    describe('Deployment tests', function() {
        let revenueDistributor: any;
        let treasury: any;
        let insuranceFund: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, treasury, insuranceFund } = await networkHelpers.loadFixture(deployRevenueDistributor));
        });

        it('Deployment should revert if treasury is zero address', async function() {
            await expect(ethers.deployContract('RevenueDistributor', [ethers.ZeroAddress, insuranceFund.getAddress()]))
                .to.be.revertedWithCustomError({ interface: (await ethers.getContractFactory('RevenueDistributor')).interface } as any, 'ZeroAddress');
        });

        it('Deployment should revert if insuranceFund is zero address', async function() {
            await expect(ethers.deployContract('RevenueDistributor', [treasury.address, ethers.ZeroAddress]))
                .to.be.revertedWithCustomError({ interface: (await ethers.getContractFactory('RevenueDistributor')).interface } as any, 'ZeroAddress');
        });

        it('RevenueDistributor should store the treasury address after deployment', async function() {
            expect(await revenueDistributor.treasury()).to.equal(treasury.address);
        });

        it('RevenueDistributor should store the insurance fund address after deployment', async function() {
            expect(await revenueDistributor.insuranceFund()).to.equal(await insuranceFund.getAddress());
        });

        it('RevenueDistributor should have correct default treasury share (10%) after deployment', async function() {
            expect(await revenueDistributor.treasuryWeight()).to.equal(1_000n);
        });

        it('RevenueDistributor should have correct default association share (25%) after deployment', async function() {
            expect(await revenueDistributor.associationWeight()).to.equal(2_500n);
        });

        it('RevenueDistributor should have correct default insurance share (10%) after deployment', async function() {
            expect(await revenueDistributor.insuranceWeight()).to.equal(1_000n);
        });

        it('RevenueDistributor should have zero vaults at deployment', async function() {
            expect(await revenueDistributor.vaultCount()).to.equal(0n);
        });

        it('RevenueDistributor should have default maxAssociations of 10', async function() {
            expect(await revenueDistributor.maxAssociations()).to.equal(10n);
        });
    });

    describe('addVault tests', function() {
        let revenueDistributor: any;
        let mockVaultToken: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, mockVaultToken, owner, other } = await networkHelpers.loadFixture(deployRevenueDistributor));
        });

        it('addVault should revert if called by non-owner', async function() {
            await expect(revenueDistributor.connect(other).addVault(await mockVaultToken.getAddress()))
                .to.be.revertedWithCustomError(revenueDistributor, 'OwnableUnauthorizedAccount');
        });

        it('addVault should revert if address is zero', async function() {
            await expect(revenueDistributor.connect(owner).addVault(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(revenueDistributor, 'ZeroAddress');
        });

        it('addVault should revert if vault already added', async function() {
            await revenueDistributor.connect(owner).addVault(await mockVaultToken.getAddress());
            await expect(revenueDistributor.connect(owner).addVault(await mockVaultToken.getAddress()))
                .to.be.revertedWithCustomError(revenueDistributor, 'AlreadyAdded');
        });

        it('addVault should add vault and increment vaultCount', async function() {
            await revenueDistributor.connect(owner).addVault(await mockVaultToken.getAddress());
            expect(await revenueDistributor.vaultCount()).to.equal(1n);
            expect(await revenueDistributor.vaults(0n)).to.equal(await mockVaultToken.getAddress());
        });

        it('addVault should emit VaultAdded event', async function() {
            await expect(revenueDistributor.connect(owner).addVault(await mockVaultToken.getAddress()))
                .to.emit(revenueDistributor, 'VaultAdded')
                .withArgs(await mockVaultToken.getAddress());
        });
    });

    describe('removeVault tests', function() {
        let revenueDistributor: any;
        let mockVaultToken: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, mockVaultToken, owner, other } = await networkHelpers.loadFixture(deployRevenueDistributorWithVault));
        });

        it('removeVault should revert if called by non-owner', async function() {
            await expect(revenueDistributor.connect(other).removeVault(await mockVaultToken.getAddress()))
                .to.be.revertedWithCustomError(revenueDistributor, 'OwnableUnauthorizedAccount');
        });

        it('removeVault should revert if vault not found', async function() {
            await expect(revenueDistributor.connect(owner).removeVault(other.address))
                .to.be.revertedWithCustomError(revenueDistributor, 'NotFound');
        });

        it('removeVault should remove vault and decrement vaultCount', async function() {
            await revenueDistributor.connect(owner).removeVault(await mockVaultToken.getAddress());
            expect(await revenueDistributor.vaultCount()).to.equal(0n);
        });

        it('removeVault should emit VaultRemoved event', async function() {
            await expect(revenueDistributor.connect(owner).removeVault(await mockVaultToken.getAddress()))
                .to.emit(revenueDistributor, 'VaultRemoved')
                .withArgs(await mockVaultToken.getAddress());
        });
    });

    describe('distribute tests', function() {
        let revenueDistributor: any;
        let mockVaultToken: any;
        let insuranceFund: any;
        let treasury: any;
        let assoc1: any;
        let assoc2: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, mockVaultToken, insuranceFund, treasury, assoc1, assoc2, owner, other } =
                await networkHelpers.loadFixture(deployRevenueDistributorFunded));
        });

        it('distribute should revert if called by non-owner', async function() {
            await expect(revenueDistributor.connect(other).distribute())
                .to.be.revertedWithCustomError(revenueDistributor, 'OwnableUnauthorizedAccount');
        });

        it('distribute should revert if nothing to distribute', async function() {
            const { revenueDistributor: emptyRD, owner: o } = await networkHelpers.loadFixture(deployRevenueDistributorWithVault);
            await expect(emptyRD.connect(o).distribute())
                .to.be.revertedWithCustomError(emptyRD, 'NothingToDistribute');
        });

        it('distribute should send 10% of shares to treasury by default', async function() {
            await revenueDistributor.connect(owner).distribute();
            expect(await mockVaultToken.balanceOf(treasury.address)).to.equal(SHARES * 1_000n / BPS);
        });

        it('distribute should send 10% of shares to insurance fund by default', async function() {
            await revenueDistributor.connect(owner).distribute();
            expect(await mockVaultToken.balanceOf(await insuranceFund.getAddress())).to.equal(SHARES * 1_000n / BPS);
        });

        it('distribute should distribute shares proportionally to associations', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await revenueDistributor.connect(owner).addAssociation(assoc2.address, "Assoc Two");
            await revenueDistributor.connect(owner).setAssociations(
                [assoc1.address, assoc2.address],
                [3_000, 7_000]
            );
            await revenueDistributor.connect(owner).distribute();

            const totalAssocShares = SHARES * 2_500n / BPS;
            expect(await mockVaultToken.balanceOf(assoc1.address)).to.equal(totalAssocShares * 3_000n / BPS);
            expect(await mockVaultToken.balanceOf(assoc2.address)).to.equal(totalAssocShares * 7_000n / BPS);
        });

        it('distribute should emit RevenueDistributed event with vault address', async function() {
            const toTreasury = SHARES * 1_000n / BPS;
            const toAssociations = SHARES * 2_500n / BPS;
            const toInsurance = SHARES * 1_000n / BPS;
            await expect(revenueDistributor.connect(owner).distribute())
                .to.emit(revenueDistributor, 'RevenueDistributed')
                .withArgs(await mockVaultToken.getAddress(), SHARES, toTreasury, toAssociations, toInsurance);
        });

        it('distribute should leave residual (55%) in contract', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await revenueDistributor.connect(owner).setAssociations([assoc1.address], [10_000]);
            await revenueDistributor.connect(owner).distribute();
            const residual = SHARES * 5_500n / BPS;
            expect(await mockVaultToken.balanceOf(await revenueDistributor.getAddress()))
                .to.be.closeTo(residual, 1n);
        });

        it('distribute should distribute across multiple vaults in one call', async function() {
            const [owner] = await ethers.getSigners();
            const mockVaultToken2 = await ethers.deployContract('MockERC20', ['HazelBTC', 'hzBTC', 9n]);
            await revenueDistributor.connect(owner).addVault(await mockVaultToken2.getAddress());
            await mockVaultToken2.mint(await revenueDistributor.getAddress(), SHARES);

            await revenueDistributor.connect(owner).distribute();

            const expected = SHARES * 1_000n / BPS;
            expect(await mockVaultToken.balanceOf(treasury.address)).to.equal(expected);
            expect(await mockVaultToken2.balanceOf(treasury.address)).to.equal(expected);
        });

        it('distribute should skip vault with zero balance', async function() {
            const [owner] = await ethers.getSigners();
            const emptyVault = await ethers.deployContract('MockERC20', ['Empty', 'MT', 9n]);
            await revenueDistributor.connect(owner).addVault(await emptyVault.getAddress());

            await revenueDistributor.connect(owner).distribute();
            expect(await emptyVault.balanceOf(treasury.address)).to.equal(0n);
        });

        it('distribute should skip associations bucket when no associations registered', async function() {
            await revenueDistributor.connect(owner).distribute();
            expect(await mockVaultToken.balanceOf(await revenueDistributor.getAddress()))
                .to.equal(SHARES - SHARES * 1_000n / BPS - SHARES * 1_000n / BPS);
        });

        it('distribute should skip associations bucket when totalAssocWeight is zero', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            expect(await revenueDistributor.totalAssocWeight()).to.equal(0n);

            await revenueDistributor.connect(owner).distribute();
            expect(await mockVaultToken.balanceOf(assoc1.address)).to.equal(0n);
        });

        it('distribute should distribute with BPS weights summing to 10000', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await revenueDistributor.connect(owner).addAssociation(assoc2.address, "Assoc Two");
            await revenueDistributor.connect(owner).setAssociations(
                [assoc1.address, assoc2.address],
                [4_000, 6_000]
            );
            expect(await revenueDistributor.totalAssocWeight()).to.equal(10_000n);

            await revenueDistributor.connect(owner).distribute();

            const totalAssocShares = SHARES * 2_500n / BPS;
            expect(await mockVaultToken.balanceOf(assoc1.address)).to.equal(totalAssocShares * 4_000n / BPS);
            expect(await mockVaultToken.balanceOf(assoc2.address)).to.equal(totalAssocShares * 6_000n / BPS);
        });
    });

    describe('setProtocolTreasury tests', function() {
        let revenueDistributor: any;
        let owner: any;
        let other: any;
        let treasury: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, owner, other, treasury } = await networkHelpers.loadFixture(deployRevenueDistributor));
        });

        it('setProtocolTreasury should revert if called by non-owner', async function() {
            await expect(revenueDistributor.connect(other).setProtocolTreasury(other.address))
                .to.be.revertedWithCustomError(revenueDistributor, 'OwnableUnauthorizedAccount');
        });

        it('setProtocolTreasury should revert if new treasury is zero address', async function() {
            await expect(revenueDistributor.connect(owner).setProtocolTreasury(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(revenueDistributor, 'ZeroAddress');
        });

        it('setProtocolTreasury should update the treasury address', async function() {
            await revenueDistributor.connect(owner).setProtocolTreasury(other.address);
            expect(await revenueDistributor.treasury()).to.equal(other.address);
        });

        it('setProtocolTreasury should emit TreasuryUpdated event', async function() {
            await expect(revenueDistributor.connect(owner).setProtocolTreasury(other.address))
                .to.emit(revenueDistributor, 'TreasuryUpdated')
                .withArgs(treasury.address, other.address);
        });
    });

    describe('setShares tests', function() {
        let revenueDistributor: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, owner, other } = await networkHelpers.loadFixture(deployRevenueDistributor));
        });

        it('setShares should revert if called by non-owner', async function() {
            await expect(revenueDistributor.connect(other).setShares(2_000n, 3_000n, 1_000n))
                .to.be.revertedWithCustomError(revenueDistributor, 'OwnableUnauthorizedAccount');
        });

        it('setShares should revert if the sum exceeds 100%', async function() {
            await expect(revenueDistributor.connect(owner).setShares(4_000n, 4_000n, 4_000n))
                .to.be.revertedWithCustomError(revenueDistributor, 'SharesExceedBasisPoints');
        });

        it('setShares should update treasury, association and insurance shares', async function() {
            await revenueDistributor.connect(owner).setShares(2_000n, 3_000n, 1_000n);
            expect(await revenueDistributor.treasuryWeight()).to.equal(2_000n);
            expect(await revenueDistributor.associationWeight()).to.equal(3_000n);
            expect(await revenueDistributor.insuranceWeight()).to.equal(1_000n);
        });

    });

    describe('Associations tests', function() {
        let revenueDistributor: any;
        let owner: any;
        let other: any;
        let assoc1: any;
        let assoc2: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, owner, other, assoc1, assoc2 } = await networkHelpers.loadFixture(deployRevenueDistributor));
        });

        it('addAssociation should revert if not owner', async function() {
            await expect(revenueDistributor.connect(other).addAssociation(assoc1.address, "Assoc One"))
                .to.be.revertedWithCustomError(revenueDistributor, 'OwnableUnauthorizedAccount');
        });

        it('addAssociation should revert if address is zero', async function() {
            await expect(revenueDistributor.connect(owner).addAssociation(ethers.ZeroAddress, "Assoc One"))
                .to.be.revertedWithCustomError(revenueDistributor, 'ZeroAddress');
        });

        it('addAssociation should revert if maxAssociations reached', async function() {
            await revenueDistributor.connect(owner).setMaxAssociations(1n);
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await expect(revenueDistributor.connect(owner).addAssociation(assoc2.address, "Assoc Two"))
                .to.be.revertedWithCustomError(revenueDistributor, 'MaxAssociationsReached');
        });

        it('addAssociation should add with weight 0 and not change totalAssocWeight', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            expect(await revenueDistributor.associationCount()).to.equal(1n);
            expect(await revenueDistributor.totalAssocWeight()).to.equal(0n);
            const stored = await revenueDistributor.associations(0n);
            expect(stored[1]).to.equal(0n);
        });

        it('addAssociation should emit AssociationAdded with name', async function() {
            await expect(revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One"))
                .to.emit(revenueDistributor, 'AssociationAdded')
                .withArgs(assoc1.address, "Assoc One");
        });

        it('addAssociation should revert removeAssociation if index out of bounds', async function() {
            await expect(revenueDistributor.connect(owner).removeAssociation(0n))
                .to.be.revertedWithCustomError(revenueDistributor, 'IndexOutOfBounds');
        });

        it('removeAssociation should allow removal when weight is zero', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await revenueDistributor.connect(owner).removeAssociation(0n);
            expect(await revenueDistributor.associationCount()).to.equal(0n);
            expect(await revenueDistributor.totalAssocWeight()).to.equal(0n);
        });

        it('removeAssociation should revert if weight is not zero', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await revenueDistributor.connect(owner).addAssociation(assoc2.address, "Assoc Two");
            await revenueDistributor.connect(owner).setAssociations(
                [assoc1.address, assoc2.address],
                [3_000, 7_000]
            );
            await expect(revenueDistributor.connect(owner).removeAssociation(0n))
                .to.be.revertedWithCustomError(revenueDistributor, 'WeightNotZero');
        });

        it('removeAssociation should emit AssociationRemoved', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await expect(revenueDistributor.connect(owner).removeAssociation(0n))
                .to.emit(revenueDistributor, 'AssociationRemoved')
                .withArgs(assoc1.address);
        });
    });

    describe('setAssociations tests', function() {
        let revenueDistributor: any;
        let owner: any;
        let other: any;
        let assoc1: any;
        let assoc2: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, owner, other, assoc1, assoc2 } = await networkHelpers.loadFixture(deployRevenueDistributor));
        });

        it('setAssociations should revert if not owner', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await expect(revenueDistributor.connect(other).setAssociations([assoc1.address], [10_000]))
                .to.be.revertedWithCustomError(revenueDistributor, 'OwnableUnauthorizedAccount');
        });

        it('setAssociations should revert if lengths mismatch between addrs and weights', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await expect(revenueDistributor.connect(owner).setAssociations([assoc1.address], [5_000, 5_000]))
                .to.be.revertedWithCustomError(revenueDistributor, 'LengthMismatch');
        });

        it('setAssociations should revert if lengths mismatch with registered associations', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await revenueDistributor.connect(owner).addAssociation(assoc2.address, "Assoc Two");
            await expect(revenueDistributor.connect(owner).setAssociations([assoc1.address], [10_000]))
                .to.be.revertedWithCustomError(revenueDistributor, 'LengthMismatch');
        });

        it('setAssociations should revert if sum != 10000 for non-empty array', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await revenueDistributor.connect(owner).addAssociation(assoc2.address, "Assoc Two");
            await expect(revenueDistributor.connect(owner).setAssociations(
                [assoc1.address, assoc2.address],
                [3_000, 3_000]
            )).to.be.revertedWithCustomError(revenueDistributor, 'WeightsSumMismatch');
        });

        it('setAssociations should revert if address is zero', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await expect(revenueDistributor.connect(owner).setAssociations(
                [ethers.ZeroAddress],
                [10_000]
            )).to.be.revertedWithCustomError(revenueDistributor, 'ZeroAddress');
        });

        it('setAssociations should revert if exceeds maxAssociations (via addAssociation guard)', async function() {
            await revenueDistributor.connect(owner).setMaxAssociations(2n);
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await revenueDistributor.connect(owner).addAssociation(assoc2.address, "Assoc Two");
            await expect(revenueDistributor.connect(owner).addAssociation(other.address, "Assoc Three"))
                .to.be.revertedWithCustomError(revenueDistributor, 'MaxAssociationsReached');
        });

        it('setAssociations should allow empty array and set totalAssocWeight to 0', async function() {
            await expect(revenueDistributor.connect(owner).setAssociations([], []))
                .to.emit(revenueDistributor, 'AssociationsUpdated');
            expect(await revenueDistributor.totalAssocWeight()).to.equal(0n);
            expect(await revenueDistributor.associationCount()).to.equal(0n);
        });

        it('setAssociations should set weights and totalAssocWeight correctly', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await revenueDistributor.connect(owner).addAssociation(assoc2.address, "Assoc Two");
            await revenueDistributor.connect(owner).setAssociations(
                [assoc1.address, assoc2.address],
                [3_000, 7_000]
            );
            expect(await revenueDistributor.totalAssocWeight()).to.equal(10_000n);
            const a1 = await revenueDistributor.associations(0n);
            const a2 = await revenueDistributor.associations(1n);
            expect(a1[1]).to.equal(3_000n);
            expect(a2[1]).to.equal(7_000n);
        });

        it('setAssociations should emit AssociationsUpdated', async function() {
            await revenueDistributor.connect(owner).addAssociation(assoc1.address, "Assoc One");
            await expect(revenueDistributor.connect(owner).setAssociations([assoc1.address], [10_000]))
                .to.emit(revenueDistributor, 'AssociationsUpdated');
        });
    });

    describe('setMaxAssociations tests', function() {
        let revenueDistributor: any;
        let owner: any;
        let other: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, owner, other } = await networkHelpers.loadFixture(deployRevenueDistributor));
        });

        it('setMaxAssociations should revert if called by non-owner', async function() {
            await expect(revenueDistributor.connect(other).setMaxAssociations(5n))
                .to.be.revertedWithCustomError(revenueDistributor, 'OwnableUnauthorizedAccount');
        });

        it('setMaxAssociations should revert if max is zero', async function() {
            await expect(revenueDistributor.connect(owner).setMaxAssociations(0n))
                .to.be.revertedWithCustomError(revenueDistributor, 'ZeroAmount');
        });

        it('setMaxAssociations should update maxAssociations', async function() {
            await revenueDistributor.connect(owner).setMaxAssociations(20n);
            expect(await revenueDistributor.maxAssociations()).to.equal(20n);
        });
    });

    describe('claim tests', function() {
        let revenueDistributor: any;
        let mockVaultToken: any;
        let owner: any;
        let other: any;
        let treasury: any;

        this.beforeEach(async () => {
            ({ revenueDistributor, mockVaultToken, owner, other, treasury } = await networkHelpers.loadFixture(deployRevenueDistributorFunded));
        });

        it('claim should revert if called by non-owner', async function() {
            await expect(revenueDistributor.connect(other).claim())
                .to.be.revertedWithCustomError(revenueDistributor, 'OwnableUnauthorizedAccount');
        });

        it('claim should send all held shares to treasury', async function() {
            await revenueDistributor.connect(owner).claim();
            expect(await mockVaultToken.balanceOf(treasury.address)).to.equal(SHARES);
            expect(await mockVaultToken.balanceOf(await revenueDistributor.getAddress())).to.equal(0n);
        });

        it('claim should emit TreasuryClaimed event with vault address', async function() {
            await expect(revenueDistributor.connect(owner).claim())
                .to.emit(revenueDistributor, 'TreasuryClaimed')
                .withArgs(await mockVaultToken.getAddress(), SHARES, treasury.address);
        });

        it('claim should revert if nothing to claim', async function() {
            const { revenueDistributor: emptyRD, owner: o } = await networkHelpers.loadFixture(deployRevenueDistributorWithVault);
            await expect(emptyRD.connect(o).claim())
                .to.be.revertedWithCustomError(emptyRD, 'NothingToClaim');
        });

        it('claim should claim across multiple vaults', async function() {
            const [, , , , , vaultUser] = await ethers.getSigners();
            const mockVaultToken2 = await ethers.deployContract('MockERC20', ['HazelBTC', 'hzBTC', 9n]);
            await revenueDistributor.connect(owner).addVault(await mockVaultToken2.getAddress());
            await mockVaultToken2.mint(await revenueDistributor.getAddress(), SHARES);

            await revenueDistributor.connect(owner).claim();

            expect(await mockVaultToken.balanceOf(treasury.address)).to.equal(SHARES);
            expect(await mockVaultToken2.balanceOf(treasury.address)).to.equal(SHARES);
        });
    });
});
