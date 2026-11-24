// Alimentos comunes por 100 g: [nombre, kcal, proteína, carbohidratos, grasa]
// Valores aproximados (BEDCA/USDA). Cocinados donde se indica.
export const FOODS = [
  ["Pechuga de pollo (plancha)", 165, 31, 0, 3.6],
  ["Muslo de pollo (sin piel, asado)", 209, 26, 0, 10.9],
  ["Pavo (pechuga)", 135, 29, 0, 1.5],
  ["Ternera magra (plancha)", 217, 26, 0, 12],
  ["Carne picada mixta (cocinada)", 260, 25, 0, 17],
  ["Lomo de cerdo (plancha)", 196, 29, 0, 8.5],
  ["Jamón serrano", 241, 31, 0, 13],
  ["Jamón cocido / york", 110, 18, 1.5, 3.5],
  ["Salmón", 208, 20, 0, 13],
  ["Atún al natural (lata, escurrido)", 116, 26, 0, 1],
  ["Atún en aceite (lata, escurrido)", 198, 29, 0, 8],
  ["Merluza", 90, 18, 0, 1.8],
  ["Gambas / langostinos (cocidos)", 99, 24, 0.2, 0.3],
  ["Huevo entero (1 ≈ 55 g)", 143, 12.6, 0.7, 9.5],
  ["Clara de huevo", 52, 11, 0.7, 0.2],
  ["Arroz blanco (cocido)", 130, 2.7, 28, 0.3],
  ["Arroz blanco (crudo)", 360, 7, 79, 0.6],
  ["Pasta (cocida)", 158, 5.8, 31, 0.9],
  ["Pasta (cruda)", 371, 13, 75, 1.5],
  ["Patata cocida", 87, 1.9, 20, 0.1],
  ["Patatas fritas (caseras)", 312, 3.4, 41, 15],
  ["Boniato asado", 90, 2, 21, 0.2],
  ["Pan blanco / barra", 265, 9, 49, 3.2],
  ["Pan integral", 247, 13, 41, 3.4],
  ["Avena (copos)", 389, 17, 66, 7],
  ["Lentejas (cocidas)", 116, 9, 20, 0.4],
  ["Garbanzos (cocidos)", 164, 8.9, 27, 2.6],
  ["Alubias (cocidas)", 127, 8.7, 23, 0.5],
  ["Leche entera", 64, 3.2, 4.7, 3.6],
  ["Leche semidesnatada", 46, 3.3, 4.8, 1.6],
  ["Yogur natural", 61, 3.5, 4.7, 3.3],
  ["Yogur griego", 115, 6, 4, 9],
  ["Skyr / yogur proteico", 63, 11, 4, 0.2],
  ["Queso fresco / burgos", 174, 12, 3, 13],
  ["Queso curado", 400, 26, 0.5, 33],
  ["Queso batido 0%", 46, 8, 3.8, 0.1],
  ["Proteína whey (polvo)", 390, 78, 7, 6],
  ["Aceite de oliva", 884, 0, 0, 100],
  ["Mantequilla", 717, 0.9, 0.1, 81],
  ["Aguacate", 160, 2, 8.5, 14.7],
  ["Frutos secos (nueces/almendras)", 620, 18, 12, 54],
  ["Crema de cacahuete", 588, 25, 20, 50],
  ["Plátano", 89, 1.1, 23, 0.3],
  ["Manzana", 52, 0.3, 14, 0.2],
  ["Naranja", 47, 0.9, 12, 0.1],
  ["Fresas", 32, 0.7, 7.7, 0.3],
  ["Ensalada verde (lechuga, tomate)", 18, 1, 3.5, 0.2],
  ["Brócoli", 34, 2.8, 7, 0.4],
  ["Verduras salteadas (sin aceite)", 40, 2, 7, 0.3],
  ["Tomate frito", 80, 1.5, 9, 4],
  ["Chocolate negro 70%", 580, 7.8, 36, 42],
  ["Pizza (media)", 266, 11, 33, 10],
  ["Hamburguesa con pan (media)", 254, 13, 24, 12],
  ["Tortilla de patatas", 180, 6.5, 13, 11.5],
  ["Cerveza", 43, 0.5, 3.6, 0],
  ["Refresco azucarado", 42, 0, 10.6, 0],
];

export function searchFoods(q) {
  const norm = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const words = norm(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return FOODS.filter((f) => words.every((w) => norm(f[0]).includes(w))).slice(0, 8);
}

export function foodMacros(food, grams) {
  const k = grams / 100;
  const r = (x) => Math.round(x * k * 10) / 10;
  return { nombre: food[0], gramos: grams, kcal: Math.round(food[1] * k), proteina: r(food[2]), carbohidratos: r(food[3]), grasa: r(food[4]) };
}
