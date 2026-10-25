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
}

export function isRecipeData(value: unknown): value is RecipeData {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.title !== "string" ||
    typeof candidate.prepTime !== "string" ||
    typeof candidate.calories !== "number" ||
    typeof candidate.matchPercentage !== "number" ||
    !Array.isArray(candidate.usedIngredients) ||
    !candidate.usedIngredients.every((item) => typeof item === "string") ||
    !Array.isArray(candidate.steps) ||
    !candidate.steps.every((item) => typeof item === "string") ||
    typeof candidate.macros !== "object" ||
    candidate.macros === null
  ) {
    return false;
  }

  const macros = candidate.macros as Record<string, unknown>;
  return (
    typeof macros.protein === "number" &&
    typeof macros.carbs === "number" &&
    typeof macros.fats === "number"
  );
}
