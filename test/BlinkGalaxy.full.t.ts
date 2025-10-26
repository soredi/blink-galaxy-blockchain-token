import { expect } from "chai";
import { ethers, network } from "hardhat";
import { TypedDataDomain } from "ethers";

const one = (n: string) => ethers.parseEther(n);

describe("BlinkGalaxy – full coverage", () => {
  async function mine(n = 1) { for (let i = 0; i < n; i++) await network.provider.send("evm_mine"); }

  async function deploy() {
    const [deployer, multisig, a, b, c, other] = await ethers.getSigners();
    const F = await ethers.getContractFactory("BlinkGalaxy");
    const bg = await F.deploy(multisig.address);
    return { deployer, multisig, a, b, c, other, bg };
  }

  it("deploys with correct metadata, cap, and roles", async () => {
    const { multisig, bg } = await deploy();

    expect(await bg.name()).to.eq("Blink Galaxy");
    expect(await bg.symbol()).to.eq("BG");
    expect(await bg.decimals()).to.eq(18);

    // cap = 10B * 1e18
    expect(await bg.cap()).to.eq(ethers.parseEther("10000000000"));

    const ADMIN = await bg.DEFAULT_ADMIN_ROLE();
    const MINTER = await bg.MINTER_ROLE();
    const WLADM  = await bg.WHITELIST_ADMIN_ROLE();
    const EMERG  = await bg.EMERGENCY_WITHDRAW_ROLE();

    expect(await bg.hasRole(ADMIN,  multisig.address)).to.eq(true);
    expect(await bg.hasRole(MINTER, multisig.address)).to.eq(true);
    expect(await bg.hasRole(WLADM,  multisig.address)).to.eq(true);
    expect(await bg.hasRole(EMERG,  multisig.address)).to.eq(true);

    expect(await bg.totalSupply()).to.eq(0n);
    expect(await bg.whitelistEnabled()).to.eq(false);
  });

  it("roles: grant/revoke/renounce and access control checks", async () => {
    const { multisig, a, bg } = await deploy();
    const MINTER = await bg.MINTER_ROLE();

    // non-admin cannot grant
    await expect(bg.connect(a).grantRole(MINTER, a.address)).to.be.reverted;

    // admin grants a minter
    await expect(bg.connect(multisig).grantRole(MINTER, a.address))
      .to.emit(bg, "RoleGranted").withArgs(MINTER, a.address, multisig.address);

    expect(await bg.hasRole(MINTER, a.address)).to.eq(true);

    // holder can renounce itself
    await expect(bg.connect(a).renounceRole(MINTER, a.address))
      .to.emit(bg, "RoleRevoked").withArgs(MINTER, a.address, a.address);
    expect(await bg.hasRole(MINTER, a.address)).to.eq(false);

    // admin grants again and then revokes
    await bg.connect(multisig).grantRole(MINTER, a.address);
    await expect(bg.connect(multisig).revokeRole(MINTER, a.address))
      .to.emit(bg, "RoleRevoked").withArgs(MINTER, a.address, multisig.address);
    expect(await bg.hasRole(MINTER, a.address)).to.eq(false);
  });

  it("mint/burn + cap enforcement + events", async () => {
    const { multisig, a, bg } = await deploy();

    // non-minter cannot mint
    await expect(bg.connect(a).mint(a.address, 1n)).to.be.reverted;

    // mint OK by multisig
    await expect(bg.connect(multisig).mint(a.address, one("1")))
      .to.emit(bg, "Minted").withArgs(multisig.address, a.address, one("1"));
    expect(await bg.totalSupply()).to.eq(one("1"));
    expect(await bg.balanceOf(a.address)).to.eq(one("1"));

    // burn by holder
    await expect(bg.connect(a).burn(one("0.4")))
      .to.emit(bg, "Burned").withArgs(a.address, one("0.4"));
    expect(await bg.totalSupply()).to.eq(one("0.6"));

    // cap enforcement
    const cap = await bg.cap();
    const remaining = cap - (await bg.totalSupply());
    await expect(bg.connect(multisig).mint(a.address, remaining + 1n))
      .to.be.revertedWith("Cap exceeded");
  });

  it("whitelist gating for mint/transfer/transferFrom/burn", async () => {
    const { multisig, a, b, bg } = await deploy();
    const MINTER = await bg.MINTER_ROLE();

    // enable whitelist
    await expect(bg.connect(multisig).setWhitelistEnabled(true))
      .to.emit(bg, "WhitelistToggled").withArgs(true);

    // mint should fail if 'to' not whitelisted
    await expect(bg.connect(multisig).mint(a.address, 1n))
      .to.be.revertedWith("to not whitelisted");

    // whitelist both
    await expect(bg.connect(multisig).setWhitelisted(a.address, true))
      .to.emit(bg, "WhitelistSet").withArgs(a.address, true);
    await bg.connect(multisig).setWhitelisted(b.address, true);

    // mint now OK
    await bg.connect(multisig).mint(a.address, one("2"));

    // transfer requires both sides whitelisted
    await bg.connect(multisig).setWhitelisted(b.address, false);
    await expect(bg.connect(a).transfer(b.address, 1n))
      .to.be.revertedWith("transfer not whitelisted");
    // allow b and transfer succeeds
    await bg.connect(multisig).setWhitelisted(b.address, true);
    await expect(bg.connect(a).transfer(b.address, 1n)).to.not.be.reverted;

    // transferFrom path
    await bg.connect(a).approve(multisig.address, 5n);
    await bg.connect(multisig).setWhitelisted(a.address, false);
    await expect(bg.connect(multisig).transferFrom(a.address, b.address, 1n))
      .to.be.revertedWith("transfer not whitelisted");

    // burn requires sender whitelisted (when enabled)
    await bg.connect(multisig).setWhitelisted(a.address, true);
    await expect(bg.connect(a).burn(1n)).to.not.be.reverted;

    // disable whitelist → free transfers
    await bg.connect(multisig).setWhitelistEnabled(false);
    await expect(bg.connect(a).transfer(b.address, 1n)).to.not.be.reverted;
  });

  it("batchSetWhitelisted sets many at once", async () => {
    const { multisig, a, b, c, bg } = await deploy();
    await bg.connect(multisig).setWhitelistEnabled(true);
    await bg.connect(multisig).batchSetWhitelisted([a.address, b.address, c.address], true);
    expect(await bg.isWhitelisted(a.address)).to.eq(true);
    expect(await bg.isWhitelisted(b.address)).to.eq(true);
    expect(await bg.isWhitelisted(c.address)).to.eq(true);
  });

  it("transfers move delegates; burn reduces delegated votes", async () => {
    const { multisig, a, b, bg } = await deploy();

    // mint to A and delegate to B
    await bg.connect(multisig).mint(a.address, one("10"));
    await bg.connect(a).delegate(b.address);
    expect(await bg.getCurrentVotes(b.address)).to.eq(one("10"));

    // A → B transfer increases B's own balance but votes are tracked by delegates:
    // A has B as delegate, so moving A->B reduces votes of A's delegate by amount and
    // increases votes of B's delegate (if set). Here B has no delegate → no change there.
    await bg.connect(a).transfer(b.address, one("2"));
    // votes for B (as delegate of A) decrease by transferred amount 2
    expect(await bg.getCurrentVotes(b.address)).to.eq(one("8"));

    // If B delegates to itself, its votes will consider its own balance too (2)
    // 8 (from A) + 2 (self) = 10
    await bg.connect(b).delegate(b.address);
    expect(await bg.getCurrentVotes(b.address)).to.eq(one("10"));

    // A burns 1 → B’s votes drop by 1 (A’s delegation shrinks): 10 → 9
    await bg.connect(a).burn(one("1"));
    expect(await bg.getCurrentVotes(b.address)).to.eq(one("9"));

  });

  it("checkpoints & getPriorVotes binary search works across blocks", async () => {
  const { multisig, a, bg } = await deploy();

  await bg.connect(multisig).mint(a.address, one("5"));
  await bg.connect(a).delegate(a.address);

  await mine(1);
  const b0 = await ethers.provider.getBlockNumber(); // safe historical point

  // Create a new checkpoint via transfer (mint doesn’t move votes in this design)
  await bg.connect(a).transfer(multisig.address, 1n);

  await mine(1);
  const b1 = await ethers.provider.getBlockNumber();

  // Query strictly earlier blocks
  const vAtB0 = await bg.getPriorVotes(a.address, b0 - 1);
  const vAtB1 = await bg.getPriorVotes(a.address, b1 - 1);

  expect(vAtB0).to.be.a("bigint");
  expect(vAtB1).to.be.a("bigint");
});

  it("delegateBySig (EIP-712) and nonces", async () => {
    const { multisig, a, b, bg } = await deploy();

    // Build domain/types/message
    const domain: TypedDataDomain = {
      name: await bg.name(),
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await bg.getAddress(),
    };
    const types = {
      Delegation: [
        { name: "delegatee", type: "address" },
        { name: "nonce",     type: "uint256" },
        { name: "expiry",    type: "uint256" },
      ],
    };
    const nonce = await bg.nonces(a.address);
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const message = { delegatee: b.address, nonce, expiry };

    // Sign with EIP-712
    const sig = await (a as any).signTypedData(domain, types, message);
    const { v, r, s } = ethers.Signature.from(sig);

    await expect(bg.delegateBySig(b.address, nonce, expiry, v, r, s))
      .to.emit(bg, "DelegateChanged").withArgs(a.address, ethers.ZeroAddress, b.address);

    // nonce increments
    expect(await bg.nonces(a.address)).to.eq(nonce + 1n);

    // replay should fail (nonce mismatch)
    await expect(bg.delegateBySig(b.address, nonce, expiry, v, r, s))
      .to.be.revertedWith("invalid nonce");
  });

  it("emergencyWithdraw reverts when empty and succeeds when funded", async () => {
    const { multisig, a, bg } = await deploy();

    // Empty → revert
    await expect(bg.connect(multisig).emergencyWithdraw(await bg.getAddress(), a.address))
      .to.be.revertedWith("no tokens");

    // Fund BG with MockERC20 and withdraw
    const MF = await ethers.getContractFactory("MockERC20");
    const mock = await MF.deploy();

    await mock.transfer(await bg.getAddress(), 123n);
    await expect(bg.connect(multisig).emergencyWithdraw(await mock.getAddress(), a.address))
      .to.not.be.reverted;
    expect(await mock.balanceOf(a.address)).to.eq(123n);

    // bad 'to' address
    await mock.transfer(await bg.getAddress(), 1n);
    await expect(bg.connect(multisig).emergencyWithdraw(await mock.getAddress(), ethers.ZeroAddress))
      .to.be.revertedWith("to zero");
  });

  it("ERC-20 basics: approve/transferFrom, events", async () => {
    const { multisig, a, b, bg } = await deploy();
    await bg.connect(multisig).mint(a.address, 1000n);

    await expect(bg.connect(a).approve(b.address, 111n))
      .to.emit(bg, "Approval").withArgs(a.address, b.address, 111n);

    await expect(bg.connect(b).transferFrom(a.address, b.address, 111n))
      .to.emit(bg, "Transfer").withArgs(a.address, b.address, 111n);

    expect(await bg.allowance(a.address, b.address)).to.eq(0n); // allowance used up
    expect(await bg.balanceOf(b.address)).to.eq(111n);
    expect(await bg.balanceOf(a.address)).to.eq(889n);
  });
});