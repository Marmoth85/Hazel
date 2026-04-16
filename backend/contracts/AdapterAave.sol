// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IAdapter} from "./interfaces/IAdapter.sol";
import {IAavePool} from "./interfaces/IAavePool.sol";

/// @title AdapterAave
/// @notice IAdapter implementation that supplies USDC to Aave V3 and holds the resulting aUSDC.
/// @dev All state-changing functions are restricted to the vault via `onlyVault`.
///      The adapter is designed to be swappable: `revokeApprovals()` + `withdrawAll()` cleanly
///      decommissions it, allowing `HzStable.setAdapter()` to migrate to another protocol.
///      `vault` is immutable — a new adapter must be deployed when the vault changes.
contract AdapterAave is IAdapter {

    using SafeERC20 for IERC20;

    /// @notice Vault that this adapter exclusively serves.
    address public immutable vault;

    /// @notice USDC token supplied to Aave.
    IERC20 public immutable usdc;

    /// @notice Aave interest-bearing USDC (aUSDC) held by this contract as a receipt.
    IERC20 public immutable aUsdc;

    /// @notice Aave V3 Pool used for supply and withdraw operations.
    IAavePool public immutable aavePool;

    error ZeroAddress();
    error OnlyVault();

    /// @dev Restricts calls to the paired vault.
    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    /// @notice Deploys the adapter and grants the Aave pool an unlimited USDC approval.
    /// @param vault_     Address of the HzStable vault that controls this adapter.
    /// @param usdc_      USDC token address on the target chain.
    /// @param aUsdc_     Aave aUSDC receipt token address.
    /// @param aavePool_  Aave V3 Pool address.
    constructor(address vault_, address usdc_, address aUsdc_, address aavePool_) {
        if (vault_ == address(0) || usdc_ == address(0) || aUsdc_ == address(0) || aavePool_ == address(0)) revert ZeroAddress();
        vault = vault_;
        usdc = IERC20(usdc_);
        aUsdc = IERC20(aUsdc_);
        aavePool = IAavePool(aavePool_);
        IERC20(usdc_).forceApprove(aavePool_, type(uint256).max);
    }

    /// @notice Pulls `amount` USDC from the vault and supplies it to Aave.
    /// @param amount USDC amount to supply (6 decimals).
    function deposit(uint256 amount) external onlyVault {
        usdc.safeTransferFrom(vault, address(this), amount);
        aavePool.supply(address(usdc), amount, address(this), 0);
    }

    /// @notice Withdraws `amount` USDC from Aave and sends it directly to the vault.
    /// @param amount USDC amount to withdraw (6 decimals).
    function withdraw(uint256 amount) external onlyVault {
        aavePool.withdraw(address(usdc), amount, vault);
    }

    /// @notice Withdraws the entire aUSDC balance from Aave and sends it to the vault.
    /// @dev Uses `type(uint256).max` to withdraw all accrued interest alongside principal.
    /// @return Total USDC amount received by the vault.
    function withdrawAll() external onlyVault returns (uint256) {
        uint256 bal = aUsdc.balanceOf(address(this));
        if (bal == 0) return 0;
        return aavePool.withdraw(address(usdc), type(uint256).max, vault);
    }

    /// @notice Returns the current aUSDC balance, which reflects both principal and accrued yield.
    /// @dev aUSDC is rebasing: its balance increases each block as Aave accrues interest.
    ///      This value is consumed by `HzStable.totalAssets()`.
    /// @return aUSDC balance of this contract (equivalent to USDC, 6 decimals).
    function balanceInUSDC() external view returns (uint256) {
        return aUsdc.balanceOf(address(this));
    }

    /// @notice Revokes the adapter's USDC approval to the Aave pool.
    /// @dev Emergency function called by the vault during adapter migration or incident response.
    ///      After this call, `deposit()` will revert until approval is re-granted.
    function revokeApprovals() external onlyVault {
        usdc.forceApprove(address(aavePool), 0);
    }
}
