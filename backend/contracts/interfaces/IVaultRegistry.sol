// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

/// @title IVaultRegistry
/// @notice Consumed by GovStaking and Hazel (HZL) to verify that a vault has been whitelisted
///         through the two-step queue + timelock registration process before accepting stakes or wraps.
interface IVaultRegistry {
    /// @notice Returns true if `vault` is currently registered.
    /// @param vault Address to query.
    function isRegistered(address vault) external view returns (bool);
}
