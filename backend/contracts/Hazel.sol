// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IHazelVault} from "./interfaces/IHazelVault.sol";
import {IGovStaking} from "./interfaces/IGovStaking.sol";
import {IVaultRegistry} from "./interfaces/IVaultRegistry.sol";

/// @title Hazel (HZL)
/// @notice Liquid restaking token that allows GovStaking participants to unlock liquidity
///         without fully exiting their position.
/// @dev A user wraps their staked LP shares into HZL at a price proportional to the net
///      asset value of the HZL pool. HZL is fungible across all registered vaults.
///
///      Three lifecycle operations:
///        wrap()    — LP shares leave GovStaking, enter the HZL pool, user receives HZL.
///        redeem()  — HZL is burned, LP shares are returned to the user's wallet.
///                    Voting power is lost; re-staking starts a new tier timer.
///        unwrap()  — HZL is burned, LP shares are re-staked in GovStaking for the user.
///                    Voting power is restored immediately, shares never transit the wallet.
///
///      Minting ratio (wrap):
///        hzlToMint = lpValue × totalSupply / totalPoolValue
///        On first wrap (supply == 0): hzlToMint = lpAmount (1:1 bootstrap).
contract Hazel is ERC20, Ownable {

    using SafeERC20 for IERC20;

    /// @notice GovStaking contract used for stake/unstake operations.
    IGovStaking public govStaking;

    /// @notice VaultRegistry used to validate vault addresses.
    IVaultRegistry public vaultRegistry;

    /// @notice Total LP shares held in the HZL pool per vault.
    mapping(address => uint256) public pool;

    /// @notice List of vaults with a non-zero pool balance.
    address[] public poolVaults;
    mapping(address => bool) private _inPool;

    error ZeroAddress();
    error ZeroAmount();
    error EmptyPool();
    error RegistryAlreadySet();
    error VaultRegistryNotSet();
    error UnauthorizedVault();

    event Wrapped(address indexed user, address indexed vault, uint256 lpAmount, uint256 hzlAmount);
    event Redeemed(address indexed user, uint256 hzlAmount);
    event Unwrapped(address indexed user, uint256 hzlAmount);

    /// @notice Deploys the HZL token.
    /// @param _govStaking Address of the GovStaking contract.
    constructor(address _govStaking) ERC20("Hazel Liquid Restaking", "HZL") Ownable(msg.sender) {
        if (_govStaking == address(0)) revert ZeroAddress();
        govStaking = IGovStaking(_govStaking);
    }

    /// @notice Converts `lpAmount` staked LP shares of `vault` into HZL tokens.
    /// @dev LP shares are pulled from GovStaking via `withdrawStake()` and credited to the
    ///      HZL pool. The number of HZL minted is proportional to the NAV contribution:
    ///        hzlToMint = convertToAssets(lpAmount) × totalSupply / totalPoolNAV
    ///      Vault must be registered. Caller must have at least `lpAmount` staked in GovStaking.
    /// @param vault    Registered vault whose LP shares are being wrapped.
    /// @param lpAmount Number of LP shares to wrap.
    function wrap(address vault, uint256 lpAmount) external {
        if (lpAmount == 0) revert ZeroAmount();
        if (address(vaultRegistry) == address(0)) revert VaultRegistryNotSet();
        if (!vaultRegistry.isRegistered(vault)) revert UnauthorizedVault();

        uint256 hzlToMint = _computeHZLToMint(vault, lpAmount);

        if (!_inPool[vault]) {
            poolVaults.push(vault);
            _inPool[vault] = true;
        }
        pool[vault] += lpAmount;
        _mint(msg.sender, hzlToMint);

        govStaking.withdrawStake(msg.sender, vault, lpAmount);

        emit Wrapped(msg.sender, vault, lpAmount, hzlToMint);
    }

    /// @notice Burns `hzlAmount` HZL and returns the proportional LP shares to the caller's wallet.
    /// @dev CEI: burn first, then iterate pool vaults to transfer pro-rata shares.
    ///      Vaults with a zero pro-rata share (rounding) are skipped.
    ///      Empty vault entries are cleaned up via swap-and-pop.
    ///      The caller loses their staking tier permanently; re-staking starts a new timer.
    ///      In V2, a Zapper contract will atomise redeem + withdraw + USDC conversion.
    /// @param hzlAmount Amount of HZL to burn.
    function redeem(uint256 hzlAmount) external {
        if (hzlAmount == 0) revert ZeroAmount();
        uint256 supply = totalSupply();

        _burn(msg.sender, hzlAmount);

        uint256 i = 0;
        uint256 len = poolVaults.length;
        while (i < len) {
            address vault = poolVaults[i];
            uint256 lpShare = pool[vault] * hzlAmount / supply;
            if (lpShare == 0) { i++; continue; }

            pool[vault] -= lpShare;
            if (pool[vault] == 0) {
                _inPool[vault] = false;
                poolVaults[i] = poolVaults[len - 1];
                poolVaults.pop();
                len--;
            } else {
                i++;
            }
            IERC20(vault).safeTransfer(msg.sender, lpShare);
        }

        emit Redeemed(msg.sender, hzlAmount);
    }

    /// @notice Burns `hzlAmount` HZL and re-stakes the proportional LP shares in GovStaking
    ///         for the caller, without transiting the user's wallet.
    /// @dev CEI: burn first, then iterate pool vaults. For each vault, approves GovStaking
    ///      and calls `stakeOnBehalf()`. The caller's voting power is restored immediately and
    ///      their tier timer resets from the moment of unwrap.
    /// @param hzlAmount Amount of HZL to burn.
    function unwrap(uint256 hzlAmount) external {
        if (hzlAmount == 0) revert ZeroAmount();
        uint256 supply = totalSupply();

        _burn(msg.sender, hzlAmount);

        uint256 i = 0;
        uint256 len = poolVaults.length;
        while (i < len) {
            address vault = poolVaults[i];
            uint256 lpShare = pool[vault] * hzlAmount / supply;
            if (lpShare == 0) { i++; continue; }

            pool[vault] -= lpShare;
            if (pool[vault] == 0) {
                _inPool[vault] = false;
                poolVaults[i] = poolVaults[len - 1];
                poolVaults.pop();
                len--;
            } else {
                i++;
            }
            IERC20(vault).forceApprove(address(govStaking), lpShare);
            govStaking.stakeOnBehalf(msg.sender, vault, lpShare);
        }

        emit Unwrapped(msg.sender, hzlAmount);
    }

    /// @notice Sets the VaultRegistry address. Can only be called once.
    /// @param _vaultRegistry Address of the VaultRegistry contract.
    function setVaultRegistry(address _vaultRegistry) external onlyOwner {
        if (address(vaultRegistry) != address(0)) revert RegistryAlreadySet();
        if (_vaultRegistry == address(0)) revert ZeroAddress();
        vaultRegistry = IVaultRegistry(_vaultRegistry);
    }

    /// @notice Returns the number of vaults currently represented in the HZL pool.
    function poolVaultCount() external view returns (uint256) {
        return poolVaults.length;
    }

    /// @dev Computes the number of HZL tokens to mint for `lpAmount` LP shares of `vault`.
    ///      On first wrap (supply == 0), bootstraps at 1:1 (lpAmount HZL).
    ///      Otherwise: hzlToMint = lpValue × supply / totalPoolNAV
    function _computeHZLToMint(address vault, uint256 lpAmount) internal view returns (uint256) {
        uint256 supply = totalSupply();
        if (supply == 0) return lpAmount;

        uint256 lpValue = IHazelVault(vault).convertToAssets(lpAmount);
        uint256 totalPoolVal = _totalPoolValue();
        if (totalPoolVal == 0) revert EmptyPool();

        return lpValue * supply / totalPoolVal;
    }

    /// @dev Returns the total NAV of the HZL pool by summing `convertToAssets(poolShares)`
    ///      for every registered vault.
    function _totalPoolValue() internal view returns (uint256 total) {
        uint256 len = poolVaults.length;
        for (uint256 i = 0; i < len; i++) {
            address vault = poolVaults[i];
            uint256 shares = pool[vault];
            if (shares > 0) {
                total += IHazelVault(vault).convertToAssets(shares);
            }
        }
    }
}
