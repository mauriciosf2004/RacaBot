import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

// --- Config ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- Sesión por chat ---
const session = new Map(); // chatId -> { cliente: "Rebel"|"Oana"|"CPremier" }
export function getCliente(chatId) {
  return session.get(chatId)?.cliente || null;
}
export function setCliente(chatId, cliente) {
  session.set(chatId, { cliente });
}

// --- Carga de data por cliente ---
const textData = {}; // { Rebel: "...", Oana: "...", CPremier: "..." }

async function loadTextData() {
  const basePath = path.join(process.cwd(), "data");
  const clientes = {
    Rebel: "rebel.txt",
    Oana: "oana.txt",
    CPremier: "cpremier.txt",
  };

  for (const [cliente, file] of Object.entries(clientes)) {
    try {
      const fullPath = path.join(basePath, file);
      const content = await fs.readFile(fullPath, "utf-8");
      textData[cliente] = content;
    } catch (err) {
      console.error(`Error cargando texto para ${cliente}:`, err);
      textData[cliente] = "";
    }
  }
}
await loadTextData();

// --- Prompt ---
function systemPromptFor(cliente) {
  const base = `Eres un estratega creativo senior de Racamandaka.
Conoces profundamente a la marca ${cliente}.
Tu rol es proponer, inspirar y ayudar a generar contenido útil y accionable.
Analiza tono, valores, buyer persona y necesidades. Usa SOLO el contexto.
Si falta información, responde: "No tengo esa info en la base".
Entrega respuestas claras, estructuradas, con ideas prácticas y listas para publicar.`;

  const guides = {
    Rebel: `Marca: Rebel Home.
Tono: cercano, claro, humano; mediterráneo, auténtico; transparencia y empatía.
Objetivo: guiar decisiones de compra/venta (Costa del Sol), confianza y tranquilidad para público extranjero 35–60.
Prefiere: tips de inversión/compra, testimonios, lifestyle costero; evita clichés vacíos.
Estilo: ideas de posts, guiones de reels, carruseles con bullets y CTAs suaves.`,

    Oana: `Marca: Oana Personal.
Tono: cálido e inspirador; "alquimista emocional".
Objetivo: contenido que conecte humano a humano, procesos de transformación, vida consciente.
Prefiere: storytelling, ganchos emocionales; evita cliché motivacional vacío.
Estilo: hooks potentes, captions breves con intención, mini-carruseles y CTA empático.`,

    CPremier: `Marca: CP Premier.
Tono: profesional, claro y confiable; foco en talento, procesos y excelencia.
Objetivo: comunicar propuestas de valor y procesos; información precisa y accionable.
Estilo: bullets claros, ejemplos concretos, pasos accionables.`,
  };

  return base + "\n\n" + (guides[cliente] || "");
}

// --- Manejo de preguntas ---
export async function handleUserQuestion({ chatId, cliente, pregunta }) {
  const contexto = textData[cliente];
  if (!contexto || contexto.length < 50) {
    return { text: "No tengo esa info en la base" };
  }

  const system = systemPromptFor(cliente);

  const chat = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    max_tokens: 700,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Contexto:\n${contexto}\n\nPregunta:\n${pregunta}` }
    ]
  });

  const answer = chat.choices?.[0]?.message?.content?.trim() || "No tengo esa info en la base";
  return { text: answer };
}
