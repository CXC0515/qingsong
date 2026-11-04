import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { getWorkspaceContext } from "../../context/workspaceContext";
import {
  getPreparation,
  registerDocumentAsset,
  resolveDocumentAsset,
} from "../preparation/preparationService";
import { PreparationDocumentError } from "./errors";

export async function storeDocumentImage(
  preparationId: string,
  bytes: Buffer,
  fileName: string,
) {
  getPreparation(preparationId);
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw new PreparationDocumentError(
      "IMAGE_SIZE_LIMIT",
      "图片为空或超过10MB，教案未修改。请压缩图片后重试。",
    );
  let metadata: Metadata;
  try {
    metadata = await sharp(bytes, {
      limitInputPixels: 40_000_000,
      animated: false,
    }).metadata();
  } catch {
    throw new PreparationDocumentError(
      "IMAGE_INVALID",
      "图片无法读取，教案未修改。请使用PNG、JPEG、WebP或GIF图片。",
    );
  }
  if (!["png", "jpeg", "webp", "gif"].includes(metadata.format ?? ""))
    throw new PreparationDocumentError(
      "IMAGE_UNSUPPORTED",
      "此图片格式暂不支持，原件保留。请转换为PNG、JPEG、WebP或GIF。",
    );
  const extension = metadata.format === "jpeg" ? "jpg" : metadata.format!;
  const mimeType = `image/${metadata.format}`;
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const identity = createHash("sha256")
    .update(`${preparationId}:${sha256}`)
    .digest("hex");
  const id = `${identity.slice(0, 8)}-${identity.slice(8, 12)}-4${identity.slice(13, 16)}-a${identity.slice(17, 20)}-${identity.slice(20, 32)}`;
  const relativePath = path.join(
    "preparations",
    preparationId,
    "assets",
    `${sha256}.${extension}`,
  );
  const destination = path.join(
    getWorkspaceContext().uploadDirectory,
    relativePath,
  );
  await mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
  try {
    await writeFile(destination, bytes, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  registerDocumentAsset(preparationId, {
    id,
    fileName: `image-${sha256.slice(0, 12)}.${extension}`,
    mimeType,
    sha256,
    relativePath,
    sizeBytes: bytes.length,
  });
  return {
    id,
    url: `/api/preparations/${preparationId}/assets/${id}`,
    fileName,
    mimeType,
    width: metadata.width,
    height: metadata.height,
  };
}

export { resolveDocumentAsset };
