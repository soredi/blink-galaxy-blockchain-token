import { expect } from "chai";
import { ethers } from "hardhat";

describe("BlinkGalaxy", function () {
  it("deploys with roles and cap", async () => {
    const [deployer, multisig, user] = await ethers.getSigners();
    const F = await ethers.getContractFactory("BlinkGalaxy");
    const bg = await F.deploy(multisig.address);

    expect(await bg.cap()).to.equal(ethers.parseEther("10000000000")); // 10B
    const MINTER_ROLE = await bg.MINTER_ROLE();
    expect(await bg.hasRole(MINTER_ROLE, multisig.address)).to.eq(true);

    await expect(bg.connect(deployer).mint(user.address, 1)).to.be.reverted; // no minter role
  });

  it("whitelist gating works", async () => {
    const [_, multisig, a, b] = await ethers.getSigners();
    const F = await ethers.getContractFactory("BlinkGalaxy");
    const bg = await F.deploy(multisig.address);

    await bg.connect(multisig).setWhitelistEnabled(true);
    await bg.connect(multisig).setWhitelisted(a.address, true);
    await bg.connect(multisig).setWhitelisted(b.address, true);

    await bg.connect(multisig).grantRole(await bg.MINTER_ROLE(), multisig.address);
    await bg.connect(multisig).mint(a.address, ethers.parseEther("1"));

    await expect(bg.connect(a).transfer(b.address, 1)).to.not.be.reverted;
  });
});