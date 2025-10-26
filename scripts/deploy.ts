import { ethers } from "hardhat";
import * as fs from "fs";

async function main() {
  const multisig = process.env.MULTISIG as string;
  if (!multisig) throw new Error("Set MULTISIG in .env");

  const Factory = await ethers.getContractFactory("BlinkGalaxy");
  const contract = await Factory.deploy(multisig);
  const address = await contract.getAddress();
  console.log("BlinkGalaxy deployed to:", address);

  // save address
  const network = (await ethers.provider.getNetwork()).name;
  const path = "addresses.json";
  let data: any = {};
  if (fs.existsSync(path)) data = JSON.parse(fs.readFileSync(path, "utf8"));
  data[network] = { BlinkGalaxy: address };
  fs.writeFileSync(path, JSON.stringify(data, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });