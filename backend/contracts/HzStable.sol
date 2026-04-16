// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAdapter} from "./interfaces/IAdapter.sol";
import {IGovStaking} from "./interfaces/IGovStaking.sol";

/// @title HzStable
/// @notice ERC-4626 vault that accepts USDC deposits and generates yield through a pluggable
///         strategy adapter. Minted shares are automatically staked in GovStaking on behalf
///         of the depositor, so shares never reside in the user's wallet.
/// @dev Shares use a `_decimalsOffset` of 3, giving 9-decimal precision against 6-decimal USDC.
///      Yield is captured via a permissionless `harvest()` function that mints dilutive fee
///      shares to `revenueDistributor` only when `currentPrice > highWaterMark`.
///      The strategy adapter is swappable via `setAdapter()` without redeploying the vault.
contract HzStable is ERC4626, Ownable {

    using SafeERC20 for IERC20;

    uint16 private constant BASIS_POINTS = 10_000;
    uint256 private constant MIN_INTERVAL = 1 hours;
    uint256 private constant MAX_INTERVAL = 30 days;

    /// @notice Current strategy adapter used for yield generation.
    IAdapter public strategyAdapter;

    /// @notice Address of the RevenueDistributor contract that receives fee shares on harvest.
    address public revenueDistributor;

    /// @notice Address used as the protocol treasury reference within the vault.
    address public protocolTreasury;

    /// @notice GovStaking contract where depositor shares are auto-staked.
    IGovStaking public govStaking;

    /// @notice All-time high price per share (in USDC). Fees are only minted when current PPS exceeds this.
    uint256 public highWaterMark;

    /// @notice Unix timestamp of the last successful harvest.
    uint48 public lastHarvest;

    /// @notice Minimum seconds between two harvests.
    uint32 public harvestInterval;

    /// @notice Fee rate applied to yield, expressed in basis points (1 BPS = 0.01%).
    uint16 public feeRate;

    error HarvestNotReady();
    error InvalidInterval();
    error FeeTooHigh();
    error ZeroAddress();
    error AdapterNotSet();
    error GovStakingNotSet();
    error GovStakingAlreadySet();

    event Harvested(uint256 totalYield, uint256 sharesMinted, uint256 newPricePerShare);
    event FeesMinted(address indexed to, uint256 shares);
    event AdapterUpdated(address indexed oldAdapter, address indexed newAdapter);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event HarvestIntervalUpdated(uint256 oldInterval, uint256 newInterval);

    /// @dev Reverts if called before `harvestInterval` seconds have elapsed since `lastHarvest`.
    modifier harvestReady() {
        if (block.timestamp < lastHarvest + harvestInterval) revert HarvestNotReady();
        _;
    }

    /// @notice Deploys the vault.
    /// @dev The strategy adapter can be set to `address(0)` at construction time and wired later
    ///      via `setAdapter()` to avoid circular deployment dependencies.
    ///      `govStaking` must be set separately via `setGovStaking()` before any deposit.
    /// @param _underlyingAsset     ERC-20 asset accepted by the vault (USDC).
    /// @param _strategyAdapter     Initial adapter address, or `address(0)` for deferred wiring.
    /// @param _revenueDistributor  RevenueDistributor contract that receives fee shares.
    /// @param _treasury            Protocol treasury address stored as a reference.
    /// @param _harvestInterval     Seconds between harvests. Must be in [1 hour, 30 days].
    /// @param _feeRate             Performance fee in BPS. Must be ≤ 10 000.
    constructor(address _underlyingAsset, address _strategyAdapter, address _revenueDistributor, address _treasury, uint256 _harvestInterval, uint256 _feeRate)
        ERC4626(IERC20(_underlyingAsset)) ERC20("HazelStable", "hzUSDC") Ownable(msg.sender) {

        if (_harvestInterval < MIN_INTERVAL || _harvestInterval > MAX_INTERVAL) revert InvalidInterval();
        if (_feeRate > BASIS_POINTS) revert FeeTooHigh();
        if (_revenueDistributor == address(0) || _treasury == address(0)) revert ZeroAddress();

        strategyAdapter = IAdapter(_strategyAdapter);
        revenueDistributor = _revenueDistributor;
        protocolTreasury = _treasury;
        harvestInterval = uint32(_harvestInterval);
        feeRate = uint16(_feeRate);
        lastHarvest = uint48(block.timestamp);

        if (_strategyAdapter != address(0)) {
            IERC20(_underlyingAsset).forceApprove(_strategyAdapter, type(uint256).max);
        }
    }

    /// @dev Returns 3, giving shares 9-decimal precision against 6-decimal USDC.
    function _decimalsOffset() internal pure override returns (uint8) {
        return 3;
    }

    /// @notice Returns the total USDC balance managed by the current strategy adapter.
    /// @dev Returns 0 if no adapter is set, preventing reverts during the deployment window.
    function totalAssets() public view override returns (uint256) {
        if (address(strategyAdapter) == address(0)) return 0;
        return strategyAdapter.balanceInUSDC();
    }

    /// @notice Returns the maximum number of shares that `owner` can redeem.
    /// @dev Reads from `govStaking.stakedAmountOf()` because shares are held in GovStaking,
    ///      not in the owner's wallet. Falls back to the standard ERC-4626 implementation
    ///      if GovStaking has not been wired yet.
    /// @param owner Address to query.
    function maxRedeem(address owner) public view override returns (uint256) {
        if (address(govStaking) == address(0)) return super.maxRedeem(owner);
        return govStaking.stakedAmountOf(owner, address(this));
    }

    /// @notice Returns the maximum USDC amount that `owner` can withdraw.
    /// @param owner Address to query.
    function maxWithdraw(address owner) public view override returns (uint256) {
        return convertToAssets(maxRedeem(owner));
    }

    /// @notice Deposits `assets` USDC and credits `shares` to `receiver` via auto-staking.
    /// @dev CEI order: transfer assets → deposit to adapter → mint shares to vault → approve
    ///      GovStaking → stakeOnBehalf. Shares never reach the receiver's wallet through this path.
    ///      Reverts if the adapter or GovStaking has not been set.
    function _deposit(address caller, address receiver, uint256 assets, uint256 shares) internal override {
        if (address(strategyAdapter) == address(0)) revert AdapterNotSet();
        if (address(govStaking) == address(0)) revert GovStakingNotSet();

        IERC20(asset()).safeTransferFrom(caller, address(this), assets);
        strategyAdapter.deposit(assets);
        _mint(address(this), shares);
        _approve(address(this), address(govStaking), shares);
        govStaking.stakeOnBehalf(receiver, address(this), shares);

        emit Deposit(caller, receiver, assets, shares);
    }

    /// @notice Withdraws `assets` USDC by burning `shares` from `owner`'s staked position.
    /// @dev CEI order: unstakeOnBehalf (shares return to vault) → burn → adapter withdraw →
    ///      transfer USDC to `receiver`. Spending allowance is consumed if `caller != owner`.
    function _withdraw(address caller, address receiver, address owner, uint256 assets, uint256 shares) internal override {
        if (caller != owner) _spendAllowance(owner, caller, shares);
        govStaking.unstakeOnBehalf(owner, address(this), shares);
        _burn(address(this), shares);
        strategyAdapter.withdraw(assets);
        IERC20(asset()).safeTransfer(receiver, assets);

        emit Withdraw(caller, receiver, owner, assets, shares);
    }

    /// @notice Collects protocol fees by minting dilutive shares to `revenueDistributor`.
    /// @dev Permissionless — any address can trigger once `harvestInterval` has elapsed.
    ///      No fees are minted if `currentPrice <= highWaterMark` (loss or flat period).
    ///      On the very first call after deployment `highWaterMark` is initialised to the
    ///      current PPS without minting any fees.
    ///      Chainlink Automation is expected to call this daily in production.
    function harvest() external harvestReady {
        lastHarvest = uint48(block.timestamp);

        uint256 supply = totalSupply();
        if (supply == 0) return;

        uint256 sharePrecision = 10 ** decimals();
        uint256 currentPrice = convertToAssets(sharePrecision);

        if (highWaterMark == 0) {
            highWaterMark = currentPrice;
            return;
        }

        int256 yieldPerShare = int256(currentPrice) - int256(highWaterMark);
        if (yieldPerShare <= 0) return;

        uint256 totalYield = uint256(yieldPerShare) * supply / sharePrecision;
        uint256 sharesMinted = _mintFeeShares(totalYield, supply);

        highWaterMark = currentPrice;
        emit Harvested(totalYield, sharesMinted, currentPrice);
    }

    /// @notice Mints fee shares to `revenueDistributor` using a dilution formula that preserves
    ///         the post-fee price per share.
    /// @dev Formula derivation: let `x` be shares to mint, `A` = totalAssets, `f` = feeAssets,
    ///      `S` = current supply. We want A/(S+x) = (A-f)/S, which gives x = f*S/(A-f).
    ///      This is pure dilution — no USDC leaves the vault.
    /// @param totalYield Gross yield since last harvest (USDC, 6 decimals).
    /// @param supply     Current total share supply before minting.
    /// @return shares    Number of fee shares minted.
    function _mintFeeShares(uint256 totalYield, uint256 supply) internal returns (uint256) {
        uint256 feeAssets = totalYield * feeRate / BASIS_POINTS;
        if (feeAssets == 0) return 0;

        uint256 assets = totalAssets();
        uint256 shares = feeAssets * supply / (assets - feeAssets);

        _mint(revenueDistributor, shares);
        emit FeesMinted(revenueDistributor, shares);
        return shares;
    }

    /// @notice Replaces the current strategy adapter with `newAdapter`.
    /// @dev Migration order (when an old adapter exists):
    ///      1. `withdrawAll()` — reclaim all USDC from the old protocol.
    ///      2. `revokeApprovals()` — old adapter drops its Aave approval.
    ///      3. `forceApprove(oldAdapter, 0)` — vault drops its approval to old adapter.
    ///      4. Update pointer, grant max approval to new adapter.
    ///      5. Re-deploy the full balance to the new adapter.
    ///      On the first call (no previous adapter), steps 1-3 are skipped.
    /// @param newAdapter Address of the new IAdapter-compliant contract.
    // [DAO-V2] ADAPTER_CHANGE · timelock 48h
    function setAdapter(address newAdapter) external onlyOwner {
        if (newAdapter == address(0)) revert ZeroAddress();
        address oldAdapter = address(strategyAdapter);

        uint256 balance = 0;
        if (oldAdapter != address(0)) {
            balance = strategyAdapter.withdrawAll();
            strategyAdapter.revokeApprovals();
            IERC20(asset()).forceApprove(oldAdapter, 0);
        }

        strategyAdapter = IAdapter(newAdapter);
        IERC20(asset()).forceApprove(newAdapter, type(uint256).max);

        if (balance > 0) strategyAdapter.deposit(balance);

        emit AdapterUpdated(oldAdapter, newAdapter);
    }

    /// @notice Emergency function that revokes the vault's approval to the current adapter
    ///         and calls `revokeApprovals()` on the adapter itself.
    /// @dev Effectively freezes all adapter interactions until a new adapter is set.
    function revokeAdapterApproval() external onlyOwner {
        IERC20(asset()).forceApprove(address(strategyAdapter), 0);
        strategyAdapter.revokeApprovals();
    }

    /// @notice Wires the GovStaking contract. Can only be called once.
    /// @dev Must be called before any deposit. Immutable after set to prevent re-wiring attacks.
    /// @param gs Address of the GovStaking contract.
    function setGovStaking(address gs) external onlyOwner {
        if (address(govStaking) != address(0)) revert GovStakingAlreadySet();
        if (gs == address(0)) revert ZeroAddress();
        govStaking = IGovStaking(gs);
    }

    /// @notice Updates the minimum interval between harvests.
    /// @param interval New interval in seconds. Must be in [1 hour, 30 days].
    // [DAO-V2] PARAMETER_CHANGE · timelock 24h · bounds [1 hour, 30 days]
    function setHarvestInterval(uint256 interval) external onlyOwner {
        if (interval < MIN_INTERVAL || interval > MAX_INTERVAL) revert InvalidInterval();
        uint32 old = harvestInterval;
        harvestInterval = uint32(interval);
        emit HarvestIntervalUpdated(old, interval);
    }

    /// @notice Updates the RevenueDistributor address.
    /// @param rd New RevenueDistributor address.
    // [DAO-V2] PARAMETER_CHANGE · timelock 48h
    function setRevenueDistributor(address rd) external onlyOwner {
        if (rd == address(0)) revert ZeroAddress();
        revenueDistributor = rd;
    }

    /// @notice Updates the protocol treasury address.
    /// @param treasury New treasury address.
    // [DAO-V2] PARAMETER_CHANGE · timelock 24h
    function setProtocolTreasury(address treasury) external onlyOwner {
        if (treasury == address(0)) revert ZeroAddress();
        address old = protocolTreasury;
        protocolTreasury = treasury;
        emit TreasuryUpdated(old, treasury);
    }

    /// @notice Updates the performance fee rate.
    /// @param rate New fee rate in BPS. Must be ≤ 10 000.
    // [DAO-V2] PARAMETER_CHANGE · timelock 48h · bounds [0, 10000]
    function setFeeRate(uint256 rate) external onlyOwner {
        if (rate > BASIS_POINTS) revert FeeTooHigh();
        feeRate = uint16(rate);
    }
}
