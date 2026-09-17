import { copyFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = fileURLToPath(new URL("../assets/Codicons.ttf", import.meta.url));
const destination = process.platform === "darwin"
  ? join(homedir(), "Library", "Fonts", "Codicons.ttf")
  : join(homedir(), ".local", "share", "fonts", "Codicons.ttf");
mkdirSync(dirname(destination), { recursive: true });
copyFileSync(source, destination);
console.log(`Installed Codicons provider-logo font at ${destination}`);
