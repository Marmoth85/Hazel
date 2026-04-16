// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

/// @title IGovStaking
/// @notice Interface consumed by HzStable and Hazel (HZL) to manage staked LP share positions.
interface IGovStaking {
    /// @notice Transfers staked LP shares from `user`'s position to the HZL contract.
    /// @dev Callable only by the HZL contract (wrap flow). Decrements `stakedAmount`;
    ///      the user loses voting power on the wrapped portion.
    /// @param user   Owner of the staked position.
    /// @param vault  Vault whose shares are being extracted.
    /// @param amount Number of LP shares to transfer to HZL.
    function withdrawStake(address user, address vault, uint256 amount) external;

    /// @notice Stakes LP shares on behalf of `user` without requiring their direct action.
    /// @dev Authorized callers: the vault (auto-stake on deposit) or HZL (re-stake on unwrap).
    ///      Shares are pulled from `msg.sender` and credited to `user`'s position.
    /// @param user   Beneficiary of the staked position.
    /// @param vault  Vault whose shares are being staked.
    /// @param amount Number of LP shares to stake.
    function stakeOnBehalf(address user, address vault, uint256 amount) external;

    /// @notice Unstakes LP shares on behalf of `user` and returns them to the vault.
    /// @dev Callable only by the vault (auto-unstake on withdrawal).
    ///      Shares are sent to the vault, not to `user`, so the vault can burn them.
    /// @param user   Owner of the staked position.
    /// @param vault  Vault whose shares are being unstaked.
    /// @param amount Number of LP shares to unstake.
    function unstakeOnBehalf(address user, address vault, uint256 amount) external;

    /// @notice Returns the number of LP shares currently staked by `user` for `vault`.
    /// @param user  Address to query.
    /// @param vault Vault address.
    /// @return Staked LP share balance.
    function stakedAmountOf(address user, address vault) external view returns (uint256);
}
