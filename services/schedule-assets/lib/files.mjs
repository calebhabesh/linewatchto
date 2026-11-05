import { createHash, randomBytes } from "node:crypto";
import { open, readFile, rename, rm } from "node:fs/promises";

export const sha256 = data => createHash("sha256").update(data).digest("hex");

/** Writes to a temporary sibling, syncs, then renames: a reader sees the old file or the new one. */
export async function writeFileAtomic(path, data) {
  const temp = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  const handle = await open(temp, "w", 0o644);
  try {
    await handle.writeFile(data);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temp, path);
  } catch (error) {
    await rm(temp, { force: true });
    throw error;
  }
}

export async function writeJsonAtomic(path, value) {
  await writeFileAtomic(path, JSON.stringify(value, null, 2) + "\n");
}

/** Parsed JSON, or null when the file is missing or unreadable. */
export async function readJsonOrNull(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}
