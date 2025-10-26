// SPDX-License-Identifier: MIT

pragma solidity ^0.8.23;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

interface IERC20Lite {
    function balanceOf(address) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
}

contract BlinkGalaxy is ERC20, AccessControl {
    // --- Roles ---
    bytes32 public constant MINTER_ROLE               = keccak256("MINTER_ROLE");
    bytes32 public constant EMERGENCY_WITHDRAW_ROLE   = keccak256("EMERGENCY_WITHDRAW_ROLE");
    bytes32 public constant WHITELIST_ADMIN_ROLE      = keccak256("WHITELIST_ADMIN_ROLE");

    // --- Cap  ---
    uint256 private immutable _cap;

    // --- Whitelist ---
    bool public whitelistEnabled;
    mapping(address => bool) public isWhitelisted;
    event WhitelistToggled(bool enabled);
    event WhitelistSet(address indexed account, bool allowed);

    // --- Compound-style governance delegation & checkpoints ---
    mapping(address => address) internal _delegates;

    struct Checkpoint {
        uint256 fromBlock;
        uint256 votes;
    }

    mapping(address => mapping(uint32 => Checkpoint)) public checkpoints;
    mapping(address => uint32) public numCheckpoints;

    // EIP-712
    bytes32 public constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,uint256 chainId,address verifyingContract)"
    );
    bytes32 public constant DELEGATION_TYPEHASH = keccak256(
        "Delegation(address delegatee,uint256 nonce,uint256 expiry)"
    );
    mapping(address => uint256) public nonces;

    event DelegateChanged(address indexed delegator, address indexed fromDelegate, address indexed toDelegate);
    event DelegateVotesChanged(address indexed delegate, uint256 previousBalance, uint256 newBalance);

    // --- Parity events with $GQ ---
    event Minted(address indexed minter, address indexed receiver, uint256 mintAmount);
    event Burned(address indexed burner, uint256 burnAmount);

    constructor(address multisig) ERC20("Blink Galaxy", "BG") {
        require(multisig != address(0), "multisig zero");

        // Roles
        _grantRole(DEFAULT_ADMIN_ROLE, multisig);
        _grantRole(MINTER_ROLE, multisig);
        _grantRole(EMERGENCY_WITHDRAW_ROLE, multisig);
        _grantRole(WHITELIST_ADMIN_ROLE, multisig);

        // 10B cap.
        _cap = 10_000_000_000 * 10**18;

        // Whitelist off by default.
        whitelistEnabled = false;
    }

    // --- Cap view ---
    function cap() public view returns (uint256) {
        return _cap;
    }

    // --- Admin: whitelist controls ---
    function setWhitelistEnabled(bool enabled) external onlyRole(WHITELIST_ADMIN_ROLE) {
        whitelistEnabled = enabled;
        emit WhitelistToggled(enabled);
    }

    function setWhitelisted(address account, bool allowed) external onlyRole(WHITELIST_ADMIN_ROLE) {
        isWhitelisted[account] = allowed;
        emit WhitelistSet(account, allowed);
    }

    function batchSetWhitelisted(address[] calldata accounts, bool allowed)
        external
        onlyRole(WHITELIST_ADMIN_ROLE)
    {
        for (uint256 i = 0; i < accounts.length; i++) {
            isWhitelisted[accounts[i]] = allowed;
            emit WhitelistSet(accounts[i], allowed);
        }
    }

    // --- Mint/Burn ---
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        require(totalSupply() + amount <= _cap, "Cap exceeded");
        _mint(to, amount);
        emit Minted(msg.sender, to, amount);
    }

    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        _moveDelegates(_delegates[msg.sender], address(0), amount);
        emit Burned(msg.sender, amount);
    }

    // --- Whitelist gating ---
    function _update(address from, address to, uint256 value) internal override {
        if (whitelistEnabled) {
            if (from == address(0)) {
                // mint
                require(isWhitelisted[to], "to not whitelisted");
            } else if (to == address(0)) {
                // burn
                require(isWhitelisted[from], "from not whitelisted");
            } else {
                require(isWhitelisted[from] && isWhitelisted[to], "transfer not whitelisted");
            }
        }
        super._update(from, to, value);
    }

    // --- Transfers also move delegates ---
    function transfer(address recipient, uint256 amount) public override returns (bool) {
        bool ok = super.transfer(recipient, amount);
        _moveDelegates(_delegates[_msgSender()], _delegates[recipient], amount);
        return ok;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        bool ok = super.transferFrom(sender, recipient, amount);
        _moveDelegates(_delegates[sender], _delegates[recipient], amount);
        return ok;
    }

    // --- Emergency ERC20 rescue (role-gated) ---
    function emergencyWithdraw(address token, address to) external onlyRole(EMERGENCY_WITHDRAW_ROLE) {
        require(to != address(0), "to zero");
        IERC20Lite erc = IERC20Lite(token);
        uint256 bal = erc.balanceOf(address(this));
        require(bal > 0, "no tokens");
        _safeTransferERC20(erc, to, bal);
    }

    function _safeTransferERC20(IERC20Lite token, address to, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "TRANSFER_FAILED");
    }

    // --- Governance: delegation API ---
    function delegates(address delegator) external view returns (address) {
        return _delegates[delegator];
    }

    function delegate(address delegatee) external {
        _delegate(msg.sender, delegatee);
    }

    function delegateBySig(
        address delegatee,
        uint256 nonce,
        uint256 expiry,
        uint8 v, bytes32 r, bytes32 s
    ) external {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                DOMAIN_TYPEHASH,
                keccak256(bytes(name())),
                getChainId(),
                address(this)
            )
        );

        bytes32 structHash = keccak256(
            abi.encode(
                DELEGATION_TYPEHASH,
                delegatee,
                nonce,
                expiry
            )
        );

        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        address signatory = ecrecover(digest, v, r, s);
        require(signatory != address(0), "invalid signature");
        require(nonce == nonces[signatory]++, "invalid nonce");
        require(block.timestamp <= expiry, "signature expired");
        _delegate(signatory, delegatee);
    }

    function getCurrentVotes(address account) external view returns (uint256) {
        uint32 n = numCheckpoints[account];
        return n > 0 ? checkpoints[account][n - 1].votes : 0;
    }

    function getPriorVotes(address account, uint256 blockNumber) external view returns (uint256) {
        require(blockNumber < block.number, "not yet determined");

        uint32 n = numCheckpoints[account];
        if (n == 0) return 0;

        // First check most recent
        if (checkpoints[account][n - 1].fromBlock <= blockNumber) {
            return checkpoints[account][n - 1].votes;
        }
        // Next check implicit zero
        if (checkpoints[account][0].fromBlock > blockNumber) {
            return 0;
        }

        uint32 lower = 0;
        uint32 upper = n - 1;
        while (upper > lower) {
            uint32 center = upper - (upper - lower) / 2; // ceil
            Checkpoint memory cp = checkpoints[account][center];
            if (cp.fromBlock == blockNumber) {
                return cp.votes;
            } else if (cp.fromBlock < blockNumber) {
                lower = center;
            } else {
                upper = center - 1;
            }
        }
        return checkpoints[account][lower].votes;
    }

    // --- Internal delegation helpers ---
    function _delegate(address delegator, address delegatee) internal {
        address current = _delegates[delegator];
        uint256 delegatorBalance = balanceOf(delegator);
        _delegates[delegator] = delegatee;

        emit DelegateChanged(delegator, current, delegatee);
        _moveDelegates(current, delegatee, delegatorBalance);
    }

    function _moveDelegates(address srcRep, address dstRep, uint256 amount) internal {
        if (srcRep != dstRep && amount > 0) {
            if (srcRep != address(0)) {
                uint32 srcRepNum = numCheckpoints[srcRep];
                uint256 srcRepOld = srcRepNum > 0 ? checkpoints[srcRep][srcRepNum - 1].votes : 0;
                uint256 srcRepNew = srcRepOld - amount;
                _writeCheckpoint(srcRep, srcRepNum, srcRepOld, srcRepNew);
            }

            if (dstRep != address(0)) {
                uint32 dstRepNum = numCheckpoints[dstRep];
                uint256 dstRepOld = dstRepNum > 0 ? checkpoints[dstRep][dstRepNum - 1].votes : 0;
                uint256 dstRepNew = dstRepOld + amount;
                _writeCheckpoint(dstRep, dstRepNum, dstRepOld, dstRepNew);
            }
        }
    }

    function _writeCheckpoint(
        address delegatee,
        uint32 nCheckpoints,
        uint256 oldVotes,
        uint256 newVotes
    ) internal {
        uint256 blockNumber = block.number;

        if (nCheckpoints > 0 && checkpoints[delegatee][nCheckpoints - 1].fromBlock == blockNumber) {
            checkpoints[delegatee][nCheckpoints - 1].votes = newVotes;
        } else {
            checkpoints[delegatee][nCheckpoints] = Checkpoint(blockNumber, newVotes);
            numCheckpoints[delegatee] = nCheckpoints + 1;
        }
        emit DelegateVotesChanged(delegatee, oldVotes, newVotes);
    }

    function getChainId() internal view returns (uint256 chainId) {
        assembly {
            chainId := chainid()
        }
    }
}