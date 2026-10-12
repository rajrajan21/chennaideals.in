
import type { Request, Response } from "express";
import path from "node:path";
import fs from "node:fs";
import { UPLOAD_DIR } from "../../lib/uploads.js";

export default async function handler(req: Request, res: Response) {
  try {
    const rawName = req.params.name;
    const name = Array.isArray(rawName) ? rawName[0] : rawName;

    // Only allow simple filenames, not directory traversal.
    if (
      !name ||
      name !== path.basename(name) ||
      !/^[a-f0-9]{32}\.(jpg|png|webp|mp4|webm)$/i.test(name)
    ) {
      return res.status(400).json({ error: "Invalid upload filename" });
    }

    const filePath = path.resolve(UPLOAD_DIR, name);
    const safeRoot = path.resolve(UPLOAD_DIR) + path.sep;

    if (!filePath.startsWith(safeRoot)) {
      return res.status(400).json({ error: "Invalid upload path" });
    }

    // Locally stored files are served from the uploads directory.
    try {
      const stat = await fs.promises.stat(filePath);
      if (!stat.isFile()) {
        return res.status(404).json({ error: "Upload not found" });
      }
    } catch {
      return res.status(404).json({ error: "Upload not found" });
    }

    const ext = path.extname(name).toLowerCase();
    const contentTypes: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".mp4": "video/mp4",
      ".webm": "video/webm",
    };

    res.setHeader("Content-Type", contentTypes[ext]);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    return res.sendFile(filePath);
  } catch (error) {
    console.error("upload.get.failed", error);
    return res.status(500).json({ error: "Unable to serve upload" });
  }
}
