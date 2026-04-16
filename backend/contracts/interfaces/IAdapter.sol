// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

/// @title IAdapter
/// @notice Interface for yield-generating strategy adapters plugged into Hazel vaults.
/// @dev Implement this interface to connect a vault to a new external protocol (Morpho, Compound, etc.).
///      All state-changing functions must be restricted to the paired vault via an `onlyVault` modifier
///      in the concrete implementation. The vault grants itself a max USDC approval after calling
///      `setAdapter()`; the adapter is responsible for its own approval toward the external protocol.
interface IAdapter {
    /// @notice Pulls `amount` USDC from the vault and supplies it to the external protocol.
    /// @param amount USDC amount to deposit (6 decimals).
    function deposit(uint256 amount) external;

    /// @notice Withdraws `amount` USDC from the external protocol and sends it to the vault.
    /// @param amount USDC amount to withdraw (6 decimals).
    function withdraw(uint256 amount) external;

    /// @notice Withdraws the entire balance from the external protocol and sends it to the vault.
    /// @dev Called by `HzStable.setAdapter()` before switching to a new adapter.
    /// @return Total USDC amount returned to the vault.
    function withdrawAll() external returns (uint256);

    /// @notice Returns the current balance held in the external protocol, denominated in USDC.
    /// @dev Consumed by `HzStable.totalAssets()`. Must reflect accrued yield in real time.
    /// @return Balance in USDC (6 decimals).
    function balanceInUSDC() external view returns (uint256);

    /// @notice Revokes all token approvals granted by this adapter to the external protocol.
    /// @dev Emergency function. Called during adapter migration or incident response.
    ///      After this call, `deposit()` will fail until approvals are re-granted.
    function revokeApprovals() external;
}
