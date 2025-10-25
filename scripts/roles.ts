import { ethers } from "hardhat";
import { keccak256, toUtf8Bytes } from "ethers";

async function main() {
  const { CONTRACT_ADDRESS, ROLE, ACCOUNT, ACTION } = process.env;
  if (!CONTRACT_ADDRESS || !ROLE || !ACCOUNT || !ACTION) throw new Error("Set CONTRACT_ADDRESS, ROLE, ACCOUNT, ACTION");
  const roleHash = keccak256(toUtf8Bytes(ROLE)); // e.g. "MINTER_ROLE"
  const bg = await ethers.getContractAt("BlinkGalaxy", CONTRACT_ADDRESS);
  const tx = ACTION === "grant" ? await bg.grantRole(roleHash, ACCOUNT)
                                : await bg.revokeRole(roleHash, ACCOUNT);
  console.log(`${ACTION}Role tx:`, tx.hash);
  await tx.wait();
}
main().catch((e)=>{console.error(e);process.exit(1);});
