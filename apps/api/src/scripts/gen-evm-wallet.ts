/**
 * Generate throwaway Base Sepolia testnet wallets and write them to apps/api/.env
 * (gitignored). TESTNET ONLY -- never fund these with real assets. Private keys
 * are written to disk but never printed to the console.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { API_ENV_PATH } from "./env-loader";

function upsertEnv(content: string, updates: Record<string, string>): string {
  const lines = content.length ? content.split("\n") : [];
  for (const [k, v] of Object.entries(updates)) {
    const idx = lines.findIndex((l) => new RegExp(`^\\s*${k}\\s*=`).test(l));
    const entry = `${k}=${v}`;
    if (idx >= 0) lines[idx] = entry;
    else lines.push(entry);
  }
  return lines.join("\n").replace(/\n+$/, "") + "\n";
}

function main(): void {
  const treasuryPk = generatePrivateKey();
  const hkPk = generatePrivateKey();
  const treasury = privateKeyToAccount(treasuryPk);
  const hk = privateKeyToAccount(hkPk);

  const existing = existsSync(API_ENV_PATH) ? readFileSync(API_ENV_PATH, "utf8") : "";
  const updated = upsertEnv(existing, {
    CUSTODY_PROVIDER: "evm",
    EVM_TREASURY_PRIVATE_KEY: treasuryPk,
    EVM_TREASURY_ADDRESS: treasury.address,
    EVM_HK_PRIVATE_KEY: hkPk,
    EVM_HK_ADDRESS: hk.address,
  });
  writeFileSync(API_ENV_PATH, updated, "utf8");

  console.log("Generated throwaway Base Sepolia testnet wallets -> apps/api/.env (gitignored)\n");
  console.log(`  treasury (sender):    ${treasury.address}`);
  console.log(`  hk       (recipient): ${hk.address}`);
  console.log("\nPrivate keys were written to .env and are NOT printed here. TESTNET ONLY.\n");
  console.log("Next — fund the TREASURY address on Base Sepolia:");
  console.log("  1) Gas (ETH):  any Base Sepolia ETH faucet (e.g. https://www.alchemy.com/faucets/base-sepolia)");
  console.log("  2) USDC:       https://faucet.circle.com  (select Base Sepolia)");
  console.log("\nThen run:  pnpm --filter @bandari/api stablecoin:test");
}

main();
