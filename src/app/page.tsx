"use client";

import {
  ArrowLeft,
  Bookmark,
  Check,
  ChefHat,
  ChevronRight,
  CircleHelp,
  Clock3,
  Compass,
  Flame,
  Grid2X2,
  Leaf,
  LogIn,
  Minus,
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  allergyOptions,
  findDietaryConflicts,
  findNamedDietaryConflicts,
  intoleranceOptions,
  type AllergyId,
  type IntoleranceId,
} from "@/lib/dietary";
import {
  dedupeRecipeStrings,
  isRecipeData,
  normalizeRecipeIngredientKey,
  type RecipeData,
} from "@/lib/recipe";

type Tab = "pantry" | "explore" | "saved" | "account";
type CollectionData = {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  recipes: RecipeData[];
};
type ProfileData = {
  id: string;
  username: string;
  email: string;
  allergies: AllergyId[];
  intolerances: IntoleranceId[];
};
type DietaryOption = {
  id: string;
  name: string;
  type: "allergy" | "intolerance" | "dislike";
  match_terms: string[];
};
const legacyDietaryOptionIds = new Set([
  ...allergyOptions.map((option) => `allergy:${option.id}`),
  ...intoleranceOptions.map((option) => `intolerance:${option.id}`),
]);
type PantryCategory = string;
type PantryIngredient = {
  name: string;
  category: PantryCategory;
  emoji?: string;
};

const fallbackPantryIngredients: PantryIngredient[] = (
  [
    { name: "Huevos", category: "Proteínas" },
    { name: "Espinaca", category: "Verduras" },
    { name: "Tomate", category: "Verduras" },
    { name: "Aguacate", category: "Verduras" },
    { name: "Yogur", category: "Lácteos" },
    { name: "Pollo", category: "Proteínas" },
    { name: "Cebolla", category: "Verduras" },
    { name: "Aceite de oliva", category: "Otros" },
    { name: "Arroz", category: "Otros" },
    { name: "Pasta", category: "Otros" },
    { name: "Papa", category: "Verduras" },
    { name: "Zanahoria", category: "Verduras" },
    { name: "Pimiento", category: "Verduras" },
    { name: "Queso", category: "Lácteos" },
    { name: "Leche", category: "Lácteos" },
    { name: "Atún", category: "Proteínas" },
    { name: "Sardina", category: "Proteínas" },
    { name: "Cerdo", category: "Proteínas" },
    { name: "Res", category: "Proteínas" },
    { name: "Salmón", category: "Proteínas" },
    { name: "Champiñón", category: "Verduras" },
    { name: "Brócoli", category: "Verduras" },
    { name: "Ajo", category: "Verduras" },
    { name: "Jitomate", category: "Verduras" },
    { name: "Perejil", category: "Verduras" },
    { name: "Lentejas", category: "Otros" },
    { name: "Frijoles", category: "Otros" },
    { name: "Pan", category: "Otros" },
    { name: "Tortilla", category: "Otros" },
    { name: "Manzana", category: "Otros" },
    { name: "Plátano", category: "Otros" },
    { name: "Mango", category: "Otros" },
    { name: "Almendras", category: "Otros" },
    { name: "Nueces", category: "Otros" },
    { name: "Avena", category: "Otros" },
    { name: "Garbanzos", category: "Otros" },
    { name: "Pepino", category: "Verduras" },
    { name: "Calabaza", category: "Verduras" },
    { name: "Calabacín", category: "Verduras" },
    { name: "Maíz", category: "Verduras" },
    { name: "Salsa de soya", category: "Otros" },
    { name: "Pera", category: "Otros" },
    { name: "Nueces pecanas", category: "Otros" },
    { name: "Pescado", category: "Proteínas" },
  ] as PantryIngredient[]
).filter(
  (ingredient, index, ingredients) =>
    ingredients.findIndex((candidate) => candidate.name === ingredient.name) === index,
);

const sampleRecipes: RecipeData[] = [
  {
    title: "Omelette de espinaca y tomate",
    prepTime: "15 min",
    calories: 280,
    macros: { protein: 18, fats: 20, carbs: 6 },
    matchPercentage: 96,
    usedIngredients: ["Huevos", "1 taza de espinaca", "1 tomate maduro"],
    steps: [
      "Batir los huevos",
      "Saltear las verduras",
      "Doblar el omelette",
    ],
  },
  {
    title: "Pasta cremosa con pollo",
    prepTime: "20 min",
    calories: 420,
    macros: { protein: 25, fats: 14, carbs: 48 },
    matchPercentage: 92,
    usedIngredients: ["Pollo", "Pasta", "Yogur natural"],
    steps: [
      "Cocer la pasta",
      "Saltear el pollo",
      "Mezclar y servir",
    ],
  },
  {
    title: "Tostadas de aguacate",
    prepTime: "10 min",
    calories: 245,
    macros: { protein: 9, fats: 14, carbs: 22 },
    matchPercentage: 88,
    usedIngredients: ["Aguacate", "Tomate", "Aceite de oliva"],
    steps: [
      "Tostar el pan",
      "Machacar el aguacate",
      "Añadir tomate y servir",
    ],
  },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("account");
  const [filter, setFilter] = useState<string>("Todos");
  const [search, setSearch] = useState("");
  const [showMoreRecipes, setShowMoreRecipes] = useState(false);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [pantryIngredients, setPantryIngredients] = useState<PantryIngredient[]>(fallbackPantryIngredients);
  const [view, setView] = useState<"pantry" | "loading" | "recipe">("pantry");
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [generatedRecipes, setGeneratedRecipes] = useState<RecipeData[]>([]);
  const [generatedRecipeIndex, setGeneratedRecipeIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<string[]>([]);
  const [savedRecipeData, setSavedRecipeData] = useState<RecipeData[]>([]);
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [allergies, setAllergies] = useState<AllergyId[]>([]);
  const [intolerances, setIntolerances] = useState<IntoleranceId[]>([]);
  const [dietaryOptions, setDietaryOptions] = useState<DietaryOption[]>([]);
  const [selectedDietaryOptionIds, setSelectedDietaryOptionIds] = useState<string[]>([]);
  const [guestDislikedIngredients, setGuestDislikedIngredients] = useState<string[]>([]);
  const [exploreRecipes, setExploreRecipes] = useState<RecipeData[]>([]);
  const [collections, setCollections] = useState<CollectionData[]>([]);
  const [showCollectionForm, setShowCollectionForm] = useState(false);
  const [showCollectionPicker, setShowCollectionPicker] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [newCollectionDescription, setNewCollectionDescription] = useState("");
  const [collectionTarget, setCollectionTarget] = useState<RecipeData | null>(null);
  const [selectedCollectionId, setSelectedCollectionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const generationId = useRef(0);

  useEffect(() => {
    void loadSession();
    void loadPantryIngredients();
    void loadDietaryOptions();
  }, []);

  useEffect(() => {
    void loadExploreRecipes();
  }, [selectedIngredients, selectedDietaryOptionIds, allergies, intolerances]);

  useEffect(() => {
    if (profile) {
      void loadCollections(profile);
    } else {
      setCollections([]);
    }
  }, [profile]);

  useEffect(() => {
    const refreshCatalogs = window.setInterval(() => {
      void loadPantryIngredients();
      void loadDietaryOptions();
    }, 30_000);
    return () => window.clearInterval(refreshCatalogs);
  }, []);

  useEffect(() => {
    const dislikedKeys = new Set([
      ...dietaryOptions
        .filter(
          (option) =>
            option.type === "dislike" &&
            selectedDietaryOptionIds.includes(option.id),
        )
        .map((option) => ingredientSelectionKey(option.name)),
      ...guestDislikedIngredients.map(ingredientSelectionKey),
    ]);
    if (dislikedKeys.size === 0) return;

    setSelectedIngredients((current) => {
      const next = current.filter(
        (ingredient) => !dislikedKeys.has(ingredientSelectionKey(ingredient)),
      );
      return next.length === current.length ? current : next;
    });
  }, [dietaryOptions, selectedDietaryOptionIds, guestDislikedIngredients]);

  async function loadPantryIngredients() {
    try {
      const response = await fetch("/api/ingredients");
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudieron cargar los ingredientes."));
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "ingredients" in data &&
        Array.isArray(data.ingredients)
      ) {
        const nextIngredients = data.ingredients
          .filter(
            (ingredient): ingredient is PantryIngredient =>
              typeof ingredient === "object" &&
              ingredient !== null &&
              typeof (ingredient as { name?: unknown }).name === "string" &&
              typeof (ingredient as { category?: unknown }).category === "string",
          )
          .map((ingredient) => ({
            name: ingredient.name,
            category: ingredient.category,
            emoji:
              typeof (ingredient as { emoji?: unknown }).emoji === "string"
                ? (ingredient as { emoji: string }).emoji
                : undefined,
          }));

        if (nextIngredients.length > 0) {
          setPantryIngredients(nextIngredients);
          setSelectedIngredients((current) =>
            dedupeIngredientSelection(
              current.map(
                (selected) =>
                  nextIngredients.find(
                    (ingredient) =>
                      ingredientSelectionKey(ingredient.name) ===
                      ingredientSelectionKey(selected),
                  )?.name ?? selected,
              ),
            ),
          );
          return;
        }
      }

      setPantryIngredients(fallbackPantryIngredients);
    } catch (cause) {
      setPantryIngredients(fallbackPantryIngredients);
      console.warn(
        cause instanceof Error ? cause.message : "No se pudo cargar la despensa.",
      );
    }
  }

  async function loadDietaryOptions() {
    try {
      const response = await fetch("/api/dietary-options");
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudieron cargar las preferencias."));
      }
      if (typeof data !== "object" || data === null) return;
      if ("options" in data && Array.isArray(data.options)) {
        const options = data.options.filter(
          (option): option is DietaryOption =>
            typeof option === "object" &&
            option !== null &&
            typeof (option as { id?: unknown }).id === "string" &&
            typeof (option as { name?: unknown }).name === "string" &&
            ["allergy", "intolerance", "dislike"].includes(
              String((option as { type?: unknown }).type),
            ),
        );
        setDietaryOptions(options);
      }
      if (
        "authenticated" in data &&
        data.authenticated === true &&
        "selectedIds" in data &&
        Array.isArray(data.selectedIds) &&
        data.selectedIds.every((id) => typeof id === "string")
      ) {
        setSelectedDietaryOptionIds(data.selectedIds);
      }
    } catch (cause) {
      console.warn(
        cause instanceof Error ? cause.message : "No se pudieron cargar preferencias.",
      );
    }
  }

  async function toggleDietaryOption(optionId: string, enabled: boolean) {
    const previous = selectedDietaryOptionIds;
    setSelectedDietaryOptionIds((current) =>
      enabled
        ? Array.from(new Set([...current, optionId]))
        : current.filter((id) => id !== optionId),
    );
    if (!profile) return;

    try {
      const response = await fetch("/api/dietary-options", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optionId, enabled }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudo actualizar la restricción."));
      }
      await loadExploreRecipes();
    } catch (cause) {
      setSelectedDietaryOptionIds(previous);
      setError(
        cause instanceof Error ? cause.message : "No se pudo actualizar la restricción.",
      );
    }
  }

  async function toggleDislikedIngredient(name: string) {
    const existingOption = dietaryOptions.find(
      (option) =>
        option.type === "dislike" &&
        normalizeRecipeIngredientKey(option.name) === normalizeRecipeIngredientKey(name),
    );
    const enabled = existingOption
      ? !selectedDietaryOptionIds.includes(existingOption.id)
      : true;

    if (!profile) {
      setGuestDislikedIngredients((current) =>
        enabled
          ? Array.from(new Set([...current, name]))
          : current.filter(
              (item) => normalizeRecipeIngredientKey(item) !== normalizeRecipeIngredientKey(name),
            ),
      );
      if (enabled) {
        setSelectedIngredients((current) =>
          current.filter(
            (item) => ingredientSelectionKey(item) !== ingredientSelectionKey(name),
          ),
        );
      }
      setNotice(
        enabled
          ? `${name} no se usará en las recetas de esta visita.`
          : `${name} ya puede aparecer en las recetas de esta visita.`,
      );
      return;
    }

    try {
      const response = await fetch("/api/dietary-options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dislikeIngredient: name, enabled }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudo guardar el ingrediente que no te gusta."));
      }
      if (enabled) {
        setSelectedIngredients((current) =>
          current.filter(
            (item) => ingredientSelectionKey(item) !== ingredientSelectionKey(name),
          ),
        );
      }
      await loadDietaryOptions();
      setNotice(
        enabled
          ? `${name} se excluirá de tus recetas.`
          : `${name} ya puede aparecer en tus recetas.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar el ingrediente que no te gusta.",
      );
    }
  }

  const selectedCustomRestrictions = dietaryOptions
    .filter(
      (option) =>
        option.type !== "dislike" &&
        !legacyDietaryOptionIds.has(option.id) &&
        selectedDietaryOptionIds.includes(option.id),
    )
    .map((option) => ({ name: option.name, matchTerms: option.match_terms ?? [] }));
  const selectedDislikedIngredients = [
    ...dietaryOptions
      .filter(
        (option) =>
          option.type === "dislike" && selectedDietaryOptionIds.includes(option.id),
      )
      .flatMap((option) => [option.name, ...(option.match_terms ?? [])]),
    ...guestDislikedIngredients,
  ];
  const displayedDislikedIngredients = Array.from(
    new Map(
      [
        ...dietaryOptions
          .filter(
            (option) =>
              option.type === "dislike" &&
              selectedDietaryOptionIds.includes(option.id),
          )
          .map((option) => option.name),
        ...guestDislikedIngredients,
      ].map((name) => [normalizeRecipeIngredientKey(name), name]),
    ).values(),
  );

  async function suggestDietaryOption(name: string) {
    const response = await fetch("/api/dietary-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      throw new Error(getResponseError(data, "No se pudo enviar la sugerencia."));
    }
    if (typeof data === "object" && data !== null && "exists" in data && data.exists) {
      setNotice("Esa opción ya está disponible en la lista.");
    } else if (typeof data === "object" && data !== null && "processing" in data && data.processing) {
      setNotice("Se está revisando el grupo de opciones en segundo plano.");
    } else {
      setNotice("Sugerencia enviada. Se revisará al completar el grupo de 10.");
    }
  }

  async function loadSession() {
    try {
      const response = await fetch("/api/auth/session");
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudo cargar la cuenta."));
      }
      if (
        typeof data !== "object" ||
        data === null ||
        !("user" in data) ||
        !data.user
      ) {
        setProfile(null);
        setSavedRecipeData([]);
        setSavedRecipes([]);
        setCollections([]);
        return;
      }
      const user = data.user as ProfileData;
      setProfile(user);
      setAllergies(user.allergies);
      setIntolerances(user.intolerances);

      const savedResponse = await fetch("/api/saved-recipes");
      const savedData: unknown = await savedResponse.json();
      if (!savedResponse.ok) {
        throw new Error(
          getResponseError(savedData, "No se pudieron cargar tus recetas guardadas."),
        );
      }
      if (
        typeof savedData === "object" &&
        savedData !== null &&
        "recipes" in savedData &&
        Array.isArray(savedData.recipes)
      ) {
        const recipes = savedData.recipes.filter(isRecipeData);
        setSavedRecipeData(recipes);
        setSavedRecipes(recipes.map((item) => item.title));
      }

      await loadCollections(user);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo cargar la cuenta.",
      );
    }
  }

  async function loadCollections(userOverride?: ProfileData | null) {
    const activeProfile = userOverride ?? profile;
    if (!activeProfile) {
      setCollections([]);
      return [] as CollectionData[];
    }

    try {
      const response = await fetch("/api/collections");
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudieron cargar tus colecciones."));
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "collections" in data &&
        Array.isArray(data.collections)
      ) {
        const nextCollections = data.collections.filter(
          (collection): collection is CollectionData =>
            typeof collection === "object" &&
            collection !== null &&
            typeof (collection as { id?: unknown }).id === "string" &&
            typeof (collection as { name?: unknown }).name === "string",
        );
        setCollections(nextCollections);
        return nextCollections;
      }
      setCollections([]);
      return [] as CollectionData[];
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar tus colecciones.",
      );
      return [] as CollectionData[];
    }
  }

  async function loadExploreRecipes() {
    const params = new URLSearchParams();
    if (selectedIngredients.length > 0) {
      params.set("ingredients", selectedIngredients.join(","));
    }

    try {
      const response = await fetch(`/api/recipes${params.toString() ? `?${params.toString()}` : ""}`);
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudieron cargar las recetas del explorador."));
      }
      if (typeof data === "object" && data !== null && "recipes" in data && Array.isArray(data.recipes)) {
        setExploreRecipes(data.recipes.filter(isRecipeData));
      } else {
        setExploreRecipes([]);
      }
    } catch (cause) {
      setExploreRecipes([]);
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar las recetas del explorador.",
      );
    }
  }

  async function createCollection() {
    const name = newCollectionName.trim();
    if (!profile || !name) {
      setError("Escribe un nombre para la colección.");
      return;
    }

    try {
      const response = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: newCollectionDescription.trim(),
        }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudo crear la colección."));
      }
      setNewCollectionName("");
      setNewCollectionDescription("");
      setShowCollectionForm(false);
      const nextCollections = await loadCollections();
      if (collectionTarget && nextCollections && nextCollections.length > 0) {
        setShowCollectionPicker(true);
      }
      setNotice("Colección creada correctamente.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear la colección.",
      );
    }
  }

  async function addRecipeToCollection(collectionId: string, recipeToAdd: RecipeData) {
    try {
      const response = await fetch(`/api/collections/${collectionId}/recipes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipe: recipeToAdd }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudo guardar la receta en la colección."));
      }
      await loadCollections();
      setShowCollectionPicker(false);
      setCollectionTarget(null);
      setNotice("Receta añadida a la colección.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la receta en la colección.",
      );
    }
  }

  async function removeRecipeFromCollection(collectionId: string, recipeTitle: string) {
    try {
      const response = await fetch(`/api/collections/${collectionId}/recipes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: recipeTitle }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudo quitar la receta de la colección."));
      }
      await loadCollections();
      setNotice("Receta quitada de la colección.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo quitar la receta de la colección.",
      );
    }
  }

  function openCollectionPicker(recipe: RecipeData) {
    setCollectionTarget(recipe);
    if (!collections.length) {
      setShowCollectionPicker(true);
      setShowCollectionForm(true);
      return;
    }

    setShowCollectionPicker(true);
    setShowCollectionForm(false);
  }

  function ingredientSelectionKey(value: string) {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("es")
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function dedupeIngredientSelection(values: string[]) {
    const unique = new Map<string, string>();
    for (const value of values) {
      const trimmed = value.trim();
      if (!trimmed) continue;
      const key = ingredientSelectionKey(trimmed);
      if (!key) continue;
      if (!unique.has(key)) {
        unique.set(key, trimmed);
      }
    }
    return [...unique.values()];
  }

  function toggleIngredient(ingredient: string) {
    setSelectedIngredients((current) => {
      const isSelected = current.some(
        (item) => ingredientSelectionKey(item) === ingredientSelectionKey(ingredient),
      );
      if (!isSelected && isIngredientDisliked(ingredient)) return current;
      const next = isSelected
        ? current.filter(
            (item) => ingredientSelectionKey(item) !== ingredientSelectionKey(ingredient),
          )
        : [...current, ingredient];
      return dedupeIngredientSelection(next);
    });
  }

  function isIngredientDisliked(name: string) {
    const key = ingredientSelectionKey(name);
    return (
      dietaryOptions.some(
        (option) =>
          option.type === "dislike" &&
          selectedDietaryOptionIds.includes(option.id) &&
          ingredientSelectionKey(option.name) === key,
      ) ||
      guestDislikedIngredients.some(
        (ingredient) => ingredientSelectionKey(ingredient) === key,
      )
    );
  }

  async function addCustomIngredient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ingredient = search.trim();
    if (!ingredient) return;

    try {
      const response = await fetch("/api/ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: ingredient }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudo añadir el ingrediente."));
      }

      const nextSelected = dedupeIngredientSelection([
        ...selectedIngredients,
        ingredient,
      ]);
      setSelectedIngredients(nextSelected);

      if (typeof data === "object" && data !== null && "queued" in data && data.queued === true) {
        setNotice("Ingrediente añadido a la cola de revisión.");
      } else if (typeof data === "object" && data !== null && "exists" in data && data.exists === true) {
        setNotice("Este ingrediente ya existe en la despensa.");
      } else if (typeof data === "object" && data !== null && "processing" in data && data.processing === true) {
        setNotice("Listo: se está consolidando la lista en segundo plano.");
      } else {
        setNotice("Ingrediente agregado correctamente.");
      }

      if (!(typeof data === "object" && data !== null && "processing" in data && data.processing === true)) {
        await loadPantryIngredients();
      }
      setSearch("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo añadir el ingrediente.",
      );
    }
  }

  async function generateRecipe(ingredients = selectedIngredients) {
    const conflicts = findDietaryConflicts(
      ingredients.join(", "),
      profile?.allergies ?? allergies,
      profile?.intolerances ?? intolerances,
    );
    if (conflicts.length) {
      const labels = [...allergyOptions, ...intoleranceOptions]
        .filter((option) => conflicts.includes(option.id))
        .map((option) => option.label);
      setError(
        `La despensa contiene ingredientes que podrían coincidir con tus restricciones: ${labels.join(", ")}.`,
      );
      return;
    }

    generationId.current += 1;
    const requestId = generationId.current;
    setError("");
    setShareMessage("");
    setTab("pantry");
    setView("loading");

    try {
      const response = await fetch("/api/generate-recipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ingredients,
          allergies,
          intolerances,
          customRestrictions: selectedCustomRestrictions,
          dislikedIngredients: selectedDislikedIngredients,
        }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        throw new Error(
          getResponseError(data, "No pudimos preparar una receta. Inténtalo de nuevo."),
        );
      }

      if (
        typeof data !== "object" ||
        data === null ||
        !("recipes" in data) ||
        !Array.isArray(data.recipes) ||
        data.recipes.length !== 3 ||
        !data.recipes.every(isRecipeData)
      ) {
        throw new Error("Recibimos recetas en un formato inesperado.");
      }

      const normalizedRecipes = data.recipes.map((item) => ({
        ...item,
        usedIngredients: dedupeRecipeStrings(item.usedIngredients),
        steps: dedupeRecipeStrings(item.steps),
      }));

      try {
        if (profile) {
          await Promise.all(
            normalizedRecipes.map(async (generatedRecipe) => {
              const saveResponse = await fetch("/api/recipes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ recipe: generatedRecipe }),
              });
              const saveData: unknown = await saveResponse.json();
              if (!saveResponse.ok) {
                console.warn(
                  "Generated recipe persistence failed:",
                  getResponseError(saveData, "No se pudo guardar la receta."),
                );
              }
            }),
          );
        }
      } catch (saveError) {
        console.warn("Generated recipe persistence error:", saveError);
      }

      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      if (generationId.current !== requestId) return;
      setGeneratedRecipes(normalizedRecipes);
      setGeneratedRecipeIndex(0);
      setRecipe(normalizedRecipes[0]);
      setCompletedSteps([]);
      setSavedRecipes((current) =>
        Array.from(
          new Set([...normalizedRecipes.map((item) => item.title), ...current]),
        ),
      );
      setSavedRecipeData((current) => {
        const byTitle = new Map(current.map((item) => [item.title, item]));
        for (const generatedRecipe of normalizedRecipes) {
          byTitle.set(generatedRecipe.title, generatedRecipe);
        }
        return Array.from(byTitle.values());
      });
      await loadExploreRecipes();
      setShowMoreRecipes(true);
      setView("recipe");
    } catch (cause) {
      if (generationId.current !== requestId) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "No pudimos preparar una receta. Inténtalo de nuevo.",
      );
      setView("pantry");
    }
  }

  function cancelGeneration() {
    generationId.current += 1;
    setView("pantry");
  }

  function showRecipe(recipeToShow: RecipeData) {
    setShareMessage("");
    setGeneratedRecipes([recipeToShow]);
    setGeneratedRecipeIndex(0);
    setRecipe(recipeToShow);
    setCompletedSteps([]);
    setView("recipe");
  }

  function showGeneratedRecipe(index: number) {
    const selectedRecipe = generatedRecipes[index];
    if (!selectedRecipe) return;
    setGeneratedRecipeIndex(index);
    setRecipe(selectedRecipe);
    setCompletedSteps([]);
  }

  async function toggleSaved(recipeToToggle: RecipeData) {
    const isSaved = savedRecipes.includes(recipeToToggle.title);
    if (profile) {
      try {
        const response = await fetch("/api/saved-recipes", {
          method: isSaved ? "DELETE" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            isSaved ? { title: recipeToToggle.title } : { recipe: recipeToToggle },
          ),
        });
        const data: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            getResponseError(data, "No se pudo actualizar la receta guardada."),
          );
        }
        setSavedRecipes((current) =>
          isSaved
            ? current.filter((item) => item !== recipeToToggle.title)
            : [...current, recipeToToggle.title],
        );
        setSavedRecipeData((current) =>
          isSaved
            ? current.filter((item) => item.title !== recipeToToggle.title)
            : [recipeToToggle, ...current.filter((item) => item.title !== recipeToToggle.title)],
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo actualizar la receta guardada.",
        );
      }
      return;
    }

    setSavedRecipes((current) =>
      isSaved
        ? current.filter((item) => item !== recipeToToggle.title)
        : [...current, recipeToToggle.title],
    );
    setSavedRecipeData((current) =>
      isSaved
        ? current.filter((item) => item.title !== recipeToToggle.title)
        : [recipeToToggle, ...current.filter((item) => item.title !== recipeToToggle.title)],
    );
  }

  async function authenticate(
    mode: "login" | "register",
    values: { identifier: string; username?: string; email?: string; password: string },
  ) {
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        mode === "login"
          ? { identifier: values.identifier, password: values.password }
          : {
              username: values.username,
              email: values.email,
              password: values.password,
            },
      ),
    });
    const data: unknown = await response.json();
    if (!response.ok) {
      throw new Error(getResponseError(data, "No se pudo completar el acceso."));
    }
    await loadSession();
    await loadDietaryOptions();
  }

  async function logout() {
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudo cerrar sesión."));
      }
      setProfile(null);
      setSavedRecipes([]);
      setSavedRecipeData([]);
      setAllergies([]);
      setIntolerances([]);
      setSelectedDietaryOptionIds([]);
      setGuestDislikedIngredients([]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo cerrar sesión.");
    }
  }

  async function deleteAccount() {
    const confirmed = window.confirm(
      "¿Eliminar tu cuenta permanentemente? Se borrarán tus recetas, colecciones y preferencias. Esta acción no se puede deshacer.",
    );
    if (!confirmed) return;

    try {
      const response = await fetch("/api/auth/account", { method: "DELETE" });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(getResponseError(data, "No se pudo eliminar la cuenta."));
      }

      setProfile(null);
      setSavedRecipes([]);
      setSavedRecipeData([]);
      setCollections([]);
      setAllergies([]);
      setIntolerances([]);
      setSelectedDietaryOptionIds([]);
      setGuestDislikedIngredients([]);
      setSelectedCollectionId(null);
      setNotice("Tu cuenta y sus datos asociados fueron eliminados.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo eliminar la cuenta.");
    }
  }

  async function saveDietaryPreferences() {
    if (!profile) {
      setNotice(
        "Se usarán en esta sesión. Inicia sesión para sincronizarlas en tu cuenta.",
      );
      return;
    }
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allergies, intolerances }),
      });
      const data: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          getResponseError(data, "No se pudieron guardar tus preferencias."),
        );
      }
      if (
        typeof data === "object" &&
        data !== null &&
        "user" in data &&
        typeof data.user === "object" &&
        data.user !== null
      ) {
        setProfile(data.user as ProfileData);
      }
      await loadExploreRecipes();
      setNotice("Preferencias alimentarias guardadas.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron guardar tus preferencias.",
      );
    }
  }

  function goToTab(nextTab: Tab) {
    setView("pantry");
    setTab(nextTab);
  }

  const recipeSaved = recipe ? savedRecipes.includes(recipe.title) : false;
  const pantryFilters = [
    "Todos",
    ...Array.from(
      new Set(
        pantryIngredients
          .map((ingredient) => ingredient.category)
          .filter((category): category is string => Boolean(category)),
      ),
    )
      .filter((category) => category !== "Otros")
      .sort((left, right) => left.localeCompare(right, "es", { sensitivity: "base" })),
    ...(Array.from(
      new Set(
        pantryIngredients
          .map((ingredient) => ingredient.category)
          .filter((category): category is string => Boolean(category)),
      ),
    ).includes("Otros")
      ? ["Otros"]
      : []),
  ];
  const filteredIngredients = pantryIngredients.filter((ingredient) => {
    const categoryMatches =
      filter === "Todos" || ingredient.category === filter;
    const searchMatches = ingredient.name
      .toLocaleLowerCase("es")
      .includes(search.trim().toLocaleLowerCase("es"));
    return categoryMatches && searchMatches;
  });
  const allRecipes = [
    ...(recipe ? [recipe] : []),
    ...savedRecipeData,
    ...sampleRecipes,
  ].filter(
    (item, index, items) =>
      items.findIndex((candidate) => candidate.title === item.title) === index,
  );
  const exploreCandidates = (exploreRecipes.length > 0 ? exploreRecipes : sampleRecipes).filter(
    (candidate) => {
      const recipeText = [
        candidate.title,
        ...candidate.usedIngredients,
        ...candidate.steps,
      ].join(" ");
      return (
        findDietaryConflicts(recipeText, allergies, intolerances).length === 0 &&
        findNamedDietaryConflicts(recipeText, selectedCustomRestrictions).length === 0 &&
        findNamedDietaryConflicts(
          [candidate.title, ...candidate.usedIngredients].join(" "),
          selectedDislikedIngredients.map((name) => ({ name, matchTerms: [] })),
        ).length === 0
      );
    },
  );
  const displayedRecipes =
    tab === "saved"
      ? allRecipes.filter((item) => savedRecipes.includes(item.title))
      : tab === "explore"
        ? showMoreRecipes
          ? exploreCandidates
          : exploreCandidates.slice(0, 3)
        : showMoreRecipes
          ? allRecipes
          : allRecipes.slice(0, 1);

  return (
    <main className="app-shell">
      {view === "loading" ? (
        <LoadingScreen onCancel={cancelGeneration} />
      ) : (
        <>
          <div className="page-content">
            {error && (
              <div className="error-message" role="alert">
                <CircleHelp size={18} />
                <span>{error}</span>
                <button
                  aria-label="Cerrar aviso"
                  className="icon-button"
                  onClick={() => setError("")}
                  type="button"
                >
                  <X size={17} />
                </button>
              </div>
            )}
            {notice && (
              <div className="status-message" role="status">
                <Check size={17} />
                <span>{notice}</span>
                <button
                  aria-label="Cerrar aviso"
                  className="icon-button"
                  onClick={() => setNotice("")}
                  type="button"
                >
                  <X size={17} />
                </button>
              </div>
            )}

            {view === "recipe" && recipe ? (
              <RecipeScreen
                recipe={recipe}
                alternatives={generatedRecipes}
                selectedAlternative={generatedRecipeIndex}
                onSelectAlternative={showGeneratedRecipe}
                saved={recipeSaved}
                completedSteps={completedSteps}
                shareMessage={shareMessage}
                onBack={() => goToTab(tab)}
                onComplete={() => {
                  setCompletedSteps([]);
                  setRecipe(null);
                  setGeneratedRecipes([]);
                  setGeneratedRecipeIndex(0);
                  setView("pantry");
                  setTab("pantry");
                }}
                onShare={() =>
                  setShareMessage("Puedes compartir esta receta desde tu dispositivo.")
                }
                onToggleSaved={() => void toggleSaved(recipe)}
                onAddToCollection={() => openCollectionPicker(recipe)}
                onToggleStep={(stepIndex) =>
                  setCompletedSteps((current) =>
                    current.includes(stepIndex)
                      ? current.filter((index) => index !== stepIndex)
                      : [...current, stepIndex],
                  )
                }
              />
            ) : tab === "pantry" ? (
              <section aria-labelledby="pantry-title" className="pantry-screen">
                <div className="screen-heading">
                  <div>
                    <h1 id="pantry-title">Mi despensa</h1>
                    <p>
                      {pantryIngredients.length} ingredientes disponibles
                    </p>
                  </div>
                  <button
                    aria-label="Actualizar despensa"
                    className="round-icon-button sync-icon"
                    onClick={() => setError("Tu despensa está actualizada.")}
                    type="button"
                  >
                    <Leaf size={19} />
                  </button>
                </div>

                <form className="search-field" onSubmit={addCustomIngredient}>
                  <Search size={17} aria-hidden="true" />
                  <label className="sr-only" htmlFor="ingredient-search">
                    Buscar o añadir ingrediente
                  </label>
                  <input
                    id="ingredient-search"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar o añadir ingrediente..."
                    value={search}
                  />
                  {search.trim() ? (
                    <button
                      aria-label="Añadir ingrediente"
                      className="search-add"
                      type="submit"
                    >
                      <Plus size={17} />
                    </button>
                  ) : (
                    <button
                      aria-label="Buscar ingrediente"
                      className="search-add"
                      onClick={() => setSearch("")}
                      type="button"
                    >
                      <Plus size={17} />
                    </button>
                  )}
                </form>

                <div
                  aria-label="Filtrar ingredientes"
                  className="filter-chips"
                  onWheel={(event) => {
                    const element = event.currentTarget;
                    const atLeftEdge = element.scrollLeft <= 0 && event.deltaY < 0;
                    const atRightEdge =
                      element.scrollLeft + element.clientWidth >= element.scrollWidth - 2 &&
                      event.deltaY > 0;

                    if (atLeftEdge || atRightEdge) {
                      return;
                    }

                    event.preventDefault();
                    element.scrollLeft += event.deltaY;
                  }}
                >
                  {pantryFilters.map((item) => (
                    <button
                      aria-pressed={filter === item}
                      className={
                        filter === item
                          ? "filter-chip active"
                          : "filter-chip"
                      }
                      key={item}
                      onClick={() => setFilter(item)}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>

                <div className="ingredient-heading">
                  <h2>Elige tus ingredientes</h2>
                  <span>
                    {selectedIngredients.length}{" "}
                    {selectedIngredients.length === 1
                      ? "seleccionado"
                      : "seleccionados"}
                  </span>
                </div>
                <p className="pantry-dislike-help">
                  🤢 Pulsa el emoji junto a un ingrediente para indicar que no
                  te gusta y excluirlo de tus recetas.
                </p>
                {displayedDislikedIngredients.length > 0 && (
                  <div className="pantry-dislikes" aria-label="Ingredientes que no te gustan">
                    <strong>No te gustan:</strong>
                    <div className="pantry-dislike-list">
                      {displayedDislikedIngredients.map((name) => (
                        <button
                          aria-label={`Quitar ${name} de los ingredientes que no te gustan`}
                          key={normalizeRecipeIngredientKey(name)}
                          onClick={() => void toggleDislikedIngredient(name)}
                          title={`Quitar ${name} de los que no te gustan`}
                          type="button"
                        >
                          <span>{name}</span>
                          <span aria-hidden="true">😋</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="pantry-grid">
                  {filteredIngredients.map(({ name, category, emoji }) => {
                    const selected = selectedIngredients.includes(name);
                    const dislikeOption = dietaryOptions.find(
                      (option) =>
                        option.type === "dislike" &&
                        normalizeRecipeIngredientKey(option.name) ===
                          normalizeRecipeIngredientKey(name),
                    );
                    const disliked = dislikeOption
                      ? selectedDietaryOptionIds.includes(dislikeOption.id)
                      : guestDislikedIngredients.some(
                          (item) =>
                            normalizeRecipeIngredientKey(item) ===
                            normalizeRecipeIngredientKey(name),
                        );
                    return (
                      <div
                        className={[
                          "pantry-item",
                          selected && "selected",
                          disliked && "disliked",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        key={name}
                      >
                        <button
                          aria-pressed={selected}
                          disabled={disliked && !selected}
                          className="pantry-item-select"
                          onClick={() => toggleIngredient(name)}
                          type="button"
                        >
                          {emoji && (
                            <span className="ingredient-icon" aria-hidden="true">
                              {emoji}
                            </span>
                          )}
                          <span>{name}</span>
                          {selected ? (
                            <Check className="item-trailing" size={15} />
                          ) : (
                            <span className="item-category">{category}</span>
                          )}
                        </button>
                        <button
                          aria-label={
                            disliked
                              ? `Indicar que te gusta ${name} y quitarlo de los que no te gustan`
                              : `Indicar que no te gusta ${name}`
                          }
                          aria-pressed={disliked}
                          className={
                            disliked ? "ingredient-dislike active" : "ingredient-dislike"
                          }
                          onClick={() => void toggleDislikedIngredient(name)}
                          title={disliked ? "Me gusta; quitar de los que no te gustan" : "No me gusta"}
                          type="button"
                        >
                          {disliked ? "😋" : "🤢"}
                        </button>
                      </div>
                    );
                  })}
                  {filteredIngredients.length === 0 && (
                    <p className="no-results">
                      No encontramos ingredientes con ese nombre.
                    </p>
                  )}
                  {selectedIngredients
                    .filter(
                      (ingredient) =>
                        !pantryIngredients.some(
                          (item) => item.name === ingredient,
                        ),
                    )
                    .map((ingredient) => (
                      <div
                        className="pantry-item selected"
                        key={ingredient}
                      >
                        <button
                          aria-pressed="true"
                          className="pantry-item-select"
                          onClick={() => toggleIngredient(ingredient)}
                          type="button"
                        >
                          <span>{ingredient}</span>
                          <X className="item-trailing" size={15} />
                        </button>
                      </div>
                    ))}
                </div>

                <div className="pantry-note">
                  <Leaf size={16} aria-hidden="true" />
                  <span>
                    Toca los ingredientes que tienes. También puedes ir a
                    Explorar o Guardados con la barra de abajo.
                  </span>
                </div>

                <button
                  className="pantry-cta primary-button"
                  disabled={selectedIngredients.length === 0}
                  onClick={() => generateRecipe()}
                  type="button"
                >
                  <Sparkles size={17} aria-hidden="true" />
                  {selectedIngredients.length === 0
                    ? "Elige ingredientes para continuar"
                    : "Generar recetas con IA"}
                  {selectedIngredients.length > 0 && (
                    <span className="cta-count">
                      {selectedIngredients.length}
                    </span>
                  )}
                </button>
              </section>
            ) : tab === "explore" ? (
              <section aria-labelledby="recipes-title" className="list-screen">
                <div className="screen-heading">
                  <div>
                    <h1 id="recipes-title">Recetas sugeridas</h1>
                    <p>
                      {selectedIngredients.length > 0
                        ? `${selectedIngredients.length} ingredientes seleccionados`
                        : `${exploreCandidates.length} sugerencias para tu despensa`}
                    </p>
                  </div>
                  <button
                    aria-label={
                      selectedIngredients.length > 0
                        ? "Cambiar ingredientes seleccionados en la despensa"
                        : "Elegir ingredientes en la despensa"
                    }
                    className="time-filter"
                    onClick={() => goToTab("pantry")}
                    title="Ir a la despensa"
                    type="button"
                  >
                    <SlidersHorizontal size={14} />
                    {selectedIngredients.length > 0
                      ? "Cambiar ingredientes"
                      : "Elegir ingredientes"}
                  </button>
                </div>
                <div className="explore-highlight">
                  <Sparkles size={14} />
                  {selectedIngredients.length > 0
                    ? "Recetas filtradas por tus ingredientes disponibles"
                    : "Recomendaciones generales para empezar a cocinar"}
                </div>
                <div className="recipe-list">
                  {displayedRecipes.map((suggestion) => (
                    <RecipeCard
                      key={suggestion.title}
                      recipe={suggestion}
                      saved={savedRecipes.includes(suggestion.title)}
                      onOpen={() => showRecipe(suggestion)}
                      onToggleSaved={() => void toggleSaved(suggestion)}
                      onAddToCollection={() => openCollectionPicker(suggestion)}
                    />
                  ))}
                  {displayedRecipes.length === 0 && (
                    <div className="empty-card">
                      <Bookmark size={24} />
                      <h2>No encontramos una receta compatible</h2>
                      <p>Prueba con otros ingredientes o genera una nueva receta.</p>
                      <button onClick={() => goToTab("pantry")} type="button">
                        Volver a la despensa
                      </button>
                    </div>
                  )}
                </div>
                {displayedRecipes.length > 0 && !showMoreRecipes && exploreCandidates.length > 3 && (
                  <button
                    className="more-recipes"
                    onClick={() => setShowMoreRecipes(true)}
                    type="button"
                  >
                    <span className="more-icon">
                      <ChefHat size={17} />
                    </span>
                    <span>
                      <strong>
                        {exploreCandidates.length - 3} recetas más para ti
                      </strong>
                      <small>Con tus ingredientes</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                )}
                {displayedRecipes.length === 0 && (
                  <button
                    className="primary-button"
                    onClick={() => {
                      setTab("pantry");
                      setView("pantry");
                    }}
                    type="button"
                  >
                    <Sparkles size={17} />
                    Generar nueva receta
                  </button>
                )}
              </section>
            ) : tab === "saved" ? (
              <section aria-labelledby="saved-title" className="saved-screen">
                <div className="screen-heading">
                  <div>
                    <h1 id="saved-title">Mis recetas</h1>
                    <p>
                      {profile
                        ? "Sincronizadas con tu cuenta"
                        : "Guardadas durante esta sesión"}
                    </p>
                  </div>
                  <span className="sync-badge">
                    <Leaf size={17} />
                  </span>
                </div>
                <div className="sync-notice">
                  <span className="sync-check">
                    <Check size={16} />
                  </span>
                  <span>
                    <strong>Todo está a mano</strong>
                    <small>
                      {profile
                        ? "Tus recetas están guardadas en tu cuenta"
                        : "Tu lista está disponible mientras usas la app"}
                    </small>
                  </span>
                  <Leaf size={16} />
                </div>

                {selectedCollectionId ? (() => {
                  const selectedCollection = collections.find((collection) => collection.id === selectedCollectionId) ?? null;
                  return (
                    <div className="collection-detail-view">
                      <div className="screen-heading collection-detail-header">
                        <button
                          aria-label="Volver a colecciones"
                          className="round-icon-button"
                          onClick={() => setSelectedCollectionId(null)}
                          type="button"
                        >
                          <ArrowLeft size={19} />
                        </button>
                        <div>
                          <h1>{selectedCollection?.name ?? "Colección"}</h1>
                          <p>{selectedCollection?.recipes.length ?? 0} recetas guardadas</p>
                        </div>
                      </div>
                      {selectedCollection && selectedCollection.recipes.length > 0 ? (
                        <div className="recipe-list">
                          {selectedCollection.recipes.map((recipe) => (
                            <RecipeCard
                              key={`${selectedCollection.id}-${recipe.title}`}
                              compact
                              recipe={recipe}
                              saved
                              onOpen={() => showRecipe(recipe)}
                              onToggleSaved={() => void toggleSaved(recipe)}
                              onAddToCollection={() => openCollectionPicker(recipe)}
                              onRemoveFromCollection={() => void removeRecipeFromCollection(selectedCollection.id, recipe.title)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="empty-card">
                          <Bookmark size={24} />
                          <h2>Esta colección aún está vacía</h2>
                          <p>Añade recetas desde explorar o desde una receta guardada.</p>
                          <button onClick={() => { setSelectedCollectionId(null); goToTab("explore"); }} type="button">
                            Explorar recetas
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })() : (
                  <>
                    <div className="section-subheading">
                      <h2>Colecciones</h2>
                      <span>{collections.length} colecciones</span>
                    </div>
                    <div className="collection-grid">
                      {collections.map((collection) => (
                        <CollectionCard
                          key={collection.id}
                          icon={collection.name.toLowerCase().includes("desayuno") ? "☀️" : collection.name.toLowerCase().includes("prote") ? "💪" : "🥗"}
                          title={collection.name}
                          count={`${collection.recipes.length} recetas`}
                          onClick={() => setSelectedCollectionId(collection.id)}
                        />
                      ))}
                      {showCollectionForm ? (
                        <form
                          className="collection-card new-collection form-card"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void createCollection();
                          }}
                        >
                          <input
                            value={newCollectionName}
                            onChange={(event) => setNewCollectionName(event.target.value)}
                            placeholder="Nombre"
                            aria-label="Nombre de la colección"
                          />
                          <textarea
                            value={newCollectionDescription}
                            onChange={(event) => setNewCollectionDescription(event.target.value)}
                            placeholder="Descripción opcional"
                            aria-label="Descripción de la colección"
                          />
                          <div className="collection-form-actions">
                            <button className="small-button" type="submit">
                              Crear
                            </button>
                            <button
                              className="small-button secondary"
                              onClick={() => setShowCollectionForm(false)}
                              type="button"
                            >
                              Cancelar
                            </button>
                          </div>
                        </form>
                      ) : (
                        <button
                          className="collection-card new-collection"
                          onClick={() => setShowCollectionForm(true)}
                          type="button"
                        >
                          <Plus size={19} />
                          <strong>Nueva colección</strong>
                        </button>
                      )}
                    </div>
                  </>
                )}

                <div className="section-subheading recent-heading">
                  <h2>Guardada recientemente</h2>
                  <span>{savedRecipes.length || ""}</span>
                </div>
                {displayedRecipes.length ? (
                  displayedRecipes.map((savedRecipe) => (
                    <RecipeCard
                      compact
                      key={savedRecipe.title}
                      recipe={savedRecipe}
                      saved
                      onOpen={() => showRecipe(savedRecipe)}
                      onToggleSaved={() => void toggleSaved(savedRecipe)}
                      onAddToCollection={() => openCollectionPicker(savedRecipe)}
                    />
                  ))
                ) : (
                  <div className="empty-card saved-empty">
                    <Bookmark size={24} />
                    <h2>Tus recetas favoritas estarán aquí</h2>
                    <p>
                      Explora las sugerencias y toca el marcador para guardar
                      una receta.
                    </p>
                    <button onClick={() => goToTab("explore")} type="button">
                      Explorar recetas
                    </button>
                  </div>
                )}
              </section>
            ) : (
              <AccountScreen
                profile={profile}
                allergies={allergies}
                intolerances={intolerances}
                dietaryOptions={dietaryOptions}
                selectedDietaryOptionIds={selectedDietaryOptionIds}
                onAllergiesChange={setAllergies}
                onIntolerancesChange={setIntolerances}
                onToggleDietaryOption={toggleDietaryOption}
                onSuggestDietaryOption={suggestDietaryOption}
                onAuthenticate={authenticate}
                onLogout={logout}
                onDeleteAccount={deleteAccount}
                onSavePreferences={saveDietaryPreferences}
              />
            )}
          </div>

          {showCollectionPicker && collectionTarget && (
            <div className="collection-picker-overlay">
              <div className="collection-picker">
                <h3>¿A qué colección la guardas?</h3>
                {showCollectionForm ? (
                  <form
                    className="form-card"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void createCollection();
                    }}
                  >
                    <input
                      value={newCollectionName}
                      onChange={(event) => setNewCollectionName(event.target.value)}
                      placeholder="Nombre de la colección"
                      aria-label="Nombre de la colección"
                    />
                    <textarea
                      value={newCollectionDescription}
                      onChange={(event) => setNewCollectionDescription(event.target.value)}
                      placeholder="Descripción opcional"
                      aria-label="Descripción de la colección"
                    />
                    <div className="collection-form-actions">
                      <button className="small-button" type="submit">
                        Crear
                      </button>
                      <button
                        className="small-button secondary"
                        onClick={() => setShowCollectionForm(false)}
                        type="button"
                      >
                        Cancelar
                      </button>
                    </div>
                  </form>
                ) : (
                  <>
                    <div className="collection-picker-list">
                      {collections.map((collection) => {
                        const alreadyAdded = collectionTarget
                          ? collection.recipes.some((recipe) => recipe.title === collectionTarget.title)
                          : false;

                        return (
                          <button
                            key={collection.id}
                            className={alreadyAdded ? "collection-picker-item selected" : "collection-picker-item"}
                            onClick={() => {
                              if (alreadyAdded) return;
                              void addRecipeToCollection(collection.id, collectionTarget);
                            }}
                            type="button"
                            disabled={alreadyAdded}
                          >
                            <span>{collection.name}</span>
                            <small>{alreadyAdded ? "Ya añadida" : `${collection.recipes.length} recetas`}</small>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      className="small-button secondary full-width"
                      onClick={() => setShowCollectionForm(true)}
                      type="button"
                    >
                      + Nueva colección
                    </button>
                    <button
                      className="small-button secondary full-width"
                      onClick={() => {
                        setCollectionTarget(null);
                        setShowCollectionPicker(false);
                        setShowCollectionForm(false);
                      }}
                      type="button"
                    >
                      Cancelar
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {view !== "recipe" && (
            <nav className="bottom-nav" aria-label="Navegación principal">
              <button
                aria-current={tab === "pantry" ? "page" : undefined}
                className={tab === "pantry" ? "bottom-link active" : "bottom-link"}
                onClick={() => goToTab("pantry")}
                type="button"
              >
                <Grid2X2 size={18} />
                <span>Despensa</span>
              </button>
              <button
                aria-current={tab === "explore" ? "page" : undefined}
                className={tab === "explore" ? "bottom-link active" : "bottom-link"}
                onClick={() => goToTab("explore")}
                type="button"
              >
                <Compass size={18} />
                <span>Explorar</span>
              </button>
              <button
                aria-current={tab === "saved" ? "page" : undefined}
                className={tab === "saved" ? "bottom-link active" : "bottom-link"}
                onClick={() => goToTab("saved")}
                type="button"
              >
                <Bookmark size={18} />
                <span>Guardados</span>
              </button>
              <button
                aria-current={tab === "account" ? "page" : undefined}
                className={tab === "account" ? "bottom-link active" : "bottom-link"}
                onClick={() => goToTab("account")}
                type="button"
              >
                <UserRound size={18} />
                <span>Cuenta</span>
              </button>
            </nav>
          )}
        </>
      )}
    </main>
  );
}

function getResponseError(data: unknown, fallback: string) {
  return typeof data === "object" &&
    data !== null &&
    "error" in data &&
    typeof data.error === "string"
    ? data.error
    : fallback;
}

function AccountScreen({
  profile,
  allergies,
  intolerances,
  dietaryOptions,
  selectedDietaryOptionIds,
  onAllergiesChange,
  onIntolerancesChange,
  onToggleDietaryOption,
  onSuggestDietaryOption,
  onAuthenticate,
  onLogout,
  onDeleteAccount,
  onSavePreferences,
}: {
  profile: ProfileData | null;
  allergies: AllergyId[];
  intolerances: IntoleranceId[];
  dietaryOptions: DietaryOption[];
  selectedDietaryOptionIds: string[];
  onAllergiesChange: (values: AllergyId[]) => void;
  onIntolerancesChange: (values: IntoleranceId[]) => void;
  onToggleDietaryOption: (optionId: string, enabled: boolean) => Promise<void>;
  onSuggestDietaryOption: (name: string) => Promise<void>;
  onAuthenticate: (
    mode: "login" | "register",
    values: {
      identifier: string;
      username?: string;
      email?: string;
      password: string;
    },
  ) => Promise<void>;
  onLogout: () => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onSavePreferences: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [identifier, setIdentifier] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newDietarySuggestion, setNewDietarySuggestion] = useState("");
  const [isSuggestingDietaryOption, setIsSuggestingDietaryOption] = useState(false);

  async function submitAuthentication(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setIsSubmitting(true);
    try {
      await onAuthenticate(mode, {
        identifier,
        username,
        email,
        password,
      });
      setPassword("");
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "No se pudo completar el acceso.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitDietarySuggestion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newDietarySuggestion.trim();
    if (!name) return;
    if (!profile) {
      setFormError("Inicia sesión para proponer una alergia o intolerancia.");
      return;
    }

    setFormError("");
    setIsSuggestingDietaryOption(true);
    try {
      await onSuggestDietaryOption(name);
      setNewDietarySuggestion("");
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "No se pudo enviar la sugerencia.",
      );
    } finally {
      setIsSuggestingDietaryOption(false);
    }
  }

  const customAllergies = dietaryOptions.filter(
    (option) => option.type === "allergy" && !legacyDietaryOptionIds.has(option.id),
  );
  const customIntolerances = dietaryOptions.filter(
    (option) =>
      option.type === "intolerance" && !legacyDietaryOptionIds.has(option.id),
  );
  const selectedDislikes = dietaryOptions.filter(
    (option) =>
      option.type === "dislike" && selectedDietaryOptionIds.includes(option.id),
  );

  return (
    <section aria-labelledby="account-title" className="account-screen">
      <div className="screen-heading">
        <div>
          <h1 id="account-title">Mi cuenta</h1>
          <p>Personaliza tus recetas y restricciones</p>
        </div>
        <span className="sync-badge">
          <UserRound size={18} />
        </span>
      </div>

      {profile ? (
        <div className="account-card">
          <div className="account-user">
            <span className="account-avatar">
              {profile.username.slice(0, 1).toLocaleUpperCase("es")}
            </span>
            <span>
              <strong>@{profile.username}</strong>
              <small>{profile.email}</small>
            </span>
            <button
              className="account-logout"
              onClick={() => void onLogout()}
              type="button"
            >
              Cerrar sesión
            </button>
            <button
              className="account-delete"
              onClick={() => void onDeleteAccount()}
              type="button"
            >
              Eliminar cuenta
            </button>
          </div>
        </div>
      ) : (
        <div className="account-card">
          <div className="auth-tabs" role="tablist" aria-label="Acceso a cuenta">
            <button
              aria-selected={mode === "login"}
              className={mode === "login" ? "auth-tab active" : "auth-tab"}
              onClick={() => {
                setMode("login");
                setFormError("");
              }}
              role="tab"
              type="button"
            >
              Iniciar sesión
            </button>
            <button
              aria-selected={mode === "register"}
              className={mode === "register" ? "auth-tab active" : "auth-tab"}
              onClick={() => {
                setMode("register");
                setFormError("");
              }}
              role="tab"
              type="button"
            >
              Crear cuenta
            </button>
          </div>
          <form className="account-form" onSubmit={submitAuthentication}>
            {mode === "register" ? (
              <>
                <label>
                  Nombre de usuario
                  <input
                    autoComplete="username"
                    maxLength={24}
                    minLength={3}
                    onChange={(event) => setUsername(event.target.value)}
                    pattern="[a-zA-Z0-9_.-]{3,24}"
                    required
                    value={username}
                  />
                </label>
                <label>
                  Correo
                  <input
                    autoComplete="email"
                    onChange={(event) => setEmail(event.target.value)}
                    required
                    type="email"
                    value={email}
                  />
                </label>
              </>
            ) : (
              <label>
                Usuario o correo
                <input
                  autoComplete="username"
                  onChange={(event) => setIdentifier(event.target.value)}
                  required
                  value={identifier}
                />
              </label>
            )}
            <label>
              Contraseña
              <input
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                maxLength={72}
                minLength={mode === "register" ? 8 : undefined}
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </label>
            {formError && (
              <p className="account-form-error" role="alert">
                {formError}
              </p>
            )}
            <button
              className="primary-button account-submit"
              disabled={isSubmitting}
              type="submit"
            >
              <LogIn size={17} />
              {isSubmitting
                ? "Un momento..."
                : mode === "login"
                  ? "Entrar"
                  : "Crear cuenta"}
            </button>
          </form>
          <p className="account-hint">
            Las preferencias sin iniciar sesión solo se usan en esta visita.
          </p>
        </div>
      )}

      <section className="dietary-card" aria-labelledby="dietary-title">
        <div className="dietary-heading">
          <span className="dietary-icon">🌿</span>
          <span>
            <h2 id="dietary-title">Alergias e intolerancias</h2>
            <p>
              {profile
                ? "Se guardan en tu cuenta y se consideran al crear recetas."
                : "Se aplican a las recetas de esta visita."}
            </p>
          </span>
        </div>
        <h3>Alergias</h3>
        <div className="dietary-options">
          {allergyOptions.map((option) => (
            <label className="dietary-option" key={option.id}>
              <input
                checked={allergies.includes(option.id)}
                onChange={(event) =>
                  onAllergiesChange(
                    event.target.checked
                      ? [...allergies, option.id]
                      : allergies.filter((item) => item !== option.id),
                  )
                }
                type="checkbox"
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
        <h3>Intolerancias o sensibilidades</h3>
        <div className="dietary-options">
          {intoleranceOptions.map((option) => (
            <label className="dietary-option" key={option.id}>
              <input
                checked={intolerances.includes(option.id)}
                onChange={(event) =>
                  onIntolerancesChange(
                    event.target.checked
                      ? [...intolerances, option.id]
                      : intolerances.filter((item) => item !== option.id),
                  )
                }
                type="checkbox"
              />
              <span>{option.label}</span>
            </label>
          ))}
          {customIntolerances.map((option) => (
            <label className="dietary-option" key={option.id}>
              <input
                checked={selectedDietaryOptionIds.includes(option.id)}
                onChange={(event) =>
                  void onToggleDietaryOption(option.id, event.target.checked)
                }
                type="checkbox"
              />
              <span>{option.name}</span>
            </label>
          ))}
        </div>
        {customAllergies.length > 0 && (
          <>
            <h3>Otras alergias</h3>
            <div className="dietary-options">
              {customAllergies.map((option) => (
                <label className="dietary-option" key={option.id}>
                  <input
                    checked={selectedDietaryOptionIds.includes(option.id)}
                    onChange={(event) =>
                      void onToggleDietaryOption(option.id, event.target.checked)
                    }
                    type="checkbox"
                  />
                  <span>{option.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
        {selectedDislikes.length > 0 && (
          <>
            <h3>Ingredientes que no te gustan</h3>
            <div className="dietary-options">
              {selectedDislikes.map((option) => (
                <label className="dietary-option" key={option.id}>
                  <input
                    checked
                    onChange={() => void onToggleDietaryOption(option.id, false)}
                    type="checkbox"
                  />
                  <span>{option.name}</span>
                </label>
              ))}
            </div>
          </>
        )}
        <form className="dietary-suggestion-form" onSubmit={submitDietarySuggestion}>
          <label htmlFor="dietary-suggestion">
            ¿Falta una alergia o intolerancia?
          </label>
          <div className="search-field">
            <input
              id="dietary-suggestion"
              maxLength={100}
              onChange={(event) => setNewDietarySuggestion(event.target.value)}
              placeholder="Escribe una opción para proponerla"
              value={newDietarySuggestion}
            />
            <button
              className="small-button"
              disabled={!profile || !newDietarySuggestion.trim() || isSuggestingDietaryOption}
              type="submit"
            >
              {isSuggestingDietaryOption ? "Enviando..." : "Proponer"}
            </button>
          </div>
          <small>
            {profile
              ? "Al juntar 10 propuestas, Gemini las clasificará y quitará duplicados. Las nuevas opciones se agregarán automáticamente a tus restricciones."
              : "Inicia sesión para proponer opciones. Al juntar 10, Gemini las clasificará y quitará duplicados."}
          </small>
        </form>
        <div className="dietary-warning">
          Revisa siempre las etiquetas y el riesgo de contaminación cruzada.
          Estas sugerencias no garantizan seguridad médica.
        </div>
        <button
          className="primary-button dietary-save"
          onClick={() => void onSavePreferences()}
          type="button"
        >
          Guardar preferencias
        </button>
      </section>
    </section>
  );
}

function LoadingScreen({ onCancel }: { onCancel: () => void }) {
  return (
    <section
      aria-busy="true"
      aria-labelledby="loading-title"
      className="loading-screen"
      role="status"
    >
      <header className="loading-header">
        <button
          aria-label="Cancelar generación"
          className="round-icon-button"
          onClick={onCancel}
          type="button"
        >
          <X size={19} />
        </button>
        <span className="loading-status">
          <span />
          Creando con IA
        </span>
        <span className="loading-header-spacer" />
      </header>
      <div className="loading-orb">
        <Sparkles size={28} aria-hidden="true" />
      </div>
      <h1 id="loading-title">Formulando recetas saludables...</h1>
      <p className="loading-description">
        Analizando los ingredientes seleccionados
      </p>
      <div className="loading-step">••• &nbsp; Paso 2 de 3</div>
      <div className="loading-preparing">
        <strong>Preparando 3 opciones diferentes</strong>
        <span>3 recetas</span>
      </div>
      <div className="skeleton-recipe" aria-hidden="true">
        <span className="skeleton-photo" />
        <span className="skeleton-copy">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="skeleton-recipe second-skeleton" aria-hidden="true">
        <span className="skeleton-photo" />
        <span className="skeleton-copy">
          <i />
          <i />
          <i />
          <i />
        </span>
      </div>
      <p className="loading-footnote">
        <Leaf size={14} />
        Tus preferencias se procesan de forma segura
      </p>
    </section>
  );
}

function RecipeCard({
  recipe,
  saved,
  compact = false,
  onOpen,
  onToggleSaved,
  onAddToCollection,
  onRemoveFromCollection,
}: {
  recipe: RecipeData;
  saved: boolean;
  compact?: boolean;
  onOpen: () => void;
  onToggleSaved: () => void;
  onAddToCollection?: () => void;
  onRemoveFromCollection?: () => void;
}) {
  return (
    <article className={compact ? "recipe-card compact-card" : "recipe-card"}>
      {!compact && (
        <>
          <button
            aria-label={saved ? "Quitar de guardados" : "Guardar receta"}
            aria-pressed={saved}
            className={saved ? "card-bookmark saved" : "card-bookmark"}
            onClick={(event) => {
              event.stopPropagation();
              onToggleSaved();
            }}
            type="button"
          >
            <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
          </button>
          {onAddToCollection && (
            <button
              aria-label="Añadir a colección"
              className="card-collection-button"
              onClick={(event) => {
                event.stopPropagation();
                onAddToCollection();
              }}
              type="button"
            >
              <Plus size={15} />
            </button>
          )}
        </>
      )}
      <button
        aria-label={`Ver ${recipe.title}`}
        className="recipe-card-main"
        onClick={onOpen}
        type="button"
      >
        <span className="recipe-photo" aria-hidden="true">
          {recipe.imageUrl ? (
            <span
              aria-hidden="true"
              className="recipe-photo-image"
              style={{
                backgroundImage: `url("${new URL(recipe.imageUrl).toString()}")`,
              }}
            />
          ) : (
            <span className="plate">
              {recipe.title.toLocaleLowerCase("es").includes("pasta")
                ? "🍝"
                : recipe.title.toLocaleLowerCase("es").includes("tostada")
                  ? "🥑"
                  : "🍳"}
            </span>
          )}
          <span className="photo-match">
            <Sparkles size={11} /> {recipe.matchPercentage}% coincidencia
          </span>
        </span>
        <span className="recipe-card-content">
          <strong className="recipe-title">{recipe.title}</strong>
          <span className="recipe-meta">
            <span>
              <Clock3 size={13} /> {recipe.prepTime}
            </span>
            <span className="calorie-pill">
              <Flame size={13} /> {recipe.calories} kcal
            </span>
          </span>
          <span className="macro-inline">
            <span>Proteína <b>{recipe.macros.protein} g</b></span>
            <span>Carbohidratos <b>{recipe.macros.carbs} g</b></span>
            <span>Grasas <b>{recipe.macros.fats} g</b></span>
          </span>
          <span className="macro-progress">
            <i />
            <i />
            <i />
          </span>
          <span className="used-ingredients-label">Ingredientes utilizados</span>
          <span className="used-ingredients">
            {recipe.usedIngredients.slice(0, 3).map((ingredient) => (
              <span key={ingredient}>{ingredient}</span>
            ))}
          </span>
          <span className="card-open-link">Ver receta <ChevronRight size={15} /></span>
        </span>
      </button>
      {compact && (
        <div className="saved-card-footer">
          <span><Leaf size={14} /> {onRemoveFromCollection ? "En esta colección" : "Guardada en esta sesión"}</span>
          <button
            onClick={(event) => {
              event.stopPropagation();
              if (onRemoveFromCollection) {
                onRemoveFromCollection();
                return;
              }
              onToggleSaved();
            }}
            type="button"
            className={onRemoveFromCollection ? "remove-collection-button" : ""}
            aria-label={onRemoveFromCollection ? "Quitar receta de la colección" : "Quitar receta guardada"}
          >
            <Bookmark size={16} fill="currentColor" />
            {onRemoveFromCollection && <span className="remove-collection-badge"><Minus size={10} /></span>}
          </button>
        </div>
      )}
      {recipe.imagePhotographer && recipe.imageSourceUrl && (
        <a
          className="image-credit"
          href={recipe.imageSourceUrl}
          rel="noreferrer"
          target="_blank"
        >
          Foto: {recipe.imagePhotographer} / Pixabay
        </a>
      )}
    </article>
  );
}

function CollectionCard({
  icon,
  title,
  count,
  onClick,
}: {
  icon: string;
  title: string;
  count: string;
  onClick?: () => void;
}) {
  return (
    <button className="collection-card" onClick={onClick} type="button">
      <span className="collection-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <small>{count}</small>
    </button>
  );
}

function RecipeScreen({
  recipe,
  alternatives,
  selectedAlternative,
  onSelectAlternative,
  saved,
  completedSteps,
  shareMessage,
  onBack,
  onComplete,
  onShare,
  onToggleSaved,
  onAddToCollection,
  onToggleStep,
}: {
  recipe: RecipeData;
  alternatives: RecipeData[];
  selectedAlternative: number;
  onSelectAlternative: (index: number) => void;
  saved: boolean;
  completedSteps: number[];
  shareMessage: string;
  onBack: () => void;
  onComplete: () => void;
  onShare: () => void;
  onToggleSaved: () => void;
  onAddToCollection: () => void;
  onToggleStep: (stepIndex: number) => void;
}) {
  return (
    <section aria-labelledby="recipe-title" className="recipe-screen">
      <header className="recipe-topbar">
        <button
          aria-label="Volver a recetas"
          className="round-icon-button"
          onClick={onBack}
          type="button"
        >
          <ArrowLeft size={19} />
        </button>
        <h1 id="recipe-title">{recipe.title}</h1>
        <button
          aria-label={saved ? "Quitar de guardados" : "Guardar receta"}
          aria-pressed={saved}
          className={saved ? "round-icon-button saved-icon" : "round-icon-button"}
          onClick={onToggleSaved}
          type="button"
        >
          <Bookmark size={18} fill={saved ? "currentColor" : "none"} />
        </button>
        <button
          aria-label="Añadir a colección"
          className="round-icon-button collection-icon-button"
          onClick={onAddToCollection}
          type="button"
        >
          <Plus size={17} />
        </button>
        <button
          aria-label="Compartir receta"
          className="round-icon-button share-icon"
          onClick={onShare}
          type="button"
        >
          <Share2 size={17} />
        </button>
      </header>
      {alternatives.length > 1 && (
        <nav className="recipe-alternatives" aria-label="Otras recetas generadas">
          <span>Elige una receta ({selectedAlternative + 1} de {alternatives.length})</span>
          <div>
            {alternatives.map((alternative, index) => (
              <button
                aria-pressed={selectedAlternative === index}
                className={
                  selectedAlternative === index
                    ? "recipe-alternative active"
                    : "recipe-alternative"
                }
                key={`${alternative.title}-${index}`}
                onClick={() => onSelectAlternative(index)}
                type="button"
              >
                {alternative.title}
              </button>
            ))}
          </div>
        </nav>
      )}
      <RecipeDetailContent
        key={recipe.title}
        recipe={recipe}
        completedSteps={completedSteps}
        onToggleStep={onToggleStep}
      />
      {shareMessage && (
        <p className="share-message" role="status">
          {shareMessage}
        </p>
      )}
      <div className="cook-action">
        <button
          className="primary-button"
          onClick={() => {
            if (completedSteps.length === recipe.steps.length) {
              onComplete();
              return;
            }
            const nextStep = recipe.steps.findIndex(
              (_, index) => !completedSteps.includes(index),
            );
            if (nextStep >= 0) onToggleStep(nextStep);
          }}
          type="button"
        >
          <ChefHat size={18} />
          {completedSteps.length === recipe.steps.length
            ? "Volver a la despensa"
            : completedSteps.length === 0
              ? "Iniciar modo cocina"
              : "Siguiente paso"}
        </button>
        <small>✦ Mantén la pantalla activa mientras cocinas</small>
      </div>
    </section>
  );
}

function RecipeDetailContent({
  recipe,
  completedSteps,
  onToggleStep,
}: {
  recipe: RecipeData;
  completedSteps: number[];
  onToggleStep: (stepIndex: number) => void;
}) {
  const [uncheckedIngredients, setUncheckedIngredients] = useState<string[]>([]);
  const totalMacros =
    recipe.macros.protein + recipe.macros.carbs + recipe.macros.fats;
  const macros = [
    { name: "Proteína", value: recipe.macros.protein, color: "protein" },
    { name: "Carbohidratos", value: recipe.macros.carbs, color: "carbs" },
    { name: "Grasas", value: recipe.macros.fats, color: "fats" },
  ];
  const hasOliveOil = recipe.usedIngredients.some(
    (ingredient) => normalizeRecipeIngredientKey(ingredient) === "aceite de oliva",
  );
  const hasSalt = recipe.usedIngredients.some(
    (ingredient) => normalizeRecipeIngredientKey(ingredient) === "sal",
  );
  const checklistIngredients = dedupeRecipeStrings([
    ...recipe.usedIngredients,
    ...(hasOliveOil ? [] : ["Aceite de oliva"]),
    ...(hasSalt ? [] : ["Sal"]),
  ]);

  return (
    <>
      <div className="detail-nutrition-card">
        <div className="detail-calorie-tile">
          <Flame size={17} aria-hidden="true" />
          <strong>{recipe.calories}</strong>
          <small>kcal</small>
        </div>
        {macros.map((macro) => (
          <div className={`detail-macro ${macro.color}`} key={macro.name}>
            <span className="detail-macro-name">{macro.name}</span>
            <strong className="detail-macro-value">{macro.value} g</strong>
            <span className="detail-macro-track">
              <i style={{ width: `${(macro.value / totalMacros) * 100}%` }} />
            </span>
          </div>
        ))}
      </div>
      <section className="detail-section ingredients-checklist">
        <div className="detail-section-heading">
          <h2>Ingredientes</h2>
          <span>{recipe.usedIngredients.length} en la receta</span>
        </div>
        <div className="checklist-grid">
          {checklistIngredients.map((ingredient) => {
            const isRecipeIngredient = recipe.usedIngredients.some(
              (item) => dedupeRecipeStrings([item, ingredient]).length === 1,
            );
            const checked = isRecipeIngredient
              ? !uncheckedIngredients.includes(ingredient)
              : uncheckedIngredients.includes(ingredient);

            return (
              <button
                aria-pressed={checked}
                className={
                  checked
                    ? "checklist-item checked"
                    : "checklist-item unchecked"
                }
                key={ingredient}
                onClick={() =>
                  setUncheckedIngredients((current) =>
                    current.includes(ingredient)
                      ? current.filter((item) => item !== ingredient)
                      : [...current, ingredient],
                  )
                }
                type="button"
              >
                {checked ? <Check size={15} /> : <span className="empty-check" />}
                {ingredient.replace(/^\d+\s*/, "")}
              </button>
            );
          })}
        </div>
      </section>
      <section className="detail-section preparation-section" id="preparation">
        <div className="detail-section-heading">
          <h2>Preparación</h2>
          <span>{recipe.steps.length} pasos</span>
        </div>
        <ol className="preparation-list">
          {recipe.steps.map((step, index) => {
            const done = completedSteps.includes(index);
            return (
              <li className={done ? "preparation-step done" : "preparation-step"} key={step}>
                <button
                  aria-label={
                    done
                      ? `Marcar paso ${index + 1} como pendiente`
                      : `Marcar paso ${index + 1} como completado`
                  }
                  aria-pressed={done}
                  onClick={() => onToggleStep(index)}
                  type="button"
                >
                  {done ? <Check size={16} /> : index + 1}
                </button>
                <span>
                  <strong>{step}</strong>
                  <small>{stepDescription(index)}</small>
                </span>
              </li>
            );
          })}
        </ol>
      </section>
      <p className="demo-disclaimer">
        Receta de demostración · valores nutricionales estimados por porción
      </p>
    </>
  );
}

function stepDescription(index: number) {
  const descriptions = [
    "Sazona hasta lograr una mezcla uniforme.",
    "Cocina a fuego medio durante 3 minutos.",
    "Añade el relleno, dobla y sirve caliente.",
  ];
  return descriptions[index] ?? "Continúa hasta que esté listo y sirve.";
}
