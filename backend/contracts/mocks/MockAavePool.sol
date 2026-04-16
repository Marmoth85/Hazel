// SPDX-License-Identifier: MIT
pragma solidity 0.8.32;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IAavePool} from "../interfaces/IAavePool.sol";
import {MockERC20} from "./MockERC20.sol";

/// @dev Test-only Aave pool. Holds USDC as reserve.
///      supply()    → pulls USDC from adapter (adapter has pre-approved pool), mints aUSDC 1:1.
///      withdraw()  → burns aUSDC from caller (MockERC20 has open burn), returns USDC 1:1.
contract MockAavePool is IAavePool {

    IERC20    public immutable usdc;
    MockERC20 public immutable aUsdc;

    constructor(address usdc_, address aUsdc_) {
        usdc  = IERC20(usdc_);
        aUsdc = MockERC20(aUsdc_);
    }

    function supply(address, uint256 amount, address onBehalfOf, uint16) external override {
        usdc.transferFrom(msg.sender, address(this), amount);
        aUsdc.mint(onBehalfOf, amount);
    }

    function withdraw(address, uint256 amount, address to) external override returns (uint256) {
        uint256 actual = amount == type(uint256).max
            ? aUsdc.balanceOf(msg.sender)
            : amount;
        aUsdc.burn(msg.sender, actual);
        usdc.transfer(to, actual);
        return actual;
    }
}
