export const allergyOptions = [
  { id: "peanuts", label: "Cacahuates / maní" },
  { id: "tree_nuts", label: "Frutos secos" },
  { id: "milk", label: "Leche y lácteos" },
  { id: "egg", label: "Huevo" },
  { id: "wheat", label: "Trigo" },
  { id: "gluten", label: "Gluten" },
  { id: "soy", label: "Soya" },
  { id: "fish", label: "Pescado" },
  { id: "shellfish", label: "Mariscos" },
  { id: "sesame", label: "Sésamo / ajonjolí" },
] as const;

export const intoleranceOptions = [
  { id: "lactose", label: "Intolerancia a la lactosa" },
  { id: "gluten", label: "Sensibilidad al gluten" },
  { id: "fructose", label: "Intolerancia a la fructosa" },
] as const;

export type AllergyId = (typeof allergyOptions)[number]["id"];
export type IntoleranceId = (typeof intoleranceOptions)[number]["id"];

const dietaryTerms: Record<AllergyId | IntoleranceId, string[]> = {
  peanuts: ["cacahuate", "cacahuetes", "mani", "maní", "peanut"],
  tree_nuts: [
    "nuez",
    "nueces",
    "almendra",
    "avellana",
    "pistacho",
    "anacardo",
    "nuez de la india",
    "nuez pecana",
    "nuez de brasil",
    "macadamia",
    "walnut",
    "cashew",
    "pecan",
  ],
  milk: [
    "leche",
    "queso",
    "yogur",
    "mantequilla",
    "crema",
    "lacteo",
    "lacteos",
    "caseina",
    "suero de leche",
    "lactosa",
    "caseinato",
    "lactosuero",
    "dairy",
    "whey",
  ],
  egg: ["huevo", "huevos", "clara", "yema", "mayonesa", "merengue", "egg"],
  wheat: [
    "trigo",
    "harina de trigo",
    "semola",
    "pan",
    "pasta",
    "wheat",
  ],
  gluten: [
    "gluten",
    "trigo",
    "cebada",
    "centeno",
    "harina",
    "seitan",
    "cuscus",
    "malta",
  ],
  soy: ["soya", "soja", "tofu", "edamame", "soy"],
  fish: [
    "pescado",
    "atun",
    "salmon",
    "sardina",
    "anchoa",
    "bacalao",
    "merluza",
    "fish",
  ],
  shellfish: [
    "marisco",
    "camarone",
    "gamba",
    "cangrejo",
    "langostino",
    "langosta",
    "mejillon",
    "almeja",
    "ostion",
    "ostra",
    "vieira",
    "shrimp",
    "shellfish",
  ],
  sesame: ["sesamo", "ajonjoli", "tahini", "aceite de sesamo"],
  lactose: [
    "leche",
    "queso",
    "yogur",
    "mantequilla",
    "crema",
    "lacteo",
    "lacteos",
    "caseina",
    "suero de leche",
    "dairy",
  ],
  fructose: [
    "fructosa",
    "miel",
    "jarabe de maiz",
    "manzana",
    "pera",
    "mango",
    "agave",
  ],
};

const optionLabels = new Map<string, string>(
  [...allergyOptions, ...intoleranceOptions].map(({ id, label }) => [
    id,
    label,
  ]),
);
optionLabels.set("gluten", "Gluten");

export function isAllergyId(value: unknown): value is AllergyId {
  return (
    typeof value === "string" &&
    allergyOptions.some((option) => option.id === value)
  );
}

export function isIntoleranceId(value: unknown): value is IntoleranceId {
  return (
    typeof value === "string" &&
    intoleranceOptions.some((option) => option.id === value)
  );
}

export function normalizeDietaryText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
}

export function findDietaryConflicts(
  text: string,
  allergies: readonly string[],
  intolerances: readonly string[],
) {
  const normalizedText = normalizeDietaryText(text);
  const activeIds = [...new Set([...allergies, ...intolerances])].filter(
    (value) => value in dietaryTerms,
  ) as (AllergyId | IntoleranceId)[];

  return activeIds.filter((id) =>
    dietaryTerms[id].some((term) => {
      const normalizedTerm = normalizeDietaryText(term)
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        .replace(/\s+/g, "\\s+");
      return new RegExp(
        `(?:^|[^\\p{L}\\p{N}])${normalizedTerm}(?:$|[^\\p{L}\\p{N}])`,
        "u",
      ).test(normalizedText);
    }),
  );
}

export function dietaryLabels(ids: readonly string[]) {
  return ids.map((id) => optionLabels.get(id) ?? id);
}
