// SPDX-License-Identifier: MIT
pragma solidity 0.8.32;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAdapter} from "../interfaces/IAdapter.sol";
import {IMintable} from "../interfaces/IMintable.sol";

/// @dev Test-only adapter. Stores USDC locally, no external protocol.
///      simulateYield(amount) mints USDC to itself and increments the internal balance,
///      mimicking yield that would accrue in Aave.
contract MockAdapter is IAdapter {

    IMintable public usdc;
    address   public vault;
    uint256   private _balance;

    modifier onlyVault() {
        require(msg.sender == vault, "only vault");
        _;
    }

    constructor(address usdc_, address vault_) {
        usdc  = IMintable(usdc_);
        vault = vault_;
    }

    /// @notice Set or update the vault address (e.g. after vault deployment).
    function setVault(address vault_) external {
        vault = vault_;
    }

    function deposit(uint256 amount) external onlyVault {
        IERC20(address(usdc)).transferFrom(vault, address(this), amount);
        _balance += amount;
    }

    function withdraw(uint256 amount) external onlyVault {
        _balance -= amount;
        IERC20(address(usdc)).transfer(vault, amount);
    }

    function withdrawAll() external onlyVault returns (uint256) {
        uint256 bal = _balance;
        _balance = 0;
        if (bal > 0) IERC20(address(usdc)).transfer(vault, bal);
        return bal;
    }

    function balanceInUSDC() external view returns (uint256) {
        return _balance;
    }

    function revokeApprovals() external onlyVault {}

    // ── Test helper ───────────────────────────────────────

    /// @notice Simulate yield from an external protocol (e.g. Aave interest).
    ///         Mints `amount` USDC to this contract and increases the reported balance.
    function simulateYield(uint256 amount) external {
        usdc.mint(address(this), amount);
        _balance += amount;
    }
}
