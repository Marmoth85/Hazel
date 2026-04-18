// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.32;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title RevenueDistributor
/// @notice Receives hzUSDC fee shares minted by vault harvests and splits them across four
///         destinations: protocol treasury, socio-educational associations, insurance fund,
///         and residual user dilution (shares that stay in the vault).
/// @dev Weights are expressed in basis points. Their sum must not exceed 10 000; the remainder
///      stays in this contract, effectively benefiting all hzUSDC holders via dilution.
///      Supports multiple vault tokens simultaneously via the `vaults` registry.
contract RevenueDistributor is Ownable {

    using SafeERC20 for IERC20;

    uint256 private constant BASIS_POINTS = 10_000;

    /// @notice Association registered as a revenue destination.
    struct Association {
        address addr;
        uint16 weight;
    }

    /// @notice Treasury address that receives the treasury share on `distribute()`.
    address public treasury;

    /// @notice Maximum number of registered associations.
    uint8 public maxAssociations;

    /// @notice InsuranceFund address that receives the insurance share on `distribute()`.
    address public insuranceFund;

    /// @notice Share of each distribution allocated to the protocol treasury, in BPS.
    uint16 public treasuryWeight;

    /// @notice Total share allocated to all associations combined, in BPS.
    uint16 public associationWeight;

    /// @notice Share allocated to the InsuranceFund, in BPS.
    uint16 public insuranceWeight;

    /// @notice Registered vault tokens whose balances are processed by `distribute()`.
    address[] public vaults;
    mapping(address => bool) private _inVaults;

    /// @notice Registered associations and their relative weights.
    Association[] public associations;

    /// @notice Sum of all association weights (used to compute pro-rata shares).
    ///         Always equals BASIS_POINTS when associations.length > 0 and setAssociations has been called.
    uint256 public totalAssocWeight;

    error ZeroAddress();
    error ZeroAmount();
    error AlreadyAdded();
    error NotFound();
    error NothingToDistribute();
    error NothingToClaim();
    error MaxAssociationsReached();
    error SharesExceedBasisPoints();
    error IndexOutOfBounds();
    error WeightNotZero();
    error WeightsSumMismatch();
    error LengthMismatch();

    event VaultAdded(address indexed vault);
    event VaultRemoved(address indexed vault);
    event RevenueDistributed(address indexed vault, uint256 totalShares, uint256 toTreasury, uint256 toAssociations, uint256 toInsurance);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event TreasuryClaimed(address indexed vault, uint256 amount, address indexed treasuryAddress);
    event AssociationAdded(address indexed addr, string name);
    event AssociationRemoved(address indexed addr);
    event AssociationsUpdated();

    /// @notice Deploys the distributor with initial treasury and insurance fund addresses.
    /// @dev Default weights: treasury 10%, associations 80%, insurance 10% (total 100%).
    /// @param _treasury      Protocol treasury address.
    /// @param _insuranceFund InsuranceFund contract address.
    constructor(address _treasury, address _insuranceFund) Ownable(msg.sender) {
        if (_treasury == address(0) || _insuranceFund == address(0)) revert ZeroAddress();
        treasury = _treasury;
        insuranceFund = _insuranceFund;
        treasuryWeight = 1_000;
        associationWeight = 8_000;
        insuranceWeight = 1_000;
        maxAssociations = 10;
    }

    /// @notice Distributes all accumulated fee shares across the four destinations for every
    ///         registered vault token.
    /// @dev Pro-rata association split uses BASIS_POINTS as divisor (totalAssocWeight == BASIS_POINTS
    ///      when associations are active). Skips the associations bucket if none are registered or
    ///      totalAssocWeight is zero. Any rounding dust remains in this contract (user dilution).
    ///      Reverts if no vault holds a balance.
    // [DAO-V2] callable by Keeper / Automation once DAO is live
    function distribute() external onlyOwner {
        uint256 vLen = vaults.length;
        bool distributed = false;
        for (uint256 v = 0; v < vLen; v++) {
            IERC20 vaultToken = IERC20(vaults[v]);
            uint256 total = vaultToken.balanceOf(address(this));
            if (total == 0) continue;
            distributed = true;

            uint256 toTreasury = total * treasuryWeight / BASIS_POINTS;
            uint256 toAssociations = total * associationWeight / BASIS_POINTS;
            uint256 toInsurance = total * insuranceWeight / BASIS_POINTS;

            if (toTreasury > 0) vaultToken.safeTransfer(treasury, toTreasury);

            if (toAssociations > 0 && associations.length > 0 && totalAssocWeight > 0) {
                uint256 aLen = associations.length;
                for (uint256 i = 0; i < aLen; i++) {
                    uint256 share = toAssociations * associations[i].weight / BASIS_POINTS;
                    if (share > 0) vaultToken.safeTransfer(associations[i].addr, share);
                }
            }

            if (toInsurance > 0) vaultToken.safeTransfer(insuranceFund, toInsurance);

            emit RevenueDistributed(vaults[v], total, toTreasury, toAssociations, toInsurance);
        }
        if (!distributed) revert NothingToDistribute();
    }

    /// @notice Transfers the entire balance of every registered vault token to the treasury,
    ///         bypassing the split. Intended for emergency recovery or accounting corrections.
    /// @dev Reverts if all registered vaults have a zero balance.
    function claim() external onlyOwner {
        uint256 vLen = vaults.length;
        bool claimed = false;
        for (uint256 v = 0; v < vLen; v++) {
            IERC20 vaultToken = IERC20(vaults[v]);
            uint256 balance = vaultToken.balanceOf(address(this));
            if (balance == 0) continue;
            claimed = true;
            vaultToken.safeTransfer(treasury, balance);
            emit TreasuryClaimed(vaults[v], balance, treasury);
        }
        if (!claimed) revert NothingToClaim();
    }

    /// @notice Registers a vault token so its balance is processed by future `distribute()` calls.
    /// @param _vault Address of the vault ERC-20 token (e.g. hzUSDC).
    function addVault(address _vault) external onlyOwner {
        if (_vault == address(0)) revert ZeroAddress();
        if (_inVaults[_vault]) revert AlreadyAdded();
        vaults.push(_vault);
        _inVaults[_vault] = true;
        emit VaultAdded(_vault);
    }

    /// @notice Removes a vault token from the registry.
    /// @dev Uses swap-and-pop to keep the array compact. Any remaining balance is not distributed.
    /// @param _vault Address to remove.
    function removeVault(address _vault) external onlyOwner {
        if (!_inVaults[_vault]) revert NotFound();
        _inVaults[_vault] = false;
        uint256 len = vaults.length;
        for (uint256 i = 0; i < len; i++) {
            if (vaults[i] == _vault) {
                vaults[i] = vaults[len - 1];
                vaults.pop();
                break;
            }
        }
        emit VaultRemoved(_vault);
    }

    /// @notice Updates the protocol treasury address.
    /// @param newTreasury New treasury address.
    // [DAO-V2] PARAMETER_CHANGE · timelock 24h
    function setProtocolTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0)) revert ZeroAddress();
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    /// @notice Updates the distribution weights.
    /// @dev The sum of all three weights must not exceed 10 000 BPS. The remainder stays in
    ///      the vault as passive user dilution.
    /// @param _treasury    New treasury weight in BPS.
    /// @param _association New total association weight in BPS.
    /// @param _insurance   New insurance fund weight in BPS.
    // [DAO-V2] PARAMETER_CHANGE · timelock 48h · bounds [0, 10000] per weight
    function setShares(uint256 _treasury, uint256 _association, uint256 _insurance) external onlyOwner {
        if (_treasury + _association + _insurance != BASIS_POINTS) revert SharesExceedBasisPoints();
        treasuryWeight = uint16(_treasury);
        associationWeight = uint16(_association);
        insuranceWeight = uint16(_insurance);
    }

    /// @notice Registers a socio-educational association as a revenue destination with weight=0.
    /// @dev The association name is emitted in the event log but not stored on-chain.
    ///      Use setAssociations to assign BPS weights after registration.
    /// @param addr Association wallet or multi-sig address.
    /// @param name Human-readable name of the association (off-chain label only).
    function addAssociation(address addr, string calldata name) external onlyOwner {
        if (addr == address(0)) revert ZeroAddress();
        if (associations.length >= maxAssociations) revert MaxAssociationsReached();
        associations.push(Association(addr, 0));
        emit AssociationAdded(addr, name);
    }

    /// @notice Atomically replaces all association weights.
    /// @dev If length > 0, weights must sum to exactly BASIS_POINTS (10 000).
    ///      If length == 0, clears all weights and sets totalAssocWeight to 0.
    ///      The addrs array must match the current associations array exactly (same length, same order).
    /// @param addrs   Addresses of all registered associations, in order.
    /// @param weights New BPS weight for each association.
    function setAssociations(address[] calldata addrs, uint16[] calldata weights) external onlyOwner {
        if (addrs.length != weights.length) revert LengthMismatch();
        if (addrs.length != associations.length) revert LengthMismatch();

        uint256 sum = 0;
        uint256 len = addrs.length;

        if (len == 0) {
            totalAssocWeight = 0;
            emit AssociationsUpdated();
            return;
        }

        for (uint256 i = 0; i < len; i++) {
            if (addrs[i] == address(0)) revert ZeroAddress();
            sum += weights[i];
            associations[i].weight = weights[i];
        }

        if (sum != BASIS_POINTS) revert WeightsSumMismatch();
        totalAssocWeight = sum;

        emit AssociationsUpdated();
    }

    /// @notice Removes the association at `index` from the registry.
    /// @dev Reverts if the association weight is not zero — use setAssociations to zero it out first.
    ///      Uses swap-and-pop. Index is positional in the `associations` array.
    /// @param index Array index of the association to remove.
    function removeAssociation(uint256 index) external onlyOwner {
        uint256 len = associations.length;
        if (index >= len) revert IndexOutOfBounds();
        if (associations[index].weight != 0) revert WeightNotZero();
        address removed = associations[index].addr;
        associations[index] = associations[len - 1];
        associations.pop();
        emit AssociationRemoved(removed);
    }

    /// @notice Updates the maximum number of registered associations.
    /// @param max New maximum. Must be > 0.
    // [DAO-V2] PARAMETER_CHANGE · timelock 24h
    function setMaxAssociations(uint256 max) external onlyOwner {
        if (max == 0) revert ZeroAmount();
        maxAssociations = uint8(max);
    }

    /// @notice Returns the number of registered vault tokens.
    function vaultCount() external view returns (uint256) {
        return vaults.length;
    }

    /// @notice Returns the number of registered associations.
    function associationCount() external view returns (uint256) {
        return associations.length;
    }
}
