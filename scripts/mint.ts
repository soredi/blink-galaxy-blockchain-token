import { ethers } from "hardhat";

async function main() {
  const { CONTRACT_ADDRESS, TO, AMOUNT } = process.env;
  if (!CONTRACT_ADDRESS || !TO || !AMOUNT) throw new Error("Set CONTRACT_ADDRESS, TO, AMOUNT");
  const bg = await ethers.getContractAt("BlinkGalaxy", CONTRACT_ADDRESS);
  const tx = await bg.mint(TO, AMOUNT); // AMOUNT in wei (string ok)
  console.log("mint tx:", tx.hash);
  await tx.wait();
  console.log("minted");
}
main().catch((e)=>{console.error(e);process.exit(1);});