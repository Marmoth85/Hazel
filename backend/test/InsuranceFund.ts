import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.connect();

async function deployInsuranceFundNoVault() {
    const [owner, other, victim] = await ethers.getSigners();
    const mockVaultToken = await ethers.deployContract('MockERC20', ['HazelStable', 'hzUSDC', 9n]);
    const insuranceFund = await ethers.deployContract('InsuranceFund', [ethers.ZeroAddress]);
    return { mockVaultToken, insuranceFund, owner, other, victim };
}

async function deployInsuranceFund() {
    const [owner, other, victim] = await ethers.getSigners();

    const mockVaultToken = await ethers.deployContract('MockERC20', ['HazelStable', 'hzUSDC', 9n]);
    const insuranceFund  = await ethers.deployContract('InsuranceFund', [await mockVaultToken.getAddress()]);

    return { mockVaultToken, insuranceFund, owner, other, victim };
}

async function deployInsuranceFundFunded() {
    const ctx = await deployInsuranceFund();
    const { mockVaultToken, insuranceFund } = ctx;

    const FUND_AMOUNT = 1_000n * 10n ** 9n;
    await mockVaultToken.mint(await insuranceFund.getAddress(), FUND_AMOUNT);

    return { ...ctx, FUND_AMOUNT };
}


describe('InsuranceFund tests', function() {

    describe('Deployment tests', function() {
        let insuranceFund: any;
        let mockVaultToken: any;

        this.beforeEach(async () => {
            ({ insuranceFund, mockVaultToken } = await networkHelpers.loadFixture(deployInsuranceFund));
        });

        it('InsuranceFund should store the vault token address after deployment', async function() {
            expect(await insuranceFund.vault()).to.equal(await mockVaultToken.getAddress());
        });

        it('InsuranceFund should have zero balance at deployment', async function() {
            expect(await insuranceFund.sharesBalance()).to.equal(0n);
        });
    });

    describe('setVault tests', function() {
        let insuranceFund: any;
        let mockVaultToken: any;
        let owner: any;
        let other: any;

        it('setVault should revert if called by non-owner', async function() {
            ({ insuranceFund, other } = await networkHelpers.loadFixture(deployInsuranceFund));
            await expect(insuranceFund.connect(other).setVault(other.address))
                .to.be.revertedWithCustomError(insuranceFund, 'OwnableUnauthorizedAccount');
        });

        it('setVault should revert if vault is already set', async function() {
            ({ insuranceFund, owner, other } = await networkHelpers.loadFixture(deployInsuranceFund));
            await expect(insuranceFund.connect(owner).setVault(other.address))
                .to.be.revertedWithCustomError(insuranceFund, 'VaultAlreadySet');
        });

        it('setVault should revert if new address is zero', async function() {
            ({ insuranceFund, owner } = await networkHelpers.loadFixture(deployInsuranceFundNoVault));
            await expect(insuranceFund.connect(owner).setVault(ethers.ZeroAddress))
                .to.be.revertedWithCustomError(insuranceFund, 'ZeroAddress');
        });

        it('setVault should set the vault address when unset', async function() {
            ({ insuranceFund, mockVaultToken, owner } = await networkHelpers.loadFixture(deployInsuranceFundNoVault));
            await insuranceFund.connect(owner).setVault(await mockVaultToken.getAddress());
            expect(await insuranceFund.vault()).to.equal(await mockVaultToken.getAddress());
        });
    });

    describe('sharesBalance tests', function() {
        let insuranceFund: any;
        let FUND_AMOUNT: bigint;

        this.beforeEach(async () => {
            ({ insuranceFund, FUND_AMOUNT } = await networkHelpers.loadFixture(deployInsuranceFundFunded));
        });

        it('sharesBalance should return correct balance after receiving fee shares', async function() {
            expect(await insuranceFund.sharesBalance()).to.equal(FUND_AMOUNT);
        });
    });

    describe('payout tests', function() {
        let insuranceFund: any;
        let mockVaultToken: any;
        let owner: any;
        let other: any;
        let victim: any;
        let FUND_AMOUNT: bigint;

        this.beforeEach(async () => {
            ({ insuranceFund, mockVaultToken, owner, other, victim, FUND_AMOUNT } =
                await networkHelpers.loadFixture(deployInsuranceFundFunded));
        });

        it('payout should revert if called by non-owner', async function() {
            await expect(insuranceFund.connect(other).payout(victim.address, 100n))
                .to.be.revertedWithCustomError(insuranceFund, 'OwnableUnauthorizedAccount');
        });

        it('payout should revert if vault is not set', async function() {
            const { insuranceFund: fund, owner: o, victim: v } = await networkHelpers.loadFixture(deployInsuranceFundNoVault);
            await expect(fund.connect(o).payout(v.address, 100n))
                .to.be.revertedWithCustomError(fund, 'VaultNotSet');
        });

        it('payout should revert if recipient is the zero address', async function() {
            await expect(insuranceFund.connect(owner).payout(ethers.ZeroAddress, 100n))
                .to.be.revertedWithCustomError(insuranceFund, 'ZeroAddress');
        });

        it('payout should transfer shares to the victim', async function() {
            const PAYOUT = 500n * 10n ** 9n;
            await insuranceFund.connect(owner).payout(victim.address, PAYOUT);
            expect(await mockVaultToken.balanceOf(victim.address)).to.equal(PAYOUT);
        });

        it('payout should decrease fund balance after payout', async function() {
            const PAYOUT = 500n * 10n ** 9n;
            await insuranceFund.connect(owner).payout(victim.address, PAYOUT);
            expect(await insuranceFund.sharesBalance()).to.equal(FUND_AMOUNT - PAYOUT);
        });

        it('payout should emit InsurancePayoutExecuted event', async function() {
            const PAYOUT = 500n * 10n ** 9n;
            await expect(insuranceFund.connect(owner).payout(victim.address, PAYOUT))
                .to.emit(insuranceFund, 'InsurancePayoutExecuted')
                .withArgs(victim.address, PAYOUT);
        });

        it('payout should revert if payout exceeds available balance', async function() {
            await expect(insuranceFund.connect(owner).payout(victim.address, FUND_AMOUNT + 1n))
                .to.be.revertedWithCustomError(mockVaultToken, 'ERC20InsufficientBalance');
        });
    });
});
