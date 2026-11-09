// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {BenchBridgeReceiver, ITrustedOracleArbiter} from "../BenchBridgeReceiver.sol";

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
    address constant JUDGE = address(0xBEEF);

    function setUp() public {
        arbiter = new RecordingArbiter();
        receiver = new BenchBridgeReceiver(arbiter, address(this), JUDGE);
    }

    function msgFor(address from, bytes32 uid, bool decision) internal pure returns (bytes memory) {
        return abi.encode(from, uid, bytes("nla-demand"), decision);
    }

    function test_forwardsAsTheOracle() public {
        receiver.deliver(msgFor(JUDGE, bytes32(uint256(1)), true));
        require(arbiter.lastSender() == address(receiver), "oracle must be the receiver");
        require(arbiter.lastUid() == bytes32(uint256(1)), "uid");
        require(keccak256(arbiter.lastDemand()) == keccak256("nla-demand"), "demand");
        require(arbiter.lastDecision(), "decision");
        require(receiver.delivered(bytes32(uint256(1))), "marked");
    }

    function test_onlyBridge() public {
        Stranger s = new Stranger();
        (bool ok,) = s.call(address(receiver), abi.encodeCall(receiver.deliver, (msgFor(JUDGE, bytes32(uint256(2)), true))));
        require(!ok, "stranger must be refused");
        require(arbiter.calls() == 0, "no arbitrate");
    }

    function test_onlyFromBenchJudge() public {
        (bool ok,) = address(receiver).call(abi.encodeCall(receiver.deliver, (msgFor(address(0xBAD), bytes32(uint256(3)), true))));
        require(!ok, "wrong source must be refused");
    }

    function test_onceperFulfillment() public {
        receiver.deliver(msgFor(JUDGE, bytes32(uint256(4)), false));
        (bool ok,) = address(receiver).call(abi.encodeCall(receiver.deliver, (msgFor(JUDGE, bytes32(uint256(4)), true))));
        require(!ok, "second delivery must be refused");
        require(arbiter.calls() == 1 && !arbiter.lastDecision(), "first verdict stands");
    }
}

contract Stranger {
    function call(address to, bytes memory data) external returns (bool ok, bytes memory ret) {
        (ok, ret) = to.call(data);
    }
}
