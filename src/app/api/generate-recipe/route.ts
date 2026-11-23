import { NextResponse } from "next/server";
import {
  allergyOptions,
  dietaryLabels,
  findDietaryConflicts,
  findNamedDietaryConflicts,
  isAllergyId,
  isIntoleranceId,
  intoleranceOptions,
  normalizeDietaryText,
} from "@/lib/dietary";
import { dedupeRecipeStrings } from "@/lib/recipe";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";
import { persistRecipeImage } from "@/lib/supabase/recipe-images";
import type { RecipeData } from "@/lib/recipe";

interface GeneratedRecipe {
  title: string;
  prepTime: string;
  calories: number;
  macros: RecipeData["macros"];
  usedIngredients: string[];
  steps: string[];
}

const MAX_DEBUG_RESPONSE_LENGTH = 12_000;

function isAllergyList(value: unknown): value is import("@/lib/dietary").AllergyId[] {
  return Array.isArray(value) && value.every(isAllergyId);
}

function isIntoleranceList(
  value: unknown,
): value is import("@/lib/dietary").IntoleranceId[] {
  return Array.isArray(value) && value.every(isIntoleranceId);
}

function ingredientWordsMatch(first: string, second: string) {
  const variants = (word: string) => [
    word,
    `${word}s`,
    `${word}es`,
    word.endsWith("s") ? word.slice(0, -1) : word,
    word.endsWith("es") ? word.slice(0, -2) : word,
  ];
  const firstWords = normalizeDietaryText(first).match(/[\p{L}\p{N}]+/gu) ?? [];
  const secondWords =
    normalizeDietaryText(second).match(/[\p{L}\p{N}]+/gu) ?? [];

  return firstWords.some(
    (firstWord) =>
      secondWords.some((secondWord) =>
        variants(firstWord).includes(secondWord),
      ),
  );
}

const generatedRecipeSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    prepTime: { type: "string" },
    calories: { type: "integer" },
    macros: {
      type: "object",
      additionalProperties: false,
      properties: {
        protein: { type: "integer" },
        carbs: { type: "integer" },
        fats: { type: "integer" },
      },
      required: ["protein", "carbs", "fats"],
    },
    usedIngredients: {
      type: "array",
      items: { type: "string" },
    },
    steps: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "title",
    "prepTime",
    "calories",
    "macros",
    "usedIngredients",
    "steps",
  ],
} as const;

function isGeneratedRecipe(value: unknown): value is GeneratedRecipe {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate.title !== "string" ||
    candidate.title.length < 2 ||
    candidate.title.length > 100 ||
    typeof candidate.prepTime !== "string" ||
    candidate.prepTime.length > 30 ||
    typeof candidate.calories !== "number" ||
    !Number.isInteger(candidate.calories) ||
    candidate.calories < 0 ||
    candidate.calories > 5000 ||
    typeof candidate.macros !== "object" ||
    candidate.macros === null ||
    !Array.isArray(candidate.usedIngredients) ||
    candidate.usedIngredients.length < 1 ||
    candidate.usedIngredients.length > 20 ||
    !candidate.usedIngredients.every(
      (item) => typeof item === "string" && item.length > 0 && item.length <= 100,
    ) ||
    !Array.isArray(candidate.steps) ||
    candidate.steps.length < 1 ||
    candidate.steps.length > 6 ||
    !candidate.steps.every(
      (item) => typeof item === "string" && item.length > 0 && item.length <= 400,
    )
  ) {
    return false;
  }

  const macros = candidate.macros as Record<string, unknown>;
  return ["protein", "carbs", "fats"].every(
    (key) =>
      typeof macros[key] === "number" &&
      Number.isInteger(macros[key]) &&
      macros[key] >= 0 &&
      macros[key] <= 1000,
  );
}

function parseNumericField(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? Math.round(value) : undefined;
  }
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();
  const thousandsMatch = trimmed.match(/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?/);
  const match = thousandsMatch ?? trimmed.match(/^-?\d+(?:[.,]\d+)?/);
  if (!match) return undefined;

  const normalized = thousandsMatch
    ? match[0].replaceAll(",", "")
    : match[0].replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : undefined;
}

function normalizeGeneratedRecipe(value: unknown): GeneratedRecipe | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.macros !== "object" || candidate.macros === null) {
    return null;
  }
  const macros = candidate.macros as Record<string, unknown>;
  const normalized = {
    ...candidate,
    calories: parseNumericField(candidate.calories),
    macros: {
      protein: parseNumericField(macros.protein),
      carbs: parseNumericField(macros.carbs),
      fats: parseNumericField(macros.fats),
    },
  };
  return isGeneratedRecipe(normalized) ? normalized : null;
}

function validateGeneratedRecipe(
  recipe: GeneratedRecipe,
  ingredients: string[],
  allergies: string[],
  intolerances: string[],
  customRestrictions: Array<{ name: string; matchTerms: string[] }>,
  dislikedIngredients: string[],
) {
  const recipeText = [
    recipe.title,
    ...recipe.usedIngredients,
    ...recipe.steps,
  ].join(" ");
  const resultConflicts = findDietaryConflicts(
    recipeText,
    allergies,
    intolerances,
  );
  const customResultConflicts = findNamedDietaryConflicts(
    recipeText,
    customRestrictions,
  );
  const dislikedResultConflicts = findNamedDietaryConflicts(
    [recipe.title, ...recipe.usedIngredients].join(" "),
    dislikedIngredients.map((name) => ({ name, matchTerms: [] })),
  );
  const matchedIngredients = ingredients.filter((selected) =>
    recipe.usedIngredients.some((used) => ingredientWordsMatch(selected, used)),
  );

  return {
    resultConflicts,
    customResultConflicts,
    dislikedResultConflicts,
    matchedIngredients,
  };
}

const MAX_RECIPE_JSON_LENGTH = 2_200;

function extractCompleteGeneratedRecipes(responseText: string) {
  const recipesArray = responseText.match(/"recipes"\s*:\s*\[/);
  if (!recipesArray || recipesArray.index === undefined) return [];

  const recipes: GeneratedRecipe[] = [];
  const start = recipesArray.index + recipesArray[0].length;
  let objectStart = -1;
  let objectDepth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < responseText.length; index += 1) {
    const character = responseText[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }
    if (objectDepth === 0) {
      if (character === "]") break;
      if (character === "{") {
        objectStart = index;
        objectDepth = 1;
      }
      continue;
    }

    if (character === "{") objectDepth += 1;
    if (character === "}") {
      objectDepth -= 1;
      if (objectDepth === 0 && objectStart >= 0) {
        try {
          const parsed: unknown = JSON.parse(responseText.slice(objectStart, index + 1));
          const normalized = normalizeGeneratedRecipe(parsed);
          if (normalized && JSON.stringify(parsed).length <= MAX_RECIPE_JSON_LENGTH) {
            recipes.push(normalized);
          }
        } catch {
          // Ignore incomplete or malformed recipe objects and keep completed ones.
        }
        objectStart = -1;
      }
    }
  }

  const uniqueRecipes = new Map<string, GeneratedRecipe>();
  for (const recipe of recipes) {
    const titleKey = normalizeDietaryText(recipe.title)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (titleKey && !uniqueRecipes.has(titleKey)) {
      uniqueRecipes.set(titleKey, recipe);
    }
  }
  return [...uniqueRecipes.values()];
}

function getGeminiModelCandidates() {
  const envModels = (process.env.AI_MODELS ?? process.env.AI_MODEL ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const defaultModels = [
    "gemini-3.8-flash",
    "gemini-3.6-flash",
    "gemini-4-argon",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
  ];

  return [...new Set([...envModels, ...(process.env.AI_MODEL ? [process.env.AI_MODEL] : []), ...defaultModels])].filter(
    (model, index, models) => model && models.indexOf(model) === index,
  );
}

function isGeminiQuotaError(response: Response, payload: unknown) {
  const text = JSON.stringify(payload ?? {});
  return (
    response.status === 429 ||
    /quota|rate limit|resource exhausted|exceeded/i.test(text) ||
    /quota|rate limit|resource exhausted|exceeded/i.test(response.statusText)
  );
}

function isRetryableGeminiFailure(response: Response, payload: unknown) {
  if (response.status === 429 || response.status === 500 || response.status === 502 || response.status === 503) {
    return true;
  }

  const text = JSON.stringify(payload ?? {});
  return /unavailable|temporar|high demand|rate limit|overloaded|try again later|timeout/i.test(text);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGeminiRecipeEndpoint(
  apiKey: string,
  baseUrl: string,
  model: string,
  userPrompt: string,
  maxOutputTokens: number,
) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          role: "system",
          parts: [
            {
              text: "Responde solo con un objeto JSON válido y nada más. No agregues texto, markdown ni explicación.",
            },
          ],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: userPrompt }],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens,
          topP: 0.8,
          candidateCount: 1,
          responseMimeType: "application/json",
          thinkingConfig: {
            thinkingBudget: 0,
            includeThoughts: false,
          },
        },
      }),
      signal: AbortSignal.timeout(30000),
    },
  );

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  return { response, payload };
}

async function requestRecipeResponse(
  apiKey: string,
  baseUrl: string,
  modelsToTry: string[],
  userPrompt: string,
  maxOutputTokens: number,
) {
  let messageContent: string | null = null;
  let lastGeminiError: string | null = null;

  for (const candidateModel of modelsToTry) {
    let lastAttemptFailed = false;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const { response, payload } = await callGeminiRecipeEndpoint(
        apiKey,
        baseUrl,
        candidateModel,
        userPrompt,
        maxOutputTokens,
      );

      if (response.ok) {
        const result: unknown = payload;
        messageContent =
          typeof result === "object" &&
          result !== null &&
          "candidates" in result &&
          Array.isArray(result.candidates) &&
          result.candidates.length > 0 &&
          typeof result.candidates[0] === "object" &&
          result.candidates[0] !== null &&
          "content" in result.candidates[0] &&
          typeof result.candidates[0].content === "object" &&
          result.candidates[0].content !== null &&
          "parts" in result.candidates[0].content &&
          Array.isArray(result.candidates[0].content.parts)
            ? result.candidates[0].content.parts
                .map((part: unknown) =>
                  typeof part === "object" &&
                  part !== null &&
                  "text" in part &&
                  typeof part.text === "string"
                    ? part.text
                    : "",
                )
                .join("")
            : null;

        if (messageContent) {
          return { messageContent, lastGeminiError };
        }

        lastAttemptFailed = true;
        console.warn(`Gemini model ${candidateModel} responded but returned empty content.`);
        break;
      }

      const quotaExceeded = isGeminiQuotaError(response, payload);
      const missingModel =
        response.status === 404 ||
        /not found|no longer available/i.test(JSON.stringify(payload ?? {}));
      const retryable = isRetryableGeminiFailure(response, payload);
      lastGeminiError = `Gemini model ${candidateModel} failed with status ${response.status}.`;

      if (retryable && attempt === 0) {
        console.warn(`${lastGeminiError} Retrying once for transient provider error.`, {
          payload,
        });
        await sleep(1000 * (attempt + 1));
        continue;
      }

      if (quotaExceeded || missingModel) {
        console.warn(lastGeminiError, { payload });
      } else {
        console.error(lastGeminiError, { payload });
      }
      lastAttemptFailed = true;
      break;
    }

    if (!lastAttemptFailed) break;
  }

  return { messageContent, lastGeminiError };
}

function sanitizeImageQuery(value: string) {
  const stopWords = new Set([
    "a",
    "al",
    "as",
    "comida",
    "con",
    "de",
    "del",
    "e",
    "el",
    "en",
    "la",
    "las",
    "los",
    "para",
    "por",
    "receta",
    "sin",
    "su",
    "sus",
    "y",
    "o",
  ]);

  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token && !stopWords.has(token) && token.length > 2)
    .slice(0, 8)
    .join(" ");
}

async function findRecipeImage(title: string, ingredients: string[] = []) {
  const apiKey = process.env.PIXABAY_API_KEY;
  if (!apiKey) {
    console.warn("Pixabay image search skipped: PIXABAY_API_KEY is missing.");
    return {};
  }

  try {
    const normalizedTitle = title.trim();
    const primaryFood = normalizedTitle
      .replace(/^receta\s+de\s+/i, "")
      .replace(/^plato\s+de\s+/i, "")
      .split(/\s+(?:de|con|y|en|a|del|para)\s+/i)[0]
      ?.trim();

    const searchWords = [
      sanitizeImageQuery(primaryFood || normalizedTitle || "comida"),
      sanitizeImageQuery(normalizedTitle || "comida"),
    ].filter(Boolean);

    const fallbackQueries = [
      ...new Set(
        searchWords
          .map((word) => word.split(/\s+/).filter(Boolean).slice(0, 3).join(" "))
          .filter(Boolean),
      ),
      "guiso",
      "comida",
    ].filter(Boolean);

    let bestPhoto: Record<string, unknown> | null = null;

    for (const query of fallbackQueries) {
      const url = new URL("https://pixabay.com/api/");
      url.searchParams.set("key", apiKey);
      url.searchParams.set("q", query.slice(0, 80).trim());
      url.searchParams.set("per_page", "12");
      url.searchParams.set("image_type", "photo");
      url.searchParams.set("category", "food");
      url.searchParams.set("safesearch", "true");
      url.searchParams.set("order", "popular");
      url.searchParams.set("lang", "es");

      const response = await fetch(url.toString(), {
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        console.warn("Pixabay image search failed with status:", response.status, "query:", query);
        continue;
      }

      const data: unknown = await response.json();
      if (
        typeof data !== "object" ||
        data === null ||
        !("hits" in data) ||
        !Array.isArray(data.hits)
      ) {
        console.warn("Pixabay returned an unexpected image response.", { query, data });
        continue;
      }

      const scored = data.hits
        .map((item) => {
          if (typeof item !== "object" || item === null) return null;
          const tags = "tags" in item && typeof item.tags === "string" ? item.tags.toLowerCase() : "";
          const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
          const matchScore = queryTerms.reduce((score, term) => (tags.includes(term) ? score + 3 : score), 0);
          const foodScore = /food|dish|recipe|meal|soup|stew|plate|vegetable|cuisine/i.test(tags) ? 2 : 0;
          const isPhoto = "largeImageURL" in item && typeof item.largeImageURL === "string";
          return isPhoto ? { item, score: matchScore + foodScore } : null;
        })
        .filter((entry): entry is { item: Record<string, unknown>; score: number } => entry !== null)
        .sort((a, b) => b.score - a.score);

      const candidate = scored[0]?.item ?? null;
      if (candidate && "largeImageURL" in candidate && typeof candidate.largeImageURL === "string") {
        bestPhoto = candidate;
        break;
      }
    }

    if (!bestPhoto) {
      return {};
    }

    if (
      !("largeImageURL" in bestPhoto) ||
      typeof bestPhoto.largeImageURL !== "string" ||
      !("user" in bestPhoto) ||
      typeof bestPhoto.user !== "string" ||
      !("pageURL" in bestPhoto) ||
      typeof bestPhoto.pageURL !== "string"
    ) {
      return {};
    }

    return {
      imageUrl: bestPhoto.largeImageURL,
      imagePhotographer: bestPhoto.user,
      imageSourceUrl: bestPhoto.pageURL,
    };
  } catch (error) {
    console.warn(
      "Pixabay image search request failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return {};
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Envía una lista de ingredientes válida." },
      { status: 400 },
    );
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("ingredients" in body) ||
    !Array.isArray(body.ingredients) ||
    body.ingredients.length === 0 ||
    body.ingredients.length > 12
  ) {
    return NextResponse.json(
      { error: "Selecciona entre 1 y 12 ingredientes para continuar." },
      { status: 400 },
    );
  }

  const ingredients: string[] = [];
  for (const ingredient of body.ingredients) {
    if (
      typeof ingredient !== "string" ||
      !ingredient.trim() ||
      ingredient.trim().length > 80
    ) {
      return NextResponse.json(
        { error: "Cada ingrediente debe ser texto de hasta 80 caracteres." },
        { status: 400 },
      );
    }
    ingredients.push(ingredient.trim());
  }

  const uniqueIngredients = [...new Set(ingredients)];
  let allergies: string[] = [];
  let intolerances: string[] = [];

  const requestBody = body as Record<string, unknown>;
  if (
    ("customRestrictions" in requestBody &&
      (!Array.isArray(requestBody.customRestrictions) ||
        !requestBody.customRestrictions.every(
          (item) =>
            typeof item === "object" &&
            item !== null &&
            "name" in item &&
            typeof item.name === "string" &&
            item.name.length <= 100 &&
            "matchTerms" in item &&
            Array.isArray(item.matchTerms) &&
            item.matchTerms.length <= 30 &&
            item.matchTerms.every(
              (term: unknown) => typeof term === "string" && term.length <= 100,
            ),
        ))) ||
    ("dislikedIngredients" in requestBody &&
      (!Array.isArray(requestBody.dislikedIngredients) ||
        requestBody.dislikedIngredients.length > 100 ||
        !requestBody.dislikedIngredients.every(
          (item) => typeof item === "string" && item.length <= 100,
        )))
  ) {
    return NextResponse.json(
      { error: "Las restricciones personalizadas tienen un formato incorrecto." },
      { status: 400 },
    );
  }
  const requestedCustomRestrictions =
    "customRestrictions" in requestBody &&
    Array.isArray(requestBody.customRestrictions) &&
    requestBody.customRestrictions.every(
      (item) =>
        typeof item === "object" &&
        item !== null &&
        "name" in item &&
        typeof item.name === "string" &&
        "matchTerms" in item &&
        Array.isArray(item.matchTerms) &&
        item.matchTerms.every((term: unknown) => typeof term === "string"),
    )
      ? requestBody.customRestrictions.map((item) => {
          const restriction = item as { name: string; matchTerms: string[] };
          return {
            name: restriction.name.slice(0, 100),
            matchTerms: restriction.matchTerms.slice(0, 30).map((term) => term.slice(0, 100)),
          };
        })
      : [];
  const requestedDislikedIngredients =
    "dislikedIngredients" in requestBody &&
    Array.isArray(requestBody.dislikedIngredients) &&
    requestBody.dislikedIngredients.every(
      (item) => typeof item === "string" && item.length <= 100,
    )
      ? requestBody.dislikedIngredients.slice(0, 100)
      : [];
  let customRestrictions = requestedCustomRestrictions;
  let dislikedIngredients = requestedDislikedIngredients;
  if (
    "allergies" in requestBody &&
    (!isAllergyList(requestBody.allergies) ||
      requestBody.allergies.length > allergyOptions.length)
  ) {
    return NextResponse.json(
      { error: "La lista de alergias contiene una opción no válida." },
      { status: 400 },
    );
  }
  if (
    "intolerances" in requestBody &&
    (!isIntoleranceList(requestBody.intolerances) ||
      requestBody.intolerances.length > intoleranceOptions.length)
  ) {
    return NextResponse.json(
      { error: "La lista de intolerancias contiene una opción no válida." },
      { status: 400 },
    );
  }
  if (isAllergyList(requestBody.allergies)) {
    allergies = requestBody.allergies;
  }
  if (isIntoleranceList(requestBody.intolerances)) {
    intolerances = requestBody.intolerances;
  }

  try {
    const { profile, supabase, user, error } = await getAuthenticatedProfile();
    if (error) {
      console.error("Supabase profile lookup failed:", error.code);
      return NextResponse.json(
        { error: "No se pudo comprobar tu perfil alimentario. Inténtalo de nuevo." },
        { status: 503 },
      );
    }
    if (user && !profile) {
      return NextResponse.json(
        { error: "No se pudo cargar tu perfil alimentario." },
        { status: 503 },
      );
    }
    if (profile) {
      allergies = profile.allergies;
      intolerances = profile.intolerances;
    }
    if (user) {
      const { data: preferences, error: preferencesError } = await supabase
        .from("user_dietary_preferences")
        .select("option_id")
        .eq("user_id", user.id);
      if (preferencesError) throw preferencesError;
      const optionIds = (preferences ?? []).map((preference) => preference.option_id);
      if (optionIds.length > 0) {
        const legacyOptionIds = new Set([
          ...allergyOptions.map((option) => `allergy:${option.id}`),
          ...intoleranceOptions.map((option) => `intolerance:${option.id}`),
        ]);
        const { data: options, error: optionsError } = await supabase
          .from("dietary_options")
          .select("id, name, type, match_terms")
          .in("id", optionIds);
        if (optionsError) throw optionsError;
        customRestrictions = (options ?? [])
          .filter((option) => option.type !== "dislike" && !legacyOptionIds.has(option.id))
          .map((option) => ({
            name: option.name,
            matchTerms: option.match_terms ?? [],
          }));
        dislikedIngredients = (options ?? [])
          .filter((option) => option.type === "dislike")
          .flatMap((option) => [option.name, ...(option.match_terms ?? [])]);
      } else {
        customRestrictions = [];
        dislikedIngredients = [];
      }
    }
  } catch (error) {
    console.error(
      "Dietary profile configuration error:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo comprobar tu perfil alimentario. Inténtalo de nuevo." },
      { status: 503 },
    );
  }

  const inputConflicts = findDietaryConflicts(
    uniqueIngredients.join(", "),
    allergies,
    intolerances,
  );
  const customInputConflicts = findNamedDietaryConflicts(
    uniqueIngredients.join(", "),
    customRestrictions,
  );
  const dislikedInputConflicts = findNamedDietaryConflicts(
    uniqueIngredients.join(", "),
    dislikedIngredients.map((name) => ({ name, matchTerms: [] })),
  );
  if (inputConflicts.length || customInputConflicts.length || dislikedInputConflicts.length) {
    return NextResponse.json(
      {
        error: `La selección incluye ingredientes que podrían coincidir con tus restricciones: ${[
          ...dietaryLabels(inputConflicts),
          ...customInputConflicts.map((item) => item.name),
          ...dislikedInputConflicts.map((item) => item.name),
        ].join(", ")}. Revisa los ingredientes antes de continuar.`,
      },
      { status: 422 },
    );
  }

  const baseUrl =
    process.env.AI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
  const apiKey = process.env.AI_MODEL_API_KEY ?? process.env.AI_API_KEY;
  const model = process.env.AI_MODEL ?? "gemini-3.6-flash";
  const geminiModels = getGeminiModelCandidates();

  if (!apiKey) {
    return NextResponse.json(
      {
        error: "Configura AI_MODEL_API_KEY para usar Gemini.",
      },
      { status: 503 },
    );
  }

  const allergyNames = dietaryLabels(allergies);
  const intoleranceNames = dietaryLabels(intolerances);

  try {
    let messageContent: string | null = null;

    const recipeRequest = {
      ingredients: uniqueIngredients,
      allergies: allergyNames,
      intolerances: intoleranceNames,
      customRestrictions,
      dislikedIngredients: [...new Set(dislikedIngredients)],
    };

    const userPrompt = [
      "Genera exactamente 3 recetas realistas en español, diferentes entre sí y sin repetir platos.",
      `Ingredientes disponibles: ${recipeRequest.ingredients.join(", ") || "ninguno"}.`,
      `Restricciones: alergias ${recipeRequest.allergies.length ? recipeRequest.allergies.join(", ") : "ninguna"}; intolerancias ${recipeRequest.intolerances.length ? recipeRequest.intolerances.join(", ") : "ninguna"}.`,
      `Restricciones personalizadas adicionales: ${recipeRequest.customRestrictions.length ? recipeRequest.customRestrictions.map((restriction) => restriction.name).join(", ") : "ninguna"}.`,
      `No incluyas ingredientes que el usuario indicó que no le gustan: ${recipeRequest.dislikedIngredients.length ? recipeRequest.dislikedIngredients.join(", ") : "ninguno"}.`,
      "Varía claramente el tipo de plato, la técnica de preparación y la combinación principal de ingredientes en cada receta.",
      "Usa principalmente los ingredientes disponibles y solo agrega agua, sal y aceite si hace falta.",
      "No menciones alergias ni intolerancias en la receta; solo respétalas.",
      "calories, protein, carbs y fats deben ser números enteros JSON, sin unidades ni comillas.",
      "Limita cada receta a 4 pasos breves y menos de 2200 caracteres.",
      "Devuelve solo un objeto JSON con una propiedad recipes y exactamente 3 recetas. Cada receta lleva title, prepTime, calories, macros (protein, carbs, fats), usedIngredients y steps.",
      "Sin markdown, sin texto extra, sin validación, sin comentarios, sin triple backticks, sin bloques de código."
    ].join(" ");

    let lastGeminiError: string | null = null;
    const modelsToTry = geminiModels.length > 0 ? geminiModels : [model];

    for (const candidateModel of modelsToTry) {
      let lastAttemptFailed = false;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const { response, payload } = await callGeminiRecipeEndpoint(
          apiKey ?? "",
          baseUrl,
          candidateModel,
          userPrompt,
          3072,
        );

        if (response.ok) {
          const result: unknown = payload;
          messageContent =
            typeof result === "object" &&
            result !== null &&
            "candidates" in result &&
            Array.isArray(result.candidates) &&
            result.candidates.length > 0 &&
            typeof result.candidates[0] === "object" &&
            result.candidates[0] !== null &&
            "content" in result.candidates[0] &&
            typeof result.candidates[0].content === "object" &&
            result.candidates[0].content !== null &&
            "parts" in result.candidates[0].content &&
            Array.isArray(result.candidates[0].content.parts)
              ? result.candidates[0].content.parts
                  .map((part: unknown) => {
                    if (
                      typeof part === "object" &&
                      part !== null &&
                      "text" in part &&
                      typeof (part as { text?: unknown }).text === "string"
                    ) {
                      return (part as { text: string }).text;
                    }
                    return "";
                  })
                  .join("")
              : null;

          if (messageContent) {
            lastAttemptFailed = false;
            break;
          }

          lastAttemptFailed = true;
          console.warn(`Gemini model ${candidateModel} responded but returned empty content.`);
          break;
        }

        const quotaExceeded = isGeminiQuotaError(response, payload);
        const missingModel = response.status === 404 || /not found|no longer available/i.test(JSON.stringify(payload ?? {}));
        const retryable = isRetryableGeminiFailure(response, payload);
        lastGeminiError = `Gemini model ${candidateModel} failed with status ${response.status}.`;

        if (retryable && attempt === 0) {
          console.warn(`${lastGeminiError} Retrying once for transient provider error.`, { payload });
          await sleep(1000 * (attempt + 1));
          continue;
        }

        if (quotaExceeded || missingModel) {
          console.warn(lastGeminiError, { payload });
          lastAttemptFailed = true;
          break;
        }

        console.error(lastGeminiError, { payload });
        lastAttemptFailed = true;
        break;
      }

      if (messageContent) {
        break;
      }

      if (!lastAttemptFailed) {
        break;
      }
    }

    if (!messageContent) {
      console.error("Gemini recipe request failed after all fallback models.", {
        lastGeminiError,
        modelsToTry,
      });
      return NextResponse.json(
        { error: "El servicio de recetas no respondió. Inténtalo más tarde." },
        { status: 502 },
      );
    }

    let responseToParse: string | null = messageContent;
    let requestedCount = 3;
    let batchSizeLimit = 3;
    let generationRound = 0;
    const generatedTitleKeys = new Set<string>();
    const excludedTitles: string[] = [];
    const validatedRecipes: Array<{
      generatedRecipe: GeneratedRecipe;
      matchedIngredients: string[];
    }> = [];

    while (validatedRecipes.length < 3 && generationRound < 5) {
      generationRound += 1;
      const currentResponse = responseToParse;
      if (!currentResponse) break;

      const extractedRecipes = extractCompleteGeneratedRecipes(currentResponse);
      if (
        extractedRecipes.length < requestedCount ||
        currentResponse.length > requestedCount * MAX_RECIPE_JSON_LENGTH
      ) {
        console.warn("Gemini returned fewer valid complete recipes than requested.", {
          requestedCount,
          completeRecipes: extractedRecipes.length,
          responseLength: currentResponse.length,
          responseLimit: requestedCount * MAX_RECIPE_JSON_LENGTH,
          rawResponse: currentResponse.slice(0, MAX_DEBUG_RESPONSE_LENGTH),
          truncated: currentResponse.length > MAX_DEBUG_RESPONSE_LENGTH,
        });
      }

      for (const candidate of extractedRecipes) {
        const titleKey = normalizeDietaryText(candidate.title)
          .replace(/[^\p{L}\p{N}\s]/gu, " ")
          .replace(/\s+/g, " ")
          .trim();
        if (!titleKey || generatedTitleKeys.has(titleKey)) continue;

        generatedTitleKeys.add(titleKey);
        excludedTitles.push(candidate.title);
        const validation = validateGeneratedRecipe(
          candidate,
          uniqueIngredients,
          allergies,
          intolerances,
          customRestrictions,
          dislikedIngredients,
        );
        if (
          validation.resultConflicts.length > 0 ||
          validation.customResultConflicts.length > 0 ||
          validation.dislikedResultConflicts.length > 0 ||
          validation.matchedIngredients.length === 0
        ) {
          console.warn("Rejected a generated recipe that failed validation.", {
            title: candidate.title,
            allergyConflicts: validation.resultConflicts,
            customConflicts: validation.customResultConflicts.map((item) => item.name),
            dislikedConflicts: validation.dislikedResultConflicts.map((item) => item.name),
            matchedIngredients: validation.matchedIngredients.length,
          });
          continue;
        }

        validatedRecipes.push({
          generatedRecipe: candidate,
          matchedIngredients: validation.matchedIngredients,
        });
      }

      if (validatedRecipes.length === 3) break;

      if (extractedRecipes.length < requestedCount) {
        const smallerBatchSize =
          extractedRecipes.length || Math.ceil(requestedCount / 2);
        batchSizeLimit = Math.max(1, Math.min(batchSizeLimit, smallerBatchSize));
      }

      if (generationRound >= 5) break;

      requestedCount = Math.min(3 - validatedRecipes.length, batchSizeLimit);
      const maxResponseChars = requestedCount * MAX_RECIPE_JSON_LENGTH;
      const followUpPrompt = [
        `Genera exactamente ${requestedCount} recetas nuevas, distintas entre sí y en español.`,
        `Ingredientes disponibles: ${recipeRequest.ingredients.join(", ")}.`,
        `Restricciones: alergias ${recipeRequest.allergies.join(", ") || "ninguna"}; intolerancias ${recipeRequest.intolerances.join(", ") || "ninguna"}.`,
        `Restricciones adicionales: ${recipeRequest.customRestrictions.map((item) => item.name).join(", ") || "ninguna"}.`,
        `No uses ingredientes que no le gustan al usuario: ${recipeRequest.dislikedIngredients.join(", ") || "ninguno"}.`,
        `No repitas ni hagas variantes de estas recetas: ${excludedTitles.join("; ") || "ninguna"}.`,
        "Usa principalmente los ingredientes disponibles, varía técnica y tipo de plato, y no menciones las restricciones.",
        "calories, protein, carbs y fats deben ser números enteros JSON, sin unidades ni comillas.",
        `Cada receta debe tener máximo 4 pasos breves y menos de ${MAX_RECIPE_JSON_LENGTH} caracteres. Respuesta total máxima: ${maxResponseChars} caracteres.`,
        `Devuelve solo JSON con la propiedad recipes y exactamente ${requestedCount} objetos, cada uno con title, prepTime, calories, macros (protein, carbs, fats), usedIngredients y steps.`,
      ].join(" ");
      const followUp = await requestRecipeResponse(
        apiKey,
        baseUrl,
        modelsToTry,
        followUpPrompt,
        Math.min(3072, requestedCount * 1024),
      );
      if (!followUp.messageContent) {
        console.error("Gemini could not generate the remaining recipes.", {
          requestedCount,
          lastGeminiError: followUp.lastGeminiError,
        });
        responseToParse = null;
        break;
      }
      responseToParse = followUp.messageContent;
    }

    if (validatedRecipes.length !== 3) {
      console.error("Could not assemble three valid, distinct recipes.", {
        generatedCount: validatedRecipes.length,
        generationRounds: generationRound,
        excludedTitles,
      });
      return NextResponse.json(
        { error: "No se pudieron generar tres recetas diferentes y válidas. Inténtalo de nuevo." },
        { status: 502 },
      );
    }

    const recipes = await Promise.all(
      validatedRecipes.map(async ({
        generatedRecipe,
        matchedIngredients,
      }): Promise<RecipeData> => {
        const imageDetails = await findRecipeImage(
          generatedRecipe.title,
          generatedRecipe.usedIngredients,
        );
        let persistentImageUrl = imageDetails.imageUrl;
        if (persistentImageUrl) {
          try {
            persistentImageUrl = await persistRecipeImage(persistentImageUrl);
          } catch (imageError) {
            console.error(
              "Recipe image could not be persisted to Supabase Storage:",
              imageError instanceof Error ? imageError.message : "unknown",
            );
            persistentImageUrl = undefined;
          }
        }
        const imageAttribution = persistentImageUrl
          ? {
              imagePhotographer: imageDetails.imagePhotographer,
              imageSourceUrl: imageDetails.imageSourceUrl,
            }
          : {};

        return {
          ...generatedRecipe,
          usedIngredients: dedupeRecipeStrings(generatedRecipe.usedIngredients).slice(0, 20),
          steps: dedupeRecipeStrings(generatedRecipe.steps).slice(0, 12),
          matchPercentage: Math.min(
            99,
            Math.round((matchedIngredients.length / uniqueIngredients.length) * 100),
          ),
          ...imageAttribution,
          ...(persistentImageUrl ? { imageUrl: persistentImageUrl } : {}),
        };
      }),
    );

    try {
      const { supabase, user, error } = await getAuthenticatedProfile();
      if (!error && user) {
        await Promise.all(
          recipes.map(async (recipe) => {
            const { error: saveError } = await supabase
              .from("recipes")
              .upsert(
                {
                  title: recipe.title.trim(),
                  description: recipe.title.trim(),
                  prep_time: recipe.prepTime,
                  calories: recipe.calories,
                  macros: {
                    protein: recipe.macros.protein,
                    carbs: recipe.macros.carbs,
                    fats: recipe.macros.fats,
                  },
                  used_ingredients: recipe.usedIngredients,
                  steps: recipe.steps,
                  image_url: recipe.imageUrl ?? null,
                  image_photographer: recipe.imagePhotographer ?? null,
                  image_source_url: recipe.imageSourceUrl ?? null,
                  match_percentage: recipe.matchPercentage,
                  created_by: user.id,
                },
                { onConflict: "title" },
              );

            if (saveError) {
              console.warn(
                "Generated recipe persistence failed:",
                saveError.code,
                saveError.message,
              );
            }
          }),
        );
      }
    } catch (saveError) {
      console.warn("Generated recipe persistence error:", saveError);
    }

    return NextResponse.json({ recipes });
  } catch (error) {
    console.error(
      "Gemini recipe generation failed:",
      error instanceof Error ? error.message : "unknown",
    );
    return NextResponse.json(
      { error: "No se pudo generar una receta. Revisa tu conexión e inténtalo de nuevo." },
      { status: 502 },
    );
  }
}
