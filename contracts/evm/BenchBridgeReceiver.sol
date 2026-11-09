// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ITrustedOracleArbiter {
    function arbitrate(bytes32 fulfillmentUid, bytes calldata demand, bool decision) external;
}

/// @title BenchBridgeReceiver (Plan B2)
/// @notice The oracle named in Base Sepolia escrows when verdicts arrive through GenLayer's bridge instead of a
///         relayer key. The bridge endpoint (GenLayer's LayerZero-based boilerplate) calls `deliver` with a message
///         BenchJudgeB produced on GenLayer; this contract checks where it came from and forwards it to Alkahest's
///         TrustedOracleArbiter, so msg.sender there (the oracle) is this contract.
/// @dev Message = abi.encode(address sourceJudge, bytes32 fulfillmentUid, bytes demandData, bool decision).
///      Each fulfillment is accepted once: TrustedOracleArbiter.arbitrate overwrites earlier decisions.
contract BenchBridgeReceiver {
    ITrustedOracleArbiter public immutable arbiter;
    /// @notice The only caller allowed to deliver (the bridge endpoint / its executor on this chain).
    address public immutable bridge;
    /// @notice The GenLayer contract (BenchJudgeB) whose verdicts are accepted, as the bridge reports the sender.
    address public immutable sourceJudge;

    mapping(bytes32 => bool) public delivered;

    event VerdictDelivered(bytes32 indexed fulfillmentUid, bool decision);

    error NotBridge(address caller);
    error WrongSource(address got);
    error AlreadyDelivered(bytes32 fulfillmentUid);

    constructor(ITrustedOracleArbiter _arbiter, address _bridge, address _sourceJudge) {
        arbiter = _arbiter;
        bridge = _bridge;
        sourceJudge = _sourceJudge;
    }

    function deliver(bytes calldata message) external {
        if (msg.sender != bridge) revert NotBridge(msg.sender);
        (address from, bytes32 fulfillmentUid, bytes memory demandData, bool decision) =
            abi.decode(message, (address, bytes32, bytes, bool));
        if (from != sourceJudge) revert WrongSource(from);
        if (delivered[fulfillmentUid]) revert AlreadyDelivered(fulfillmentUid);
        delivered[fulfillmentUid] = true;
        arbiter.arbitrate(fulfillmentUid, demandData, decision);
        emit VerdictDelivered(fulfillmentUid, decision);
    }
}
