// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IGovStaking} from "./interfaces/IGovStaking.sol";
import {IVaultRegistry} from "./interfaces/IVaultRegistry.sol";

/// @title GovStaking
/// @notice Custody contract for vault LP shares that grants holders voting power proportional
///         to their staked amount and lock duration. Longer stakes earn a higher tier multiplier.
/// @dev Tracks each user's position in a double mapping `stakes[user][vault]`.
///      Voting power = `stakedAmount × tierMultiplier(elapsed)` where `elapsed` is derived from
///      a time-weighted average timestamp updated on every deposit.
///
///      Authorization matrix:
///        stake()            — any user (requires vault to be registered)
///        unstake()          — position owner only
///        stakeOnBehalf()    — vault (auto-stake on deposit) or HZL (unwrap flow)
///        unstakeOnBehalf()  — vault only (auto-unstake on withdrawal)
///        withdrawStake()    — HZL only (wrap flow: shares move to HZL pool)
contract GovStaking is Ownable, IGovStaking {

    using SafeERC20 for IERC20;

    /// @notice Staking position for a (user, vault) pair.
    /// @dev `weightedTimestamp` is a time-weighted average of all deposit timestamps,
    ///      used to compute the tier multiplier without iterating past deposits.
    struct StakeInfo {
        uint200 stakedAmount;
        uint56 weightedTimestamp;
    }

    /// @notice Staking positions indexed by user address then vault address.
    mapping(address => mapping(address => StakeInfo)) public stakes;

    /// @notice Address of the Hazel (HZL) liquid restaking token.
    address public hzl;

    /// @notice Vault registry used to validate vault addresses before accepting stakes.
    IVaultRegistry public vaultRegistry;

    uint256 private constant SCALE = 100;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidAmount();
    error Unauthorized();
    error OnlyVault();
    error OnlyHZL();
    error InsufficientStaked();
    error VaultRegistryNotSet();
    error UnauthorizedVault();
    error HZLAlreadySet();
    error RegistryAlreadySet();

    event Staked(address indexed user, address indexed vault, uint256 amount);
    event Unstaked(address indexed user, address indexed vault, uint256 amount);
    event StakeWithdrawn(address indexed user, address indexed vault, uint256 amount);

    constructor() Ownable(msg.sender) {}

    /// @notice Sets the HZL contract address. Can only be called once.
    /// @param _hzl Address of the Hazel (HZL) contract.
    function setHZL(address _hzl) external onlyOwner {
        if (hzl != address(0)) revert HZLAlreadySet();
        if (_hzl == address(0)) revert ZeroAddress();
        hzl = _hzl;
    }

    /// @notice Sets the VaultRegistry contract address. Can only be called once.
    /// @param _vaultRegistry Address of the VaultRegistry contract.
    function setVaultRegistry(address _vaultRegistry) external onlyOwner {
        if (address(vaultRegistry) != address(0)) revert RegistryAlreadySet();
        if (_vaultRegistry == address(0)) revert ZeroAddress();
        vaultRegistry = IVaultRegistry(_vaultRegistry);
    }

    /// @notice Stakes `amount` LP shares of `vault` from the caller's wallet.
    /// @dev Requires `vault` to be registered in VaultRegistry.
    ///      The weighted timestamp is updated to reflect the blended deposit time.
    /// @param vault  Address of the registered vault whose LP shares are staked.
    /// @param amount Number of LP shares to stake.
    function stake(address vault, uint256 amount) external {
        if (address(vaultRegistry) == address(0)) revert VaultRegistryNotSet();
        if (!vaultRegistry.isRegistered(vault)) revert UnauthorizedVault();
        if (amount == 0) revert ZeroAmount();
        _recordStake(msg.sender, vault, amount);
        IERC20(vault).safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(msg.sender, vault, amount);
    }

    /// @notice Unstakes `amount` LP shares of `vault` and returns them to the caller.
    /// @dev Does not update `weightedTimestamp`. A subsequent re-stake will blend the old
    ///      timestamp with the new deposit time, which may reduce the effective tier.
    /// @param vault  Vault address.
    /// @param amount Number of shares to unstake. Must not exceed `stakedAmount`.
    function unstake(address vault, uint256 amount) external {
        StakeInfo storage info = stakes[msg.sender][vault];
        if (amount == 0 || amount > info.stakedAmount) revert InvalidAmount();
        info.stakedAmount -= uint200(amount);
        IERC20(vault).safeTransfer(msg.sender, amount);
        emit Unstaked(msg.sender, vault, amount);
    }

    /// @notice Stakes `amount` LP shares on behalf of `user`.
    /// @dev Authorized callers:
    ///        - The vault itself (auto-stake triggered by `HzStable._deposit()`).
    ///        - The HZL contract (re-stake triggered by `Hazel.unwrap()`).
    ///      Requires `vault` to be registered. Shares are pulled from `msg.sender`.
    /// @param user   Beneficiary of the staked position.
    /// @param vault  Vault whose shares are being staked.
    /// @param amount Number of LP shares.
    function stakeOnBehalf(address user, address vault, uint256 amount) external {
        if (msg.sender != vault && msg.sender != hzl) revert Unauthorized();
        if (address(vaultRegistry) == address(0)) revert VaultRegistryNotSet();
        if (!vaultRegistry.isRegistered(vault)) revert UnauthorizedVault();
        if (amount == 0) revert ZeroAmount();
        _recordStake(user, vault, amount);
        IERC20(vault).safeTransferFrom(msg.sender, address(this), amount);
        emit Staked(user, vault, amount);
    }

    /// @notice Unstakes `amount` LP shares on behalf of `owner` and returns them to the vault.
    /// @dev Callable only by the vault (auto-unstake triggered by `HzStable._withdraw()`).
    ///      Shares are sent to `vault` (not to `owner`) so the vault can burn them and release USDC.
    /// @param user   Owner of the staked position.
    /// @param vault  Vault whose shares are being unstaked.
    /// @param amount Number of shares to unstake.
    function unstakeOnBehalf(address user, address vault, uint256 amount) external {
        if (msg.sender != vault) revert OnlyVault();
        StakeInfo storage info = stakes[user][vault];
        if (amount > info.stakedAmount) revert InsufficientStaked();
        info.stakedAmount -= uint200(amount);
        // Shares are returned to the vault (not the owner) — the vault handles the asset transfer downstream
        IERC20(vault).safeTransfer(vault, amount);
        emit Unstaked(user, vault, amount);
    }

    /// @notice Returns the number of LP shares staked by `user` for `vault`.
    /// @param user  Address to query.
    /// @param vault Vault address.
    function stakedAmountOf(address user, address vault) external view returns (uint256) {
        return stakes[user][vault].stakedAmount;
    }

    /// @notice Transfers `amount` LP shares from `user`'s staked position to the HZL contract.
    /// @dev Callable only by HZL (wrap flow). Decrements `stakedAmount`; the user loses voting
    ///      power on the wrapped portion. Shares physically move to the HZL pool.
    /// @param user   Owner of the position.
    /// @param vault  Vault address.
    /// @param amount Number of shares to transfer to HZL.
    function withdrawStake(address user, address vault, uint256 amount) external {
        if (msg.sender != hzl) revert OnlyHZL();
        StakeInfo storage info = stakes[user][vault];
        if (amount > info.stakedAmount) revert InsufficientStaked();
        info.stakedAmount -= uint200(amount);
        IERC20(vault).safeTransfer(hzl, amount);
        emit StakeWithdrawn(user, vault, amount);
    }

    /// @notice Returns the current voting power of `user` for `vault`.
    /// @dev voting power = stakedAmount × tierMultiplier(elapsed) / SCALE
    ///      where `elapsed` is derived from the weighted average deposit timestamp.
    ///      Returns 0 if the user has no staked position.
    /// @param user  Address to query.
    /// @param vault Vault address.
    /// @return Voting power (same unit as LP shares, scaled by tier multiplier).
    function getVotingPower(address user, address vault) external view returns (uint256) {
        StakeInfo storage info = stakes[user][vault];
        if (info.stakedAmount == 0) return 0;
        uint256 elapsed = block.timestamp - info.weightedTimestamp;
        uint256 multiplier = _tierMultiplier(elapsed);
        return info.stakedAmount * multiplier / SCALE;
    }

    /// @dev Updates a staking position with a new deposit. Uses a time-weighted average to blend
    ///      the existing timestamp with the current block time:
    ///        newTimestamp = (oldTimestamp × oldAmount + now × newAmount) / newTotal
    ///      On a fresh position the timestamp is set to `block.timestamp`.
    function _recordStake(address user, address vault, uint256 amount) internal {
        StakeInfo storage info = stakes[user][vault];
        uint256 newTotal = info.stakedAmount + amount;
        if (info.stakedAmount > 0) {
            info.weightedTimestamp = uint56(
                (uint256(info.weightedTimestamp) * info.stakedAmount + block.timestamp * amount) / newTotal
            );
        } else {
            info.weightedTimestamp = uint56(block.timestamp);
        }
        info.stakedAmount = uint200(newTotal);
    }

    /// @dev Returns the tier multiplier (×SCALE) for a given lock duration.
    ///      Tier 0 (<30d): ×1.0 | Tier 1 (30-90d): ×1.25 | Tier 2 (90-180d): ×1.5
    ///      Tier 3 (180d-1y): ×2.0 | Tier 4 (≥1y): ×2.5
    function _tierMultiplier(uint256 elapsed) internal pure returns (uint256) {
        if (elapsed >= 365 days) return 250;
        if (elapsed >= 180 days) return 200;
        if (elapsed >= 90 days) return 150;
        if (elapsed >= 30 days) return 125;
        return 100;
    }
}
