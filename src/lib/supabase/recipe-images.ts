import "server-only";

import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const RECIPE_IMAGE_BUCKET = "recipe-images";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_HOSTS = new Set(["pixabay.com", "cdn.pixabay.com"]);

function isAllowedImageUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      [...ALLOWED_IMAGE_HOSTS].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}

function isStoredRecipeImage(value: string) {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return false;
  try {
    const image = new URL(value);
    const project = new URL(supabaseUrl);
    return (
      image.protocol === project.protocol &&
      image.origin === project.origin &&
      image.pathname.startsWith(`/storage/v1/object/public/${RECIPE_IMAGE_BUCKET}/`)
    );
  } catch {
    return false;
  }
}

function extensionForContentType(contentType: string) {
  switch (contentType.split(";")[0]?.trim().toLowerCase()) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

export async function persistRecipeImage(imageUrl: string, timeoutMs = 10_000) {
  if (!isAllowedImageUrl(imageUrl)) {
    throw new Error("Recipe image host is not allowed.");
  }

  const imageResponse = await fetch(imageUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
    headers: { Accept: "image/jpeg,image/png,image/webp" },
  });
  if (!imageResponse.ok) {
    throw new Error(`Recipe image download failed with status ${imageResponse.status}.`);
  }

  const declaredLength = Number(imageResponse.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_IMAGE_BYTES) {
    throw new Error("Recipe image exceeds the maximum allowed size.");
  }

  const contentType = imageResponse.headers.get("content-type") ?? "";
  const extension = extensionForContentType(contentType);
  if (!extension) {
    throw new Error("Recipe image has an unsupported content type.");
  }

  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error("Recipe image has an invalid size.");
  }

  const imageHash = createHash("sha256").update(imageUrl).digest("hex");
  const path = `${imageHash}.${extension}`;
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(RECIPE_IMAGE_BUCKET)
    .upload(path, bytes, {
      contentType: contentType.split(";")[0]?.trim(),
      cacheControl: "31536000",
      upsert: true,
    });

  if (error) {
    throw new Error(`Recipe image upload failed: ${error.message}`);
  }

  return supabase.storage.from(RECIPE_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function stabilizeRecipeImage(imageUrl: string | undefined) {
  if (!imageUrl || isStoredRecipeImage(imageUrl)) return imageUrl;
  if (!isAllowedImageUrl(imageUrl)) return undefined;
  try {
    return await persistRecipeImage(imageUrl, 2_500);
  } catch (error) {
    console.warn(
      "Could not move an existing recipe image to Supabase Storage:",
      error instanceof Error ? error.message : "unknown",
    );
    return imageUrl;
  }
}
