import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
// Connection identifiers are public client configuration, never AWS credentials.
// Fresh checkouts remain usable in device-only mode until a backend is deployed.
let outputs = { version: "1.4" };
try {
  outputs = JSON.parse(readFileSync("amplify_outputs.json", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
mkdirSync("src/assets", { recursive: true });
writeFileSync(
  "src/assets/amplify_outputs.json",
  JSON.stringify(outputs, null, 2) + "\n",
);
console.log(
  outputs.auth && outputs.data
    ? "AWS connection configured."
    : "Device-only mode: no AWS backend configuration.",
);
