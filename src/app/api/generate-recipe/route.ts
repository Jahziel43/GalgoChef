import { NextResponse } from "next/server";
import type { RecipeData } from "@/lib/recipe";

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
    body.ingredients.length === 0
  ) {
    return NextResponse.json(
      { error: "Selecciona al menos un ingrediente para continuar." },
      { status: 400 },
    );
  }

  const usedIngredients: string[] = [];
  for (const ingredient of body.ingredients) {
    if (typeof ingredient !== "string" || !ingredient.trim()) {
      return NextResponse.json(
        { error: "Cada ingrediente debe ser texto y no puede estar vacío." },
        { status: 400 },
      );
    }
    usedIngredients.push(ingredient.trim());
  }

  const uniqueIngredients = [...new Set(usedIngredients)].slice(0, 12);
  const normalizedIngredients = uniqueIngredients.map((ingredient) =>
    ingredient.toLocaleLowerCase("es"),
  );
  const hasEgg = normalizedIngredients.some(
    (ingredient) => ingredient === "huevo" || ingredient === "huevos",
  );
  const hasSpinachAndTomato =
    normalizedIngredients.includes("espinaca") &&
    normalizedIngredients.includes("tomate");
  const recipe: RecipeData = {
    title: hasEgg
      ? hasSpinachAndTomato
        ? "Omelette de espinaca y tomate"
        : "Omelette rápida de la huerta"
      : "Salteado rápido de tu despensa",
    prepTime: "15 min",
    calories: 280,
    macros: {
      protein: 18,
      carbs: 6,
      fats: 20,
    },
    matchPercentage: 96,
    usedIngredients: uniqueIngredients,
    steps: hasEgg
      ? [
          "Lava y corta los ingredientes seleccionados en trozos pequeños.",
          "Calienta una sartén con un chorrito de aceite y cocina primero los ingredientes más firmes.",
          "Añade el huevo batido, cocina hasta que cuaje y sirve caliente.",
        ]
      : [
          "Lava y corta los ingredientes seleccionados en trozos pequeños.",
          "Precalienta una sartén con un chorrito de aceite y cocina los ingredientes hasta que estén listos.",
          "Sazona al gusto y sirve caliente.",
        ],
  };

  return NextResponse.json(recipe);
}
