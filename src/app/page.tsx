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
  Plus,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { isRecipeData, type RecipeData } from "@/lib/recipe";

type Tab = "pantry" | "explore" | "saved";
type PantryCategory = "Verduras" | "Proteínas" | "Lácteos" | "Otros";
type PantryIngredient = {
  name: string;
  category: PantryCategory;
};

const pantryIngredients: PantryIngredient[] = [
  { name: "Huevos", category: "Proteínas" },
  { name: "Espinaca", category: "Verduras" },
  { name: "Tomate", category: "Verduras" },
  { name: "Aguacate", category: "Verduras" },
  { name: "Yogur", category: "Lácteos" },
  { name: "Pollo", category: "Proteínas" },
  { name: "Cebolla", category: "Verduras" },
  { name: "Aceite de oliva", category: "Otros" },
];

const filters = ["Todos", "Verduras", "Proteínas", "Lácteos", "Otros"] as const;
type PantryFilter = (typeof filters)[number];

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
  const [tab, setTab] = useState<Tab>("pantry");
  const [filter, setFilter] = useState<PantryFilter>("Todos");
  const [search, setSearch] = useState("");
  const [showMoreRecipes, setShowMoreRecipes] = useState(false);
  const [selectedIngredients, setSelectedIngredients] = useState<string[]>([]);
  const [view, setView] = useState<"pantry" | "loading" | "recipe">("pantry");
  const [recipe, setRecipe] = useState<RecipeData | null>(null);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const generationId = useRef(0);

  function toggleIngredient(ingredient: string) {
    setSelectedIngredients((current) =>
      current.includes(ingredient)
        ? current.filter((item) => item !== ingredient)
        : [...current, ingredient],
    );
  }

  function addCustomIngredient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ingredient = search.trim();
    if (!ingredient) return;

    if (!selectedIngredients.includes(ingredient)) {
      setSelectedIngredients((current) => [...current, ingredient]);
    }
    setSearch("");
  }

  async function generateRecipe(ingredients = selectedIngredients) {
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
        body: JSON.stringify({ ingredients }),
      });
      const data: unknown = await response.json();

      if (!response.ok) {
        const message =
          typeof data === "object" &&
          data !== null &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "No pudimos preparar una receta. Inténtalo de nuevo.";
        throw new Error(message);
      }

      if (!isRecipeData(data)) {
        throw new Error("Recibimos una receta en un formato inesperado.");
      }

      await new Promise((resolve) => window.setTimeout(resolve, 2500));
      if (generationId.current !== requestId) return;
      setRecipe(data);
      setCompletedSteps([]);
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
    setRecipe(recipeToShow);
    setCompletedSteps([]);
    setView("recipe");
  }

  function toggleSaved(title: string) {
    setSavedRecipes((current) =>
      current.includes(title)
        ? current.filter((item) => item !== title)
        : [...current, title],
    );
  }

  function goToTab(nextTab: Tab) {
    setView("pantry");
    setTab(nextTab);
  }

  const recipeSaved = recipe ? savedRecipes.includes(recipe.title) : false;
  const filteredIngredients = pantryIngredients.filter((ingredient) => {
    const categoryMatches =
      filter === "Todos" || ingredient.category === filter;
    const searchMatches = ingredient.name
      .toLocaleLowerCase("es")
      .includes(search.trim().toLocaleLowerCase("es"));
    return categoryMatches && searchMatches;
  });
  const allRecipes = recipe
    ? [recipe, ...sampleRecipes.filter((item) => item.title !== recipe.title)]
    : sampleRecipes;
  const displayedRecipes =
    tab === "saved"
      ? allRecipes.filter((item) => savedRecipes.includes(item.title))
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

            {view === "recipe" && recipe ? (
              <RecipeScreen
                recipe={recipe}
                saved={recipeSaved}
                completedSteps={completedSteps}
                shareMessage={shareMessage}
                onBack={() => goToTab(tab)}
                onShare={() =>
                  setShareMessage("Puedes compartir esta receta desde tu dispositivo.")
                }
                onToggleSaved={() => toggleSaved(recipe.title)}
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

                <div className="filter-chips" aria-label="Filtrar ingredientes">
                  {filters.map((item) => (
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
                <div className="pantry-grid">
                  {filteredIngredients.map(({ name, category }) => {
                    const selected = selectedIngredients.includes(name);
                    return (
                      <button
                        aria-pressed={selected}
                        className={
                          selected
                            ? "pantry-item selected"
                            : "pantry-item"
                        }
                        key={name}
                        onClick={() => toggleIngredient(name)}
                        type="button"
                      >
                        <span className="ingredient-icon" aria-hidden="true">
                          {ingredientEmoji(name)}
                        </span>
                        <span>{name}</span>
                        {selected ? (
                          <Check className="item-trailing" size={15} />
                        ) : (
                          <span className="item-category">{category}</span>
                        )}
                      </button>
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
                      <button
                        aria-pressed="true"
                        className="pantry-item selected"
                        key={ingredient}
                        onClick={() => toggleIngredient(ingredient)}
                        type="button"
                      >
                        <span className="ingredient-icon">✨</span>
                        <span>{ingredient}</span>
                        <X className="item-trailing" size={15} />
                      </button>
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
                    <p>{selectedIngredients.length || 3} ingredientes seleccionados</p>
                  </div>
                  <span className="time-filter">
                    <SlidersHorizontal size={14} />
                    Menos de 20 min
                  </span>
                </div>
                <div className="recipe-list">
                  {displayedRecipes.map((suggestion) => (
                    <RecipeCard
                      key={suggestion.title}
                      recipe={suggestion}
                      saved={savedRecipes.includes(suggestion.title)}
                      onOpen={() => showRecipe(suggestion)}
                      onToggleSaved={() => toggleSaved(suggestion.title)}
                    />
                  ))}
                  {displayedRecipes.length === 0 && (
                    <div className="empty-card">
                      <Bookmark size={24} />
                      <h2>Aún no guardas recetas</h2>
                      <p>Guarda una receta y aparecerá aquí.</p>
                      <button onClick={() => goToTab("explore")} type="button">
                        Explorar recetas
                      </button>
                    </div>
                  )}
                </div>
                {!showMoreRecipes && allRecipes.length > 1 && (
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
                      {allRecipes.length - 1} recetas más para ti
                    </strong>
                    <small>Con tus ingredientes</small>
                  </span>
                  <ChevronRight size={18} />
                  </button>
                )}
              </section>
            ) : (
              <section aria-labelledby="saved-title" className="saved-screen">
                <div className="screen-heading">
                  <div>
                    <h1 id="saved-title">Mis recetas</h1>
                    <p>Guardadas durante esta sesión</p>
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
                    <small>Tu lista está disponible mientras usas la app</small>
                  </span>
                  <Leaf size={16} />
                </div>

                <div className="section-subheading">
                  <h2>Colecciones</h2>
                  <span>3 colecciones</span>
                </div>
                <div className="collection-grid">
                  <CollectionCard icon="🥗" title="Cenas ligeras" count="4 recetas" />
                  <CollectionCard icon="💪" title="Altas en proteína" count="6 recetas" />
                  <CollectionCard icon="☀️" title="Desayunos rápidos" count="3 recetas" />
                  <div className="collection-card new-collection">
                    <Plus size={19} />
                    <strong>Nueva colección</strong>
                  </div>
                </div>

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
                      onToggleSaved={() => toggleSaved(savedRecipe.title)}
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
            )}
          </div>

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
            </nav>
          )}
        </>
      )}
    </main>
  );
}

function ingredientEmoji(ingredient: string) {
  const emojis: Record<string, string> = {
    Huevos: "🥚",
    Espinaca: "🥬",
    Tomate: "🍅",
    Aguacate: "🥑",
    Yogur: "🥛",
    Pollo: "🍗",
    Cebolla: "🧅",
    "Aceite de oliva": "🫒",
  };
  return emojis[ingredient] ?? "🥕";
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
        <strong>Preparando tus mejores opciones</strong>
        <span>2 recetas</span>
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
}: {
  recipe: RecipeData;
  saved: boolean;
  compact?: boolean;
  onOpen: () => void;
  onToggleSaved: () => void;
}) {
  return (
    <article className={compact ? "recipe-card compact-card" : "recipe-card"}>
      {!compact && (
        <button
          aria-label={saved ? "Quitar de guardados" : "Guardar receta"}
          aria-pressed={saved}
          className={saved ? "card-bookmark saved" : "card-bookmark"}
          onClick={onToggleSaved}
          type="button"
        >
          <Bookmark size={17} fill={saved ? "currentColor" : "none"} />
        </button>
      )}
      <button
        aria-label={`Ver ${recipe.title}`}
        className="recipe-card-main"
        onClick={onOpen}
        type="button"
      >
        <span className="recipe-photo" aria-hidden="true">
          <span className="plate">
            {recipe.title.toLocaleLowerCase("es").includes("pasta")
              ? "🍝"
              : recipe.title.toLocaleLowerCase("es").includes("tostada")
                ? "🥑"
                : "🍳"}
          </span>
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
          <span><Leaf size={14} /> Guardada en esta sesión</span>
          <button onClick={onToggleSaved} type="button" aria-label="Quitar receta guardada">
            <Bookmark size={16} fill="currentColor" />
          </button>
        </div>
      )}
    </article>
  );
}

function CollectionCard({
  icon,
  title,
  count,
}: {
  icon: string;
  title: string;
  count: string;
}) {
  return (
    <div className="collection-card">
      <span className="collection-icon" aria-hidden="true">{icon}</span>
      <strong>{title}</strong>
      <small>{count}</small>
    </div>
  );
}

function RecipeScreen({
  recipe,
  saved,
  completedSteps,
  shareMessage,
  onBack,
  onShare,
  onToggleSaved,
  onToggleStep,
}: {
  recipe: RecipeData;
  saved: boolean;
  completedSteps: number[];
  shareMessage: string;
  onBack: () => void;
  onShare: () => void;
  onToggleSaved: () => void;
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
          aria-label="Compartir receta"
          className="round-icon-button share-icon"
          onClick={onShare}
          type="button"
        >
          <Share2 size={17} />
        </button>
      </header>
      <RecipeDetailContent
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
            const nextStep = recipe.steps.findIndex(
              (_, index) => !completedSteps.includes(index),
            );
            if (nextStep >= 0) onToggleStep(nextStep);
          }}
          type="button"
        >
          <ChefHat size={18} />
          {completedSteps.length === recipe.steps.length
            ? "¡Receta completada!"
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
          {[...recipe.usedIngredients, "Aceite de oliva", "Sal"].map(
            (ingredient, index) => {
              const checked =
                index < recipe.usedIngredients.length
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
                  key={`${ingredient}-${index}`}
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
            },
          )}
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
