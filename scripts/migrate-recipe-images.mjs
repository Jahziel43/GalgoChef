import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const bucketName = "recipe-images";
const maxImageBytes = 8 * 1024 * 1024;
const pageSize = 100;
const allowedHosts = new Set(["pixabay.com", "cdn.pixabay.com"]);

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env antes de ejecutar la migración.",
  );
}

const projectUrl = new URL(supabaseUrl);
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function isStoredImage(url) {
  try {
    const imageUrl = new URL(url);
    return (
      imageUrl.origin === projectUrl.origin &&
      imageUrl.pathname.startsWith(
        `/storage/v1/object/public/${bucketName}/`,
      )
    );
  } catch {
    return false;
  }
}

function isPixabayUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      [...allowedHosts].some(
        (host) => url.hostname === host || url.hostname.endsWith(`.${host}`),
      )
    );
  } catch {
    return false;
  }
}

function getExtension(contentType) {
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

async function copyImageToStorage(imageUrl) {
  if (!isPixabayUrl(imageUrl)) return null;

  const response = await fetch(imageUrl, {
    signal: AbortSignal.timeout(10_000),
    redirect: "error",
    headers: { Accept: "image/jpeg,image/png,image/webp" },
  });
  if (!response.ok) {
    throw new Error(`descarga HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const extension = getExtension(contentType);
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (!extension || declaredLength > maxImageBytes) {
    throw new Error("tipo o tamaño de imagen no permitido");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > maxImageBytes) {
    throw new Error("tamaño de imagen no válido");
  }

  const hash = createHash("sha256").update(imageUrl).digest("hex");
  const path = `${hash}.${extension}`;
  const { error } = await supabase.storage.from(bucketName).upload(path, bytes, {
    contentType: contentType.split(";")[0]?.trim(),
    cacheControl: "31536000",
    upsert: true,
  });
  if (error) throw new Error(`subida a Storage: ${error.message}`);

  return supabase.storage.from(bucketName).getPublicUrl(path).data.publicUrl;
}

const stats = {
  copied: 0,
  alreadyStored: 0,
  skipped: 0,
  failed: 0,
};
const migratedByUrl = new Map();

async function migrateUrl(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return null;
  if (isStoredImage(imageUrl)) {
    stats.alreadyStored += 1;
    return imageUrl;
  }
  if (migratedByUrl.has(imageUrl)) return migratedByUrl.get(imageUrl);

  try {
    const storedUrl = await copyImageToStorage(imageUrl);
    if (!storedUrl) {
      stats.skipped += 1;
      migratedByUrl.set(imageUrl, null);
      return null;
    }
    stats.copied += 1;
    migratedByUrl.set(imageUrl, storedUrl);
    return storedUrl;
  } catch (error) {
    stats.failed += 1;
    console.warn(
      `No se pudo migrar una imagen: ${
        error instanceof Error ? error.message : "error desconocido"
      }. Se conserva la URL original.`,
    );
    migratedByUrl.set(imageUrl, null);
    return null;
  }
}

async function migrateRecipes() {
  let offset = 0;
  while (true) {
    const { data: rows, error } = await supabase
      .from("recipes")
      .select("id, image_url")
      .not("image_url", "is", null)
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) throw new Error(`No se pudieron leer las recetas: ${error.message}`);
    if (!rows?.length) break;

    for (const row of rows) {
      if (typeof row.image_url !== "string" || isStoredImage(row.image_url)) {
        if (typeof row.image_url === "string") stats.alreadyStored += 1;
        continue;
      }

      const storedUrl = await migrateUrl(row.image_url);
      if (!storedUrl) continue;

      const { error: updateError } = await supabase
        .from("recipes")
        .update({ image_url: storedUrl })
        .eq("id", row.id);
      if (updateError) {
        stats.failed += 1;
        console.warn(`No se pudo actualizar la receta ${row.id}: ${updateError.message}`);
      }
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }
}

async function migrateSavedRecipes() {
  let offset = 0;
  while (true) {
    const { data: rows, error } = await supabase
      .from("saved_recipes")
      .select("id, recipe")
      .order("id")
      .range(offset, offset + pageSize - 1);
    if (error) {
      throw new Error(`No se pudieron leer las recetas guardadas: ${error.message}`);
    }
    if (!rows?.length) break;

    for (const row of rows) {
      const recipe = row.recipe;
      if (
        typeof recipe !== "object" ||
        recipe === null ||
        Array.isArray(recipe) ||
        typeof recipe.imageUrl !== "string" ||
        isStoredImage(recipe.imageUrl)
      ) {
        if (
          typeof recipe === "object" &&
          recipe !== null &&
          !Array.isArray(recipe) &&
          typeof recipe.imageUrl === "string" &&
          isStoredImage(recipe.imageUrl)
        ) {
          stats.alreadyStored += 1;
        }
        continue;
      }

      const storedUrl = await migrateUrl(recipe.imageUrl);
      if (!storedUrl) continue;

      const { error: updateError } = await supabase
        .from("saved_recipes")
        .update({ recipe: { ...recipe, imageUrl: storedUrl } })
        .eq("id", row.id);
      if (updateError) {
        stats.failed += 1;
        console.warn(`No se pudo actualizar el guardado ${row.id}: ${updateError.message}`);
      }
    }

    offset += rows.length;
    if (rows.length < pageSize) break;
  }
}

console.log("Migrando imágenes de recetas a Supabase Storage...");
await migrateRecipes();
await migrateSavedRecipes();
console.log(
  `Proceso terminado. Copiadas: ${stats.copied}; ya guardadas: ${stats.alreadyStored}; omitidas: ${stats.skipped}; fallidas: ${stats.failed}.`,
);
