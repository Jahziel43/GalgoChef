import { NextResponse } from "next/server";
import {
  allergyOptions,
  dietaryLabels,
  findDietaryConflicts,
  isAllergyId,
  isIntoleranceId,
  intoleranceOptions,
  normalizeDietaryText,
} from "@/lib/dietary";
import { getAuthenticatedProfile } from "@/lib/supabase/profile";
import type { RecipeData } from "@/lib/recipe";

interface GeneratedRecipe {
  title: string;
  prepTime: string;
  calories: number;
  macros: RecipeData["macros"];
  usedIngredients: string[];
  steps: string[];
}

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
    candidate.steps.length > 12 ||
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

function parseRecipeJson(raw: unknown): unknown {
  const text = typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw);
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty recipe output");

  const candidates = [
    trimmed
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim(),
  ];

  const firstObject = trimmed.search(/[\[{]/);
  const lastObject = trimmed.search(/[\]}]/);
  if (firstObject !== -1) {
    const endIndex = Math.max(
      trimmed.lastIndexOf("}"),
      trimmed.lastIndexOf("]"),
    );
    if (endIndex > firstObject) {
      candidates.push(trimmed.slice(firstObject, endIndex + 1));
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // keep trying
    }
  }

  const match = trimmed.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // no-op
    }
  }

  throw new Error("Recipe output is not valid JSON");
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
          maxOutputTokens: 512,
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
    const { profile, user, error } = await getAuthenticatedProfile();
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
  if (inputConflicts.length) {
    return NextResponse.json(
      {
        error: `La selección incluye ingredientes que podrían coincidir con tus restricciones: ${dietaryLabels(inputConflicts).join(", ")}. Revisa los ingredientes antes de continuar.`,
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
    };

    const userPrompt = [
      "Genera una receta realista en español.",
      `Ingredientes disponibles: ${recipeRequest.ingredients.join(", ") || "ninguno"}.`,
      `Restricciones: alergias ${recipeRequest.allergies.length ? recipeRequest.allergies.join(", ") : "ninguna"}; intolerancias ${recipeRequest.intolerances.length ? recipeRequest.intolerances.join(", ") : "ninguna"}.`,
      "Usa principalmente estos ingredientes y solo agrega agua, sal y aceite si hace falta.",
      "No menciones alergias ni intolerancias en la receta; solo respétalas.",
      "Devuelve un único objeto JSON con esta forma: {\"title\":\"string\",\"prepTime\":\"string\",\"calories\":123,\"macros\":{\"protein\":10,\"carbs\":15,\"fats\":8},\"usedIngredients\":[\"ingrediente 1\"],\"steps\":[\"Paso 1\"]}.",
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

    let generated: unknown;
    try {
      generated = parseRecipeJson(messageContent);
    } catch (error) {
      console.error("AI returned malformed recipe JSON.", {
        raw: String(messageContent).slice(0, 1200),
      });
      return NextResponse.json(
        { error: "La IA devolvió datos con formato incorrecto." },
        { status: 502 },
      );
    }

    if (!isGeneratedRecipe(generated)) {
      console.error("AI recipe did not match the expected schema.", {
        generated,
      });
      return NextResponse.json(
        { error: "La IA devolvió una receta incompleta. Inténtalo otra vez." },
        { status: 502 },
      );
    }

    const resultConflicts = findDietaryConflicts(
      [
        generated.title,
        ...generated.usedIngredients,
        ...generated.steps,
      ].join(" "),
      allergies,
      intolerances,
    );
    if (resultConflicts.length) {
      return NextResponse.json(
        {
          error: `La receta generada podría contener términos relacionados con tus restricciones (${dietaryLabels(resultConflicts).join(", ")}). No la uses sin revisar cuidadosamente los ingredientes.`,
        },
        { status: 422 },
      );
    }

    const matchedIngredients = uniqueIngredients.filter((selected) => {
      return generated.usedIngredients.some((used) =>
        ingredientWordsMatch(selected, used),
      );
    });

    if (matchedIngredients.length === 0) {
      return NextResponse.json(
        { error: "La receta no utilizó ingredientes de tu selección. Inténtalo otra vez." },
        { status: 502 },
      );
    }

    const recipe: RecipeData = {
      ...generated,
      matchPercentage: Math.min(
        99,
        Math.round((matchedIngredients.length / uniqueIngredients.length) * 100),
      ),
      ...(await findRecipeImage(generated.title, generated.usedIngredients)),
    };

    return NextResponse.json(recipe);
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
