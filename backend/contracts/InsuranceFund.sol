// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title InsuranceFund
/// @notice Accumulates a fraction of protocol fee shares at each harvest as a reserve against
///         depeg events or external protocol exploits. The owner can trigger a payout to any
///         address to compensate affected users.
/// @dev Holds vault LP shares (hzUSDC), not raw USDC. The vault address is set post-deployment
///      via `setVault()` to avoid circular deployment dependencies.
contract InsuranceFund is Ownable {

    using SafeERC20 for IERC20;

    /// @notice Vault whose LP shares are held as the insurance reserve.
    IERC20 public vault;

    error ZeroAddress();
    error VaultAlreadySet();
    error VaultNotSet();

    event InsurancePayoutExecuted(address indexed to, uint256 amount);

    /// @notice Deploys the fund. `vault_` may be `address(0)` for deferred wiring.
    /// @param vault_ Initial vault address, or zero if wiring via `setVault()` later.
    constructor(address vault_) Ownable(msg.sender) {
        vault = IERC20(vault_);
    }

    /// @notice Sets the vault address. Can only be called once.
    /// @dev Called post-deployment once `HzStable` is deployed and its address is known.
    /// @param vault_ Address of the HzStable vault.
    function setVault(address vault_) external onlyOwner {
        if (address(vault) != address(0)) revert VaultAlreadySet();
        if (vault_ == address(0)) revert ZeroAddress();
        vault = IERC20(vault_);
    }

    /// @notice Transfers `amount` LP shares from the reserve to `to`.
    /// @dev Intended to compensate users in case of a depeg or external protocol exploit.
    ///      The recipient receives hzUSDC shares, which they can redeem for USDC via the vault.
    /// @param to     Recipient address.
    /// @param amount Number of hzUSDC shares to transfer.
    function payout(address to, uint256 amount) external onlyOwner {
        if (address(vault) == address(0)) revert VaultNotSet();
        if (to == address(0)) revert ZeroAddress();
        vault.safeTransfer(to, amount);
        emit InsurancePayoutExecuted(to, amount);
    }

    /// @notice Returns the current hzUSDC share balance held by this contract.
    function sharesBalance() external view returns (uint256) {
        return vault.balanceOf(address(this));
    }
}
