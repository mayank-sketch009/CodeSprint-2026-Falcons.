import fs from "node:fs/promises";
import { v2 as cloudinary } from "cloudinary";

const cloudinaryConfigured = Boolean(process.env.CLOUDINARY_URL);
if (cloudinaryConfigured) cloudinary.config({ url: process.env.CLOUDINARY_URL });

export async function persistEvidence(file) {
  if (!cloudinaryConfigured && process.env.NODE_ENV === "production") {
    throw new Error("Configure CLOUDINARY_URL for production evidence storage.");
  }
  if (!cloudinaryConfigured) return file.path;
  const uploaded = await cloudinary.uploader.upload(file.path, {
    folder: "fraud-response-tracker/evidence",
    resource_type: "auto",
    type: "authenticated",
    use_filename: false,
    unique_filename: true,
  });
  return `cloudinary:${uploaded.resource_type}:${uploaded.public_id}`;
}

export async function readEvidence(storagePath) {
  if (!storagePath.startsWith("cloudinary:")) return fs.readFile(storagePath);
  const [, resourceType, publicId] = storagePath.split(":");
  if (!resourceType || !publicId) throw new Error("Evidence storage reference is invalid.");
  const signedUrl = cloudinary.url(publicId, {
    resource_type: resourceType,
    type: "authenticated",
    sign_url: true,
    secure: true,
  });
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("Evidence storage is temporarily unavailable.");
  return Buffer.from(await response.arrayBuffer());
}

export async function removeTemporaryFile(filePath) {
  await fs.unlink(filePath).catch(() => {});
}
