import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = resolve(projectRoot, ".env.docker");

function preferredLanAddress() {
  const candidates = Object.entries(networkInterfaces()).flatMap(([name, addresses]) =>
    (addresses ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => ({ name, address: address.address })),
  );

  const score = ({ name, address }) => {
    if (/docker|br-|veth|podman/i.test(name)) return 100;
    if (address.startsWith("192.168.")) return 0;
    if (address.startsWith("10.")) return 1;
    if (address.startsWith("172.")) return 2;
    return 10;
  };

  return candidates.sort((left, right) => score(left) - score(right))[0]?.address;
}

function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const publicJwk = publicKey.export({ format: "jwk" });
  const privateJwk = privateKey.export({ format: "jwk" });

  if (!publicJwk.x || !publicJwk.y || !privateJwk.d) {
    throw new Error("Could not export the generated VAPID key pair.");
  }

  return {
    publicKey: Buffer.concat([
      Buffer.from([4]),
      Buffer.from(publicJwk.x, "base64url"),
      Buffer.from(publicJwk.y, "base64url"),
    ]).toString("base64url"),
    privateKey: privateJwk.d,
  };
}

export function ensureDockerEnvironment() {
  if (existsSync(outputPath)) {
    console.log("Using existing .env.docker file.");
    return outputPath;
  }

  const postgresPassword = randomBytes(24).toString("hex");
  const authSecret = randomBytes(48).toString("base64url");
  const vapid = generateVapidKeys();
  const lanAddress = preferredLanAddress();
  const origins = ["http://localhost:3000", "http://127.0.0.1:3000"];

  if (lanAddress) origins.push(`http://${lanAddress}:3000`);

  const contents = `# Generated for local Docker use. Do not commit this file.
APP_PORT=3000
POSTGRES_PORT=55433
POSTGRES_DB=everyday
POSTGRES_USER=everyday
POSTGRES_PASSWORD=${postgresPassword}
DATABASE_URL=postgresql://everyday:${postgresPassword}@database:5432/everyday

BETTER_AUTH_SECRET=${authSecret}
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_TRUSTED_ORIGINS=${origins.join(",")}

NEXT_PUBLIC_VAPID_PUBLIC_KEY=${vapid.publicKey}
VAPID_PRIVATE_KEY=${vapid.privateKey}
VAPID_SUBJECT=mailto:local@example.com

QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
`;

  writeFileSync(outputPath, contents, { encoding: "utf8", flag: "wx", mode: 0o600 });
  console.log("Created .env.docker with local-only database, auth, and VAPID secrets.");
  if (lanAddress) console.log(`Phone/LAN origin added: http://${lanAddress}:3000`);
  return outputPath;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  ensureDockerEnvironment();
}
