import type { BrandPhoto } from "@/lib/brand/model";

export type UploadResult = { photo?: BrandPhoto; logoPath?: string; url?: string; error?: string };

// Vercel rejects request bodies over ~4.5 MB before our route runs, and phone photos are often larger.
// The server downsizes to 1600px anyway, so shrink in the browser first.
const MAX_SIDE = 1600;

async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 3_000_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
  } catch {
    return file; // e.g. HEIC the browser can't decode — let the server try
  }
}

export async function uploadBrandImage(brandId: string, file: File, role: "logo" | "product" | "lifestyle"): Promise<UploadResult> {
  try {
    // Logos keep their original bytes (transparent PNG / SVG), so only photos are shrunk.
    const body = new FormData();
    body.append("file", role === "logo" ? file : await shrink(file));
    body.append("role", role);
    const res = await fetch(`/api/brands/${brandId}/photos`, { method: "POST", body });
    const data = (await res.json().catch(() => null)) as UploadResult | null;
    if (data) return data;
    if (res.status === 413) return { error: "That file is too large to upload. Try a smaller image." };
    return { error: `Upload failed (${res.status}). Please try again.` };
  } catch {
    return { error: "Couldn't reach the server. Check your connection and try again." };
  }
}
