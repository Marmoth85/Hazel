// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title VaultRegistry
/// @notice Whitelist of authorised Hazel vaults. GovStaking and HZL query this registry
///         before accepting stakes or wraps to prevent interactions with unvetted contracts.
/// @dev Vault registration is a two-step process with a configurable timelock:
///        1. `queueVault()` — records the vault address and sets an activation timestamp.
///        2. `registerVault()` — confirms registration once the timelock has elapsed.
///      On local and testnet deployments `timelockDuration` is 0, allowing immediate registration.
///      In production (Arbitrum) the timelock is set to 48 hours.
contract VaultRegistry is Ownable {

    /// @notice Whether a vault address has been fully registered.
    mapping(address => bool) public isRegistered;

    /// @notice Unix timestamp at which a queued vault becomes eligible for registration.
    ///         Zero means the vault has not been queued.
    mapping(address => uint48) public pendingAt;

    /// @notice List of all registered vault addresses.
    address[] public vaults;

    /// @notice Minimum seconds between `queueVault()` and `registerVault()`.
    /// @dev Will be deprecated when DAO governance replaces `onlyOwner`.
    uint32 public timelockDuration;

    /// @notice Maximum number of simultaneously registered vaults.
    uint8 public maxVaults;

    uint32 private constant MIN_TIMELOCK_DURATION = 1 hours;

    error ZeroAddress();
    error ZeroAmount();
    error AlreadyRegistered();
    error AlreadyQueued();
    error NotQueued();
    error TimelockActive();
    error NotRegistered();
    error MaxVaultsReached();
    error TimelockTooShort();

    event VaultQueued(address indexed vault, uint256 enabledAt);
    event VaultRegistered(address indexed vault);
    event VaultRemoved(address indexed vault);
    event TimelockUpdated(uint256 oldDuration, uint256 newDuration);
    event MaxVaultsUpdated(uint256 oldMax, uint256 newMax);

    /// @notice Deploys the registry.
    /// @param _timelockDuration Timelock in seconds. Pass 0 for local/testnet deployments.
    constructor(uint256 _timelockDuration) Ownable(msg.sender) {
        timelockDuration = uint32(_timelockDuration);
        maxVaults = 30;
    }

    /// @notice Queues a vault for registration and starts the timelock countdown.
    /// @dev Reverts if the vault is already registered or already queued.
    /// @param vault Address of the vault to queue.
    function queueVault(address vault) external onlyOwner {
        if (vault == address(0)) revert ZeroAddress();
        if (isRegistered[vault]) revert AlreadyRegistered();
        if (pendingAt[vault] != 0) revert AlreadyQueued();
        uint48 enabledAt = uint48(block.timestamp + timelockDuration);
        pendingAt[vault] = enabledAt;
        emit VaultQueued(vault, enabledAt);
    }

    /// @notice Finalises registration of a previously queued vault.
    /// @dev Reverts if the vault was not queued or if the timelock is still active.
    ///      Clears `pendingAt` after successful registration.
    /// @param vault Address of the vault to register.
    function registerVault(address vault) external onlyOwner {
        if (vaults.length >= maxVaults) revert MaxVaultsReached();
        uint48 enabledAt = pendingAt[vault];
        if (enabledAt == 0) revert NotQueued();
        if (block.timestamp < enabledAt) revert TimelockActive();
        isRegistered[vault] = true;
        vaults.push(vault);
        delete pendingAt[vault];
        emit VaultRegistered(vault);
    }

    /// @notice Removes a vault from the registry. Existing staked positions are unaffected.
    /// @dev Uses swap-and-pop. Removing a vault prevents new stakes but does not force-exit
    ///      existing stakers. `isRegistered` is set to false immediately.
    /// @param vault Address of the registered vault to remove.
    function removeVault(address vault) external onlyOwner {
        if (!isRegistered[vault]) revert NotRegistered();
        isRegistered[vault] = false;
        uint256 len = vaults.length;
        for (uint256 i = 0; i < len; i++) {
            if (vaults[i] == vault) {
                vaults[i] = vaults[len - 1];
                vaults.pop();
                break;
            }
        }
        emit VaultRemoved(vault);
    }

    /// @notice Updates the timelock duration for future vault registrations.
    /// @dev Minimum allowed value is 1 hour. Does not affect already-queued vaults.
    /// @param duration New timelock in seconds.
    // [DAO-V2] PARAMETER_CHANGE · timelock 48h · bounds [1 hour, ∞)
    function setTimelockDuration(uint256 duration) external onlyOwner {
        if (duration < MIN_TIMELOCK_DURATION) revert TimelockTooShort();
        uint32 old = timelockDuration;
        timelockDuration = uint32(duration);
        emit TimelockUpdated(old, duration);
    }

    /// @notice Updates the maximum number of simultaneously registered vaults.
    /// @param max New maximum. Must be > 0.
    // [DAO-V2] PARAMETER_CHANGE · timelock 24h
    function setMaxVaults(uint256 max) external onlyOwner {
        if (max == 0) revert ZeroAmount();
        uint8 old = maxVaults;
        maxVaults = uint8(max);
        emit MaxVaultsUpdated(old, max);
    }

    /// @notice Returns the full list of registered vault addresses.
    function getVaults() external view returns (address[] memory) {
        return vaults;
    }

    /// @notice Returns the number of currently registered vaults.
    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }
}
