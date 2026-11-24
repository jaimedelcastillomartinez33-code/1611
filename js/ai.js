// Llamadas a Claude. La clave de API se guarda solo en este dispositivo.
import Anthropic from "../vendor/anthropic.js";

const MODEL = "claude-opus-5-5";

function getClient() {
  const apiKey = localStorage.getItem("fit.apiKey");
  if (!apiKey) throw new Error("Falta la clave de API. Ponla en Ajustes.");
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
}

async function askJSON({ system, prompt, schema, effort = "low" }) {
  const client = getClient();
  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: prompt }],
      output_config: { effort, format: { type: "json_schema", schema } },
    });
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError) throw new Error("La clave de API no es válida.");
    if (error instanceof Anthropic.RateLimitError) throw new Error("Demasiadas peticiones. Espera un momento.");
    if (error instanceof Anthropic.APIConnectionError) throw new Error("Sin conexión con la IA.");
    if (error instanceof Anthropic.APIError) throw new Error(`Error de la IA (${error.status}): ${error.message}`);
    throw error;
  }
  if (response.stop_reason === "refusal") throw new Error("La IA no ha querido responder a eso.");
  if (response.stop_reason === "max_tokens") throw new Error("Respuesta cortada. Prueba con un texto más corto.");
  const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return JSON.parse(text);
}

const num = { type: "number" };
const macroProps = { kcal: num, proteina: num, carbohidratos: num, grasa: num };
const macroReq = ["kcal", "proteina", "carbohidratos", "grasa"];

const MEAL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items", "nota"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["nombre", "gramos", ...macroReq],
        properties: { nombre: { type: "string" }, gramos: num, ...macroProps },
      },
    },
    nota: { type: "string" },
  },
};

export function estimateMeal(description) {
  return askJSON({
    system:
      "Eres un nutricionista que estima calorías y macronutrientes de comidas españolas y en general. " +
      "Divide la comida en alimentos. Si el usuario da gramos, úsalos tal cual; si no, asume una ración normal para un adulto y dilo. " +
      "Usa valores de tablas de composición (BEDCA/USDA) para el alimento cocinado como se describe, incluyendo el aceite de cocinado si es habitual. " +
      "Proteína, carbohidratos y grasa en gramos; kcal coherentes (4/4/9). Redondea a enteros. " +
      "En 'nota' explica en una frase corta las suposiciones de cantidades que hayas hecho, en español.",
    prompt: `Comida: ${description}`,
    schema: MEAL_SCHEMA,
  });
}

const COACH_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["veredicto", "respuesta", "estimacion", "alternativa"],
  properties: {
    veredicto: { type: "string", enum: ["si", "ajusta", "no"] },
    respuesta: { type: "string" },
    estimacion: { type: "object", additionalProperties: false, required: macroReq, properties: macroProps },
    alternativa: { type: "string" },
  },
};

export function coachMeal({ question, context }) {
  return askJSON({
    system:
      "Eres un nutricionista deportivo directo y honesto. El usuario te pregunta si una comida le encaja con lo que lleva hoy. " +
      "Decide con los números: objetivos diarios, lo ya comido, lo que le falta y el entrenamiento del día. " +
      "Prioriza llegar a la proteína y no pasarse de calorías según su objetivo. " +
      "veredicto: 'si' si encaja bien, 'ajusta' si encaja cambiando cantidades o algo concreto, 'no' si es mala idea hoy. " +
      "No seas complaciente: si es mala elección, dilo claro. " +
      "En 'respuesta' explica el porqué en 2-3 frases citando números. En 'estimacion' pon los macros de lo que propone comer. " +
      "En 'alternativa' propone algo concreto con cantidades que le cuadre mejor (o cómo ajustar), o cadena vacía si es perfecto. Responde en español.",
    prompt: `${context}\n\nPregunta del usuario: ${question}`,
    schema: COACH_SCHEMA,
    effort: "medium",
  });
}

const SCORE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nota", "resumen", "bien", "mejorar"],
  properties: {
    nota: { type: "number" },
    resumen: { type: "string" },
    bien: { type: "array", items: { type: "string" } },
    mejorar: { type: "array", items: { type: "string" } },
  },
};

export function scoreWorkout({ workout, context }) {
  return askJSON({
    system:
      "Eres un entrenador personal exigente y honesto. Pon una nota del 0 al 10 (puede tener un decimal) al entrenamiento del usuario. " +
      "Valora: volumen efectivo (series cerca del fallo por grupo muscular), intensidad (pesos y repeticiones), selección y orden de ejercicios, " +
      "coherencia con su objetivo, progresión respecto a sesiones anteriores si las hay, duración y descansos. " +
      "Calibración: 5 = sesión correcta pero mejorable, 7 = buena, 9-10 = excelente y rara. No infles la nota. " +
      "Si faltan datos (pesos, repeticiones), dilo y puntúa con lo que hay. " +
      "'resumen': 1-2 frases. 'bien' y 'mejorar': 1-3 puntos cortos y concretos cada uno. Responde en español.",
    prompt: `${context}\n\nEntrenamiento a puntuar:\n${workout}`,
    schema: SCORE_SCHEMA,
    effort: "medium",
  });
}
