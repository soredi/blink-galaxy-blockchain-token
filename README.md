# Blink Galaxy Ecosystem
# Blink Galaxy Blockchain
# Blink Galaxy ($BG)

Non-upgradeable ERC-20 token for Base (and compatible EVM chains) with:

* **Capped supply** (10,000,000,000 BG)
* **Role-based access control** (admin, minter, whitelist admin, emergency withdraw)
* **Optional transfer whitelist**
* **Governance-style vote delegation** + checkpoints (Compound-style)
* **EIP-712 `delegateBySig`** (gasless delegation)
* **Emergency ERC20 rescue** (role-gated)

> ✅ This repository targets Solidity **0.8.23** and OpenZeppelin **v5.0.2**.
> ✅ Contract is **non-upgradeable** (no proxy), mirroring GQ’s model.

---

## Contracts

* **`contracts/BlinkGalaxy.sol`** – main token
* **`contracts/MockERC20.sol`** – test helper (for emergency withdraw tests)

---

## Features

* **Cap**: Immutable 10B max supply (`cap()`).
* **Roles** (OpenZeppelin `AccessControl`):

  * `DEFAULT_ADMIN_ROLE` – can grant/revoke other roles.
  * `MINTER_ROLE` – can mint up to the cap.
  * `WHITELIST_ADMIN_ROLE` – can toggle whitelist and manage allowed addresses.
  * `EMERGENCY_WITHDRAW_ROLE` – can rescue ERC20s accidentally sent to the contract.
* **Whitelist** (optional): When enabled, **both sender and receiver** must be whitelisted for transfers; mint requires `to` whitelisted; burn requires `from` whitelisted.
* **Governance delegation**:

  * `delegate(address)` and `delegateBySig(...)` (EIP-712).
  * Vote **checkpoints** and `getPriorVotes` / `getCurrentVotes`.
* **Events**:

  * `Minted(minter, receiver, amount)`
  * `Burned(burner, amount)`
  * Governance and AccessControl events from OZ.

---

## Networks

* **Base Sepolia (testnet)**
  Verified contract: `0x55a2B776E1d05704E7Ba68c4F4DbCef1BE2Bf06A`
  Explorer: [https://sepolia.basescan.org/address/0x55a2B776E1d05704E7Ba68c4F4DbCef1BE2Bf06A#code](https://sepolia.basescan.org/address/0x55a2B776E1d05704E7Ba68c4F4DbCef1BE2Bf06A#code)

> Mainnet addresses will be added after deployment.

---

## Quickstart

```bash
# Node 18+ recommended (Node 20 LTS ideal)
npm i
npx hardhat compile
npx hardhat test
```

### Project structure (minimal)

```
.
├─ contracts/
│  ├─ BlinkGalaxy.sol
│  └─ MockERC20.sol
├─ test/
│  └─ BlinkGalaxy.full.t.ts
├─ scripts/
│  ├─ deploy.ts
│  ├─ verify.ts
│  ├─ roles.ts
│  ├─ whitelist.ts
│  └─ mint.ts
├─ hardhat.config.ts
├─ package.json
└─ .env.example
```

---

## Environment

Create `.env` based on `.env.example`:

```
# RPCs
BASE_SEPOLIA_RPC=https://sepolia.base.org
BASE_RPC=https://mainnet.base.org

# Deployer (use a throwaway test key for Sepolia only)
DEPLOYER_PK=0xYOUR_PRIVATE_KEY

# Etherscan-compatible API key (works for BaseScan)
ETHERSCAN_API_KEY=your_basescan_api_key

# Optional convenience for scripts
MULTISIG=0xYourSafeOrAdminAddress
```

---

## Deploy & Verify

### Deploy

```bash
# Base Sepolia
MULTISIG=0xYourSafeOrAdminAddress \
npx hardhat run scripts/deploy.ts --network baseSepolia
```

### Verify (Etherscan API V2 style)

```bash
npx hardhat verify --network baseSepolia \
  0xDeployedAddress \
  0xYourSafeOrAdminAddress
```

If multiple contracts compile, specify the fully qualified name:

```bash
npx hardhat verify --network baseSepolia \
  --contract contracts/BlinkGalaxy.sol:BlinkGalaxy \
  0xDeployedAddress 0xYourSafeOrAdminAddress
```

---

## Roles & Admin

```solidity
// roles
bytes32 public constant MINTER_ROLE               = keccak256("MINTER_ROLE");
bytes32 public constant EMERGENCY_WITHDRAW_ROLE   = keccak256("EMERGENCY_WITHDRAW_ROLE");
bytes32 public constant WHITELIST_ADMIN_ROLE      = keccak256("WHITELIST_ADMIN_ROLE");
```

* At construction, `DEFAULT_ADMIN_ROLE`, `MINTER_ROLE`, `WHITELIST_ADMIN_ROLE`, and `EMERGENCY_WITHDRAW_ROLE` are granted to the `multisig` constructor argument.
* Recommend assigning these roles to a **Gnosis Safe** (Safe{Wallet}).

### Common admin actions (Hardhat console)

```ts
const bg = await ethers.getContractAt("BlinkGalaxy", "0xYourToken");

const ADMIN = await bg.DEFAULT_ADMIN_ROLE();
const MINTER = await bg.MINTER_ROLE();
const WLADM  = await bg.WHITELIST_ADMIN_ROLE();
const EMERG  = await bg.EMERGENCY_WITHDRAW_ROLE();

await bg.hasRole(MINTER, "0x...");

await bg.grantRole(MINTER, "0xMinter");
await bg.revokeRole(MINTER, "0xFormerMinter");
await bg.renounceRole(MINTER, "0xSelf"); // called by holder itself
```

---

## Whitelist (optional)

```ts
// Toggle whitelist
await bg.setWhitelistEnabled(true);

// Manage entries
await bg.setWhitelisted("0xAddr", true);
await bg.batchSetWhitelisted(["0xA","0xB"], true);

// Open transfers to everyone
await bg.setWhitelistEnabled(false);
```

**Enforcement when enabled:**

* `mint(to)` requires `to` whitelisted.
* `burn()` requires sender whitelisted.
* `transfer/transferFrom` require **both** sender & receiver whitelisted.

---

## Mint / Burn

```ts
// Mint (MINTER_ROLE)
await bg.mint("0xRecipient", ethers.parseEther("1000000")); // 1,000,000 BG

// Burn (caller burns own balance)
await bg.burn(ethers.parseEther("100"));
```

* Capped at 10B BG. Mints that exceed cap revert with `"Cap exceeded"`.

---

## Governance Delegation

* `delegate(address delegatee)`
* `delegateBySig(delegatee, nonce, expiry, v, r, s)` – EIP-712 typed data
* `getCurrentVotes(address)`
* `getPriorVotes(address, blockNumber)` – requires `blockNumber < current`

Delegation is **balance-based** and uses **checkpoints** to support historical queries.

---

## Emergency Withdraw (rescue ERC20)

```ts
// Only EMERGENCY_WITHDRAW_ROLE
await bg.emergencyWithdraw(
  "0xERC20Token",
  "0xRecipient"
);
```

Safely transfers **all** of `token` held by the BG contract to `recipient`.

---

## Testing

Full coverage on core flows:

```bash
npx hardhat test
```

Includes:

* deploy/metadata/cap
* roles grant/revoke/renounce
* mint/burn + cap
* whitelist gating (toggle/set/batch)
* transfer/transferFrom & approvals
* delegation + `delegateBySig` (EIP-712)
* checkpoints & `getPriorVotes`
* emergency withdraw

---

## Using a Safe (Gnosis)

On **Base Sepolia** or **Base mainnet**, you can execute admin/minter/whitelist transactions via [app.safe.global](https://app.safe.global/):

1. Add the token address.
2. Use **Transaction Builder** to call:

   * `mint(address,uint256)`
   * `setWhitelistEnabled(bool)`
   * `setWhitelisted(address,bool)`
   * `grantRole(bytes32,address)` / `revokeRole(bytes32,address)`

> `bytes32` role IDs can be read from the contract or computed off-chain with `keccak256("ROLE_NAME")`. Safer approach: copy the role values from the explorer’s **Read Contract** tab.

---

## Design Notes

* **Non-upgradeable**: mirrors GQ’s approach; reduced operational risk and simpler audits/explorer UX.
* **OZ v5**: modern hooks (`_update`) and consistent with 0.8.23.
* **Whitelist** is a **runtime toggle**—you can gate pre-launch and open later without redeploying.

---

## Security

* Not audited. Use at your own risk.
* Keep powerful roles on a multi-sig Safe.
* Rotate minter roles after launches if you won’t mint more.
* Consider time-lock governance for role changes on mainnet.

---

## License

**MIT** – see `LICENSE`.

---

## Acknowledgements

* OpenZeppelin Contracts v5
* Compound governance voting patterns for delegation/checkpoints

---

## Scripts

> Drop these into the `scripts/` folder.

### `scripts/deploy.ts`

```ts
import { ethers, run, network } from "hardhat";

async function main() {
  const multisig = process.env.MULTISIG || process.argv[2];
  if (!multisig) throw new Error("Provide MULTISIG (env or arg)");

  console.log(`Network: ${network.name}`);
  console.log(`Deploying BlinkGalaxy with multisig: ${multisig}`);

  const F = await ethers.getContractFactory("BlinkGalaxy");
  const c = await F.deploy(multisig);
  await c.waitForDeployment();
  const addr = await c.getAddress();

  console.log(`
Deployed BlinkGalaxy at: ${addr}`);

  // optional: auto-verify
  try {
    console.log("
Verifying...");
    await run("verify:verify", {
      address: addr,
      constructorArguments: [multisig],
      contract: "contracts/BlinkGalaxy.sol:BlinkGalaxy",
    });
    console.log("Verified!");
  } catch (e: any) {
    console.log("Verify step skipped or failed:", e.message || e);
  }

  console.log(`
Next:
  npx hardhat verify --network ${network.name} \
    ${addr} \
    ${multisig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### `scripts/verify.ts`

```ts
import { run, network } from "hardhat";

async function main() {
  const address = process.env.CONTRACT_ADDRESS || process.argv[2];
  const multisig = process.env.MULTISIG || process.argv[3];
  if (!address || !multisig) {
    throw new Error("Usage: verify.ts <address> <multisig>");
  }

  console.log(`Verifying on ${network.name}...`);
  await run("verify:verify", {
    address,
    constructorArguments: [multisig],
    contract: "contracts/BlinkGalaxy.sol:BlinkGalaxy",
  });
  console.log("Verified");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### `scripts/roles.ts`

```ts
import { ethers, network } from "hardhat";

const USAGE = `
roles.ts <token> <action> <role> <account>
  action: grant | revoke | check
  role:   MINTER | WHITELIST_ADMIN | EMERGENCY_WITHDRAW | ADMIN
`;

async function roleId(token: any, name: string): Promise<string> {
  switch (name.toUpperCase()) {
    case "MINTER": return await token.MINTER_ROLE();
    case "WHITELIST_ADMIN": return await token.WHITELIST_ADMIN_ROLE();
    case "EMERGENCY_WITHDRAW": return await token.EMERGENCY_WITHDRAW_ROLE();
    case "ADMIN": return await token.DEFAULT_ADMIN_ROLE();
    default: throw new Error("Unknown role: " + name);
  }
}

async function main() {
  const [,, tokenAddr, action, roleName, account] = process.argv;
  if (!tokenAddr || !action || !roleName || !account) throw new Error(USAGE);

  const token = await ethers.getContractAt("BlinkGalaxy", tokenAddr);
  const role = await roleId(token, roleName);

  console.log(`Network: ${network.name}`);
  console.log(`Token:   ${tokenAddr}`);
  console.log(`Action:  ${action}`);
  console.log(`Role:    ${roleName} (${role})`);
  console.log(`Account: ${account}`);

  if (action === "grant") {
    const tx = await token.grantRole(role, account);
    console.log("tx:", tx.hash);
    await tx.wait();
    console.log("Granted");
  } else if (action === "revoke") {
    const tx = await token.revokeRole(role, account);
    console.log("tx:", tx.hash);
    await tx.wait();
    console.log("Revoked");
  } else if (action === "check") {
    const ok = await token.hasRole(role, account);
    console.log("Has role:", ok);
  } else {
    throw new Error(USAGE);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### `scripts/whitelist.ts`

```ts
import { ethers, network } from "hardhat";

const USAGE = `
whitelist.ts <token> <action> [args...]
  actions:
    enable
    disable
    set <account> <true|false>
    batch <comma-separated-accounts> <true|false>
`;

async function main() {
  const [,, tokenAddr, action, arg1, arg2] = process.argv;
  if (!tokenAddr || !action) throw new Error(USAGE);
  const token = await ethers.getContractAt("BlinkGalaxy", tokenAddr);

  console.log(`Network: ${network.name}`);
  console.log(`Token:   ${tokenAddr}`);

  if (action === "enable") {
    const tx = await token.setWhitelistEnabled(true);
    console.log("tx:", tx.hash);
    await tx.wait();
    console.log("Whitelist enabled");
    return;
  }
  if (action === "disable") {
    const tx = await token.setWhitelistEnabled(false);
    console.log("tx:", tx.hash);
    await tx.wait();
    console.log("Whitelist disabled");
    return;
  }
  if (action === "set") {
    if (!arg1 || typeof arg2 === "undefined") throw new Error(USAGE);
    const allowed = arg2.toLowerCase() === "true";
    const tx = await token.setWhitelisted(arg1, allowed);
    console.log("tx:", tx.hash);
    await tx.wait();
    console.log(`Set ${arg1} -> ${allowed}`);
    return;
  }
  if (action === "batch") {
    if (!arg1 || typeof arg2 === "undefined") throw new Error(USAGE);
    const accounts = arg1.split(",").map((s) => s.trim());
    const allowed = arg2.toLowerCase() === "true";
    const tx = await token.batchSetWhitelisted(accounts, allowed);
    console.log("tx:", tx.hash);
    await tx.wait();
    console.log(`Batch set ${accounts.length} -> ${allowed}`);
    return;
  }

  throw new Error(USAGE);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### `scripts/mint.ts`

```ts
import { ethers, network } from "hardhat";

const USAGE = `
mint.ts <token> <to> <amountInBG>
  Example: mint.ts 0xToken 0xTo 1000000
`;

async function main() {
  const [,, tokenAddr, to, amountStr] = process.argv;
  if (!tokenAddr || !to || !amountStr) throw new Error(USAGE);

  const amount = ethers.parseUnits(amountStr, 18); // BG has 18 decimals
  const token = await ethers.getContractAt("BlinkGalaxy", tokenAddr);

  console.log(`Network: ${network.name}`);
  console.log(`Minting ${amountStr} BG to ${to} from ${tokenAddr}`);

  const tx = await token.mint(to, amount);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("Minted");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### `scripts/burn.ts` (optional)

```ts
import { ethers, network } from "hardhat";

const USAGE = `
burn.ts <token> <amountInBG>
`;

async function main() {
  const [,, tokenAddr, amountStr] = process.argv;
  if (!tokenAddr || !amountStr) throw new Error(USAGE);

  const amount = ethers.parseUnits(amountStr, 18);
  const token = await ethers.getContractAt("BlinkGalaxy", tokenAddr);

  console.log(`Network: ${network.name}`);
  console.log(`Burning ${amountStr} BG from caller on ${tokenAddr}`);

  const tx = await token.burn(amount);
  console.log("tx:", tx.hash);
  await tx.wait();
  console.log("Burned");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

### `.env.example`

```ini
# RPCs
BASE_SEPOLIA_RPC=https://sepolia.base.org
BASE_RPC=https://mainnet.base.org

# Deployer private key (0x-prefixed). Use test key for Sepolia only.
DEPLOYER_PK=0x...

# Etherscan-compatible API key (BaseScan)
ETHERSCAN_API_KEY=your_basescan_api_key

# Convenience
MULTISIG=0xYourSafeOrAdminAddress
```

### `hardhat.config.ts` (snippet)

```ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "dotenv/config";

const config: HardhatUserConfig = {
  solidity: { version: "0.8.23", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    },
    base: {
      url: process.env.BASE_RPC || "https://mainnet.base.org",
      accounts: process.env.DEPLOYER_PK ? [process.env.DEPLOYER_PK] : [],
    },
  },
  etherscan: {
    // V2 single key (works for BaseScan)
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  sourcify: { enabled: false },
};
export default config;
```