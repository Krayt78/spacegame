// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ISessionRegistry
 * @notice Read surface game contracts use to resolve a caller to the player it
 *         acts for. Deliberately minimal: the router only ever reads.
 */
interface ISessionRegistry {
    function resolve(address account) external view returns (address);
    function isSessionKey(address account) external view returns (bool);
}
