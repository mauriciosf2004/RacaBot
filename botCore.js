import OpenAI from "openai";

// --- Config ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_HOST = (process.env.PINECONE_HOST || "").replace(/\/+$/, "");
const PINECONE_HOST_CPREMIER = (process.env.PINECONE_HOST_CPREMIER || "").replace(/\/+$/, "");

// almacenamiento simple por chat (MVP). Para persistencia real usa Vercel KV/Supabase.
const session = new Map(); // chatId -> { cliente: "Rebel"|"Oana"|"CPremier" }

export function getCliente(chatId) {
  return session.get(chatId)?.cliente || null;
}
export function setCliente(chatId, cliente) {
  session.set(chatId, { cliente });
}

// --- RAG helpers ---
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

async function embed(text) {
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text
  });
  return res.data[0].embedding;
}

function pineconeHostFor(cliente) {
  if (cliente === "CPremier") return PINECONE_HOST_CPREMIER;
  return PINECONE_HOST;
}
function pineconeNamespaceFor(cliente) {
  if (cliente === "Rebel") return "rebel";
  if (cliente === "Oana") return "oana_personal";
  // CPremier usa index separado y namespace default (no enviar namespace):
  return null;
}

async function pineconeQuery({ cliente, vector }) {
  const host = pineconeHostFor(cliente);
  if (!host) {
    throw new Error(`Pinecone host faltante para ${cliente}`);
  }
  const namespace = pineconeNamespaceFor(cliente);

  const body = {
    vector,
    topK: 6,
    includeMetadata: true
  };
  if (namespace) body.namespace = namespace;

  const r = await fetch(`${host}/query`, {
    method: "POST",
    headers: {
      "Api-Key": PINECONE_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Pinecone ${r.status}: ${t.slice(0, 300)}`);
  }
  const data = await r.json();
  const docs = (data.matches || [])
    .map(m => m?.metadata?.text || "")
    .filter(Boolean)
    .slice(0, 6)
    .map(t => (t.length > 1200 ? t.slice(0, 1200) + "…" : t));

  return { docs, matchesCount: (data.matches || []).length, host, namespace: namespace ?? "__no_namespace__" };
}

function systemPromptFor(cliente) {
  const base = `Eres un estratega creativo senior de Racamandaka.
Conoces profundamente a la marca ${cliente}.
Tu rol es proponer, inspirar y ayudar a generar contenido útil y accionable.
Analiza tono, valores, buyer persona y necesidades. Usa SOLO el contexto recuperado.
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
Estilo: bullets claros, ejemplos concretos, pasos accionables.`
  };

  return base + "\n\n" + (guides[cliente] || "");
}

export async function handleUserQuestion({ chatId, cliente, pregunta }) {
  if (!OPENAI_API_KEY || !PINECONE_API_KEY || !PINECONE_HOST) {
    throw new Error("Faltan env vars: OPENAI_API_KEY / PINECONE_API_KEY / PINECONE_HOST");
  }
  if (cliente === "CPremier" && !PINECONE_HOST_CPREMIER) {
    throw new Error("Falta env var PINECONE_HOST_CPREMIER para CPremier");
  }

  const vector = await embed(pregunta);
  const { docs, matchesCount } = await pineconeQuery({ cliente, vector });

  if (!docs.length) {
    return { text: "No tengo esa info en la base" };
  }

  const system = systemPromptFor(cliente);
  const contexto = docs.join("\n---\n");

  const chat = await openai.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.7,
    max_tokens: 600,
    messages: [
      { role: "system", content: system },
      { role: "user", content: `Contexto:\n${contexto}\n\nPregunta:\n${pregunta}` }
    ]
  });

  const answer = chat.choices?.[0]?.message?.content?.trim() || "No tengo esa info en la base";
  return { text: answer + `\n\n_(k=${matchesCount})_` };
}
