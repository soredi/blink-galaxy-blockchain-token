import { ethers } from "hardhat";

async function main() {
  const { CONTRACT_ADDRESS, ACCOUNT, ALLOWED } = process.env;
  if (!CONTRACT_ADDRESS || !ACCOUNT || ALLOWED === undefined) throw new Error("Set CONTRACT_ADDRESS, ACCOUNT, ALLOWED");
  const allowed = ALLOWED === "true";
  const bg = await ethers.getContractAt("BlinkGalaxy", CONTRACT_ADDRESS);
  const tx = await bg.setWhitelisted(ACCOUNT, allowed);
  console.log("whitelist tx:", tx.hash);
  await tx.wait();
}
main().catch((e)=>{console.error(e);process.exit(1);});