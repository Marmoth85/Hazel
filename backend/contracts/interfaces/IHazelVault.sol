// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

interface IHazelVault {
    function convertToAssets(uint256 shares) external view returns (uint256);
}
