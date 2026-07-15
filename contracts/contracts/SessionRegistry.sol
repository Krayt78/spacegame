// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SessionRegistry
 * @notice Maps ephemeral session keys to owner accounts so game contracts can
 *         resolve a session-signed caller back to the player it acts for.
 * @dev Solidity port of the reference registry in the session-autosigning skill
 *      (gaming-retreat-2026/.claude/skills/session-autosigning/).
 *
 *      Semantics: one session per owner; re-registering auto-revokes the
 *      previous key; a key ever bound to an owner can never be reused, so
 *      rotation always means a fresh key; sessions live until revoked.
 *
 *      No expiry on-chain — that is per-game policy, and keeping it out holds
 *      the hot path (`resolve`, called on every game action) to one O(1)
 *      lookup. The frontend's client-side expiry is UX hygiene, NOT a security
 *      control: revocation is the only real one.
 *
 *      A session key is a BEARER CREDENTIAL. Anyone holding it can act as the
 *      player until revoked.
 */
contract SessionRegistry {
    /// @notice owner => active session key. address(0) = no active session.
    mapping(address => address) public sessionOf;

    /// @notice session key => owner. address(0) = not an active session key.
    mapping(address => address) public ownerOf;

    /**
     * @notice True once a key has been revoked or rotated away.
     * @dev You revoke precisely when a key may be compromised, so a retired key
     *      must never regain authority — not even for its original owner.
     *      `ownerOf` alone can't express this: revoking has to clear it (that's
     *      what de-authorizes the key), which would make the key look pristine
     *      and re-registerable.
     *
     *      Kept as a separate mapping rather than folded into `resolve` (e.g.
     *      by checking `sessionOf[ownerOf[k]] == k`) so the hot path stays a
     *      single SLOAD. This costs one SSTORE per revoke, never per action.
     *
     *      NOTE: the skill's Rust reference documents this behaviour but does
     *      not implement it — it deletes `owner_of[previous]` on rotation,
     *      leaving the retired key reusable by anyone. We follow the documented
     *      intent, which is what our design spec encodes. Caught by
     *      "rejects a burned key even for the same owner".
     */
    mapping(address => bool) public isRetiredKey;

    error InvalidSessionKey();
    error SessionKeyInUse();
    error NoActiveSession();

    event SessionRegistered(address indexed owner, address indexed session);
    event SessionRevoked(address indexed owner, address indexed session);

    /**
     * @notice Register `session` as the caller's session key.
     * @dev Any previous session of the caller is revoked first. A key that has
     *      ever been bound to any owner — active or retired — is rejected, so
     *      rotation always means a fresh key.
     */
    function registerSession(address session) external {
        address owner = msg.sender;
        if (session == address(0) || session == owner) revert InvalidSessionKey();
        if (ownerOf[session] != address(0) || isRetiredKey[session]) {
            revert SessionKeyInUse();
        }

        address previous = sessionOf[owner];
        if (previous != address(0)) {
            delete ownerOf[previous];
            isRetiredKey[previous] = true;
            emit SessionRevoked(owner, previous);
        }

        sessionOf[owner] = session;
        ownerOf[session] = owner;
        emit SessionRegistered(owner, session);
    }

    /// @notice Revoke the caller's active session key.
    function revokeSession() external {
        address owner = msg.sender;
        address session = sessionOf[owner];
        if (session == address(0)) revert NoActiveSession();

        delete sessionOf[owner];
        delete ownerOf[session];
        isRetiredKey[session] = true;
        emit SessionRevoked(owner, session);
    }

    /**
     * @notice Resolve an address to the player it acts for.
     * @dev A registered session key resolves to its owner; anything else
     *      resolves to ITSELF.
     *
     *      Never returns address(0). This is load-bearing: it is what lets
     *      plain EOAs keep working unchanged, and what stops a caller silently
     *      crediting the zero address for an unregistered sender.
     */
    function resolve(address account) external view returns (address) {
        address owner = ownerOf[account];
        return owner == address(0) ? account : owner;
    }

    /// @notice True if `account` is currently registered as someone's session key.
    function isSessionKey(address account) external view returns (bool) {
        return ownerOf[account] != address(0);
    }
}
