import { run, ethers } from "hardhat";

async function main() {
  const addr = process.env.CONTRACT_ADDRESS as string;
  const multisig = process.env.MULTISIG as string;
  if (!addr || !multisig) throw new Error("Set CONTRACT_ADDRESS and MULTISIG");
  await run("verify:verify", { address: addr, constructorArguments: [multisig] });
}

main().catch((e) => { console.error(e); process.exit(1); });
