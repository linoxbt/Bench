// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @notice Demo stablecoin for Bench on GenLayer Chain (4221). Testnet only: anyone can mint.
contract BenchUSD is ERC20, ERC20Permit {
    constructor() ERC20("Bench USD", "bUSD") ERC20Permit("Bench USD") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
