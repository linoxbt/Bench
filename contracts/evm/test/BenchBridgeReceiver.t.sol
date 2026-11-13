// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BenchBridgeReceiver, ITrustedOracleArbiter, Origin} from "../BenchBridgeReceiver.sol";

contract RecordingArbiter is ITrustedOracleArbiter {
    address public lastSender;
    bytes32 public lastUid;
    bytes public lastDemand;
    bool public lastDecision;
    uint256 public calls;

    function arbitrate(bytes32 fulfillmentUid, bytes calldata demand, bool decision) external {
        lastSender = msg.sender;
        lastUid = fulfillmentUid;
        lastDemand = demand;
        lastDecision = decision;
        calls++;
    }
}

contract BenchBridgeReceiverTest {
    RecordingArbiter arbiter;
    BenchBridgeReceiver receiver;
    uint32 constant SRC_EID = 40_421;
    bytes32 constant PEER = bytes32(uint256(uint160(address(0xBEEF))));

    function setUp() public {
        arbiter = new RecordingArbiter();
        receiver = new BenchBridgeReceiver(arbiter, address(this), SRC_EID, PEER); // this test plays the endpoint
    }

    function origin(uint32 eid, bytes32 sender) internal pure returns (Origin memory) {
        return Origin({srcEid: eid, sender: sender, nonce: 1});
    }

    function verdict(bytes32 uid, bool decision) internal pure returns (bytes memory) {
        return abi.encode(uid, bytes("nla-demand"), decision);
    }

    function test_forwardsAsTheOracle() public {
        receiver.lzReceive(origin(SRC_EID, PEER), bytes32(0), verdict(bytes32(uint256(1)), true), address(0), "");
        require(arbiter.lastSender() == address(receiver), "oracle must be the receiver");
        require(arbiter.lastUid() == bytes32(uint256(1)), "uid");
        require(keccak256(arbiter.lastDemand()) == keccak256("nla-demand"), "demand");
        require(arbiter.lastDecision(), "decision");
        require(receiver.delivered(bytes32(uint256(1))), "marked");
    }

    function test_onlyEndpoint() public {
        Stranger s = new Stranger();
        (bool ok,) = s.call(
            address(receiver),
            abi.encodeCall(receiver.lzReceive, (origin(SRC_EID, PEER), bytes32(0), verdict(bytes32(uint256(2)), true), address(0), ""))
        );
        require(!ok, "stranger must be refused");
        require(arbiter.calls() == 0, "no arbitrate");
    }

    function test_sourceComesFromTheAuthenticatedOrigin() public {
        // A forged payload can't claim to be BenchJudgeB: the payload has no sender field at all.
        (bool ok,) = address(receiver).call(
            abi.encodeCall(receiver.lzReceive, (origin(SRC_EID, bytes32(uint256(0xBAD))), bytes32(0), verdict(bytes32(uint256(3)), true), address(0), ""))
        );
        require(!ok, "wrong sender must be refused");
        (ok,) = address(receiver).call(
            abi.encodeCall(receiver.lzReceive, (origin(SRC_EID + 1, PEER), bytes32(0), verdict(bytes32(uint256(3)), true), address(0), ""))
        );
        require(!ok, "wrong source chain must be refused");
        require(arbiter.calls() == 0, "no arbitrate");
    }

    function test_oncePerFulfillment() public {
        receiver.lzReceive(origin(SRC_EID, PEER), bytes32(0), verdict(bytes32(uint256(4)), false), address(0), "");
        (bool ok,) = address(receiver).call(
            abi.encodeCall(receiver.lzReceive, (origin(SRC_EID, PEER), bytes32(0), verdict(bytes32(uint256(4)), true), address(0), ""))
        );
        require(!ok, "second delivery must be refused");
        require(arbiter.calls() == 1 && !arbiter.lastDecision(), "first verdict stands");
    }

    function test_onlyBenchJudgePathCanInitialize() public view {
        require(receiver.allowInitializePath(origin(SRC_EID, PEER)), "own path");
        require(!receiver.allowInitializePath(origin(SRC_EID, bytes32(uint256(1)))), "other sender");
    }
}

contract Stranger {
    function call(address to, bytes memory data) external returns (bool ok, bytes memory ret) {
        (ok, ret) = to.call(data);
    }
}
