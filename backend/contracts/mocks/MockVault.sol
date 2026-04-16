// SPDX-License-Identifier: MIT
pragma solidity 0.8.32;

import {MockERC20} from "./MockERC20.sol";

/// @dev Test-only minimal ERC4626-like vault. 1:1 share-to-asset ratio.
///      Used to test HZL multi-vault edge cases without deploying a full HzStable.
contract MockVault is MockERC20 {

    constructor(string memory name_, string memory symbol_)
        MockERC20(name_, symbol_, 9) {}

    function convertToAssets(uint256 shares) external pure returns (uint256) {
        return shares / 1_000;
    }

}
