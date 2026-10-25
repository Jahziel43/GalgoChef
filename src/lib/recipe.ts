export interface RecipeData {
  title: string;
  prepTime: string;
  calories: number;
  macros: {
    protein: number;
    carbs: number;
    fats: number;
  };
  matchPercentage: number;
  usedIngredients: string[];
  steps: string[];
  imageUrl?: string;
  imagePhotographer?: string;
  imageSourceUrl?: string;
}

export function isRecipeData(value: unknown): value is RecipeData {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  const imageFields = [
    "imageUrl",
    "imagePhotographer",
    "imageSourceUrl",
  ] as const;
  if (
    typeof candidate.title !== "string" ||
    candidate.title.length < 2 ||
    candidate.title.length > 100 ||
    typeof candidate.prepTime !== "string" ||
    candidate.prepTime.length > 30 ||
    typeof candidate.calories !== "number" ||
    !Number.isFinite(candidate.calories) ||
    candidate.calories < 0 ||
    candidate.calories > 5000 ||
    typeof candidate.matchPercentage !== "number" ||
    !Number.isFinite(candidate.matchPercentage) ||
    candidate.matchPercentage < 0 ||
    candidate.matchPercentage > 100 ||
    !Array.isArray(candidate.usedIngredients) ||
    candidate.usedIngredients.length > 20 ||
    !candidate.usedIngredients.every((item) => typeof item === "string") ||
    !Array.isArray(candidate.steps) ||
    candidate.steps.length > 12 ||
    !candidate.steps.every((item) => typeof item === "string") ||
    imageFields.some(
      (field) =>
        field in candidate && typeof candidate[field] !== "string",
    ) ||
    typeof candidate.macros !== "object" ||
    candidate.macros === null
  ) {
    return false;
  }

  const macros = candidate.macros as Record<string, unknown>;
  return (
    typeof macros.protein === "number" &&
    Number.isFinite(macros.protein) &&
    macros.protein >= 0 &&
    typeof macros.carbs === "number" &&
    Number.isFinite(macros.carbs) &&
    macros.carbs >= 0 &&
    typeof macros.fats === "number" &&
    Number.isFinite(macros.fats) &&
    macros.fats >= 0 &&
    (candidate.imagePhotographer === undefined ||
      (typeof candidate.imagePhotographer === "string" &&
        candidate.imagePhotographer.length <= 100)) &&
    isSafeImageUrl(candidate.imageUrl) &&
    isSafeImageUrl(candidate.imageSourceUrl)
  );
}

function isSafeImageUrl(value: unknown) {
  if (value === undefined) return true;
  if (typeof value !== "string") return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
