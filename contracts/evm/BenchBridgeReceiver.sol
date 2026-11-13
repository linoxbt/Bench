// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

interface ITrustedOracleArbiter {
    function arbitrate(bytes32 fulfillmentUid, bytes calldata demand, bool decision) external;
}

/// @notice LayerZero V2's authenticated message origin (the endpoint fills it in; senders can't forge it).
struct Origin {
    uint32 srcEid;
    bytes32 sender;
    uint64 nonce;
}

/// @title BenchBridgeReceiver (Plan B2)
/// @notice The oracle named in Base Sepolia escrows when verdicts arrive through GenLayer's bridge instead of a
///         relayer key. GenLayer's bridge boilerplate is LayerZero-based: the endpoint on this chain calls
///         `lzReceive` with the message's authenticated origin (source endpoint id + sender). This contract accepts
///         verdicts only from BenchJudgeB's bridge sender on the GenLayer side and forwards them to Alkahest's
///         TrustedOracleArbiter, so msg.sender there (the oracle) is this contract.
/// @dev Message = abi.encode(bytes32 fulfillmentUid, bytes demandData, bool decision). The source is never read
///      from the message: only from `Origin`, which the endpoint authenticates.
///      Each fulfillment is accepted once: TrustedOracleArbiter.arbitrate overwrites earlier decisions.
contract BenchBridgeReceiver {
    ITrustedOracleArbiter public immutable arbiter;
    /// @notice The LayerZero endpoint on this chain: the only caller allowed to deliver.
    address public immutable endpoint;
    /// @notice The GenLayer side's endpoint id.
    uint32 public immutable sourceEid;
    /// @notice The sender on the GenLayer side (BenchJudgeB's bridge sender), as the endpoint reports it.
    bytes32 public immutable sourcePeer;

    mapping(bytes32 => bool) public delivered;

    event VerdictDelivered(bytes32 indexed fulfillmentUid, bool decision);

    error NotEndpoint(address caller);
    error WrongSource(uint32 srcEid, bytes32 sender);
    error AlreadyDelivered(bytes32 fulfillmentUid);

    constructor(ITrustedOracleArbiter _arbiter, address _endpoint, uint32 _sourceEid, bytes32 _sourcePeer) {
        arbiter = _arbiter;
        endpoint = _endpoint;
        sourceEid = _sourceEid;
        sourcePeer = _sourcePeer;
    }

    /// @notice LayerZero V2 receive hook.
    function lzReceive(
        Origin calldata _origin,
        bytes32, /* _guid */
        bytes calldata _message,
        address, /* _executor */
        bytes calldata /* _extraData */
    ) external payable {
        if (msg.sender != endpoint) revert NotEndpoint(msg.sender);
        if (_origin.srcEid != sourceEid || _origin.sender != sourcePeer) revert WrongSource(_origin.srcEid, _origin.sender);
        (bytes32 fulfillmentUid, bytes memory demandData, bool decision) = abi.decode(_message, (bytes32, bytes, bool));
        if (delivered[fulfillmentUid]) revert AlreadyDelivered(fulfillmentUid);
        delivered[fulfillmentUid] = true;
        arbiter.arbitrate(fulfillmentUid, demandData, decision);
        emit VerdictDelivered(fulfillmentUid, decision);
    }

    /// @notice LayerZero V2: only BenchJudgeB's path may be initialized.
    function allowInitializePath(Origin calldata _origin) external view returns (bool) {
        return _origin.srcEid == sourceEid && _origin.sender == sourcePeer;
    }

    /// @notice LayerZero V2: unordered delivery (each fulfillment is idempotent-guarded above).
    function nextNonce(uint32, bytes32) external pure returns (uint64) {
        return 0;
    }
}
