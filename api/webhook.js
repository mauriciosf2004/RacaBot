import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { handleUserQuestion, getCliente, setCliente } from "../botCore.js";

// --- Configuración ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PASSWORD = "Raca2025@";
const session = new Map(); // chatId -> { auth: true/false, cliente }

if (!TOKEN) throw new Error("Falta TELEGRAM_BOT_TOKEN");
const bot = new Bot(TOKEN);

// --- Inicializar bot sin long-polling (solo webhook en Vercel) ---
bot.init().catch(() => {});

// --- /start ---
bot.command("start", async (ctx) => {
  const chatId = ctx.chat.id;
  session.set(chatId, { auth: false }); // Reiniciar sesión
  await ctx.reply("🔒 Este bot está protegido. Por favor, ingresa la contraseña:");
});

// --- Mensajes generales ---
bot.on("message", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text?.trim();
  if (!text) return;

  const userSession = session.get(chatId) || {};

  // --- No autenticado → pedir contraseña ---
  if (!userSession.auth) {
    if (text === PASSWORD) {
      session.set(chatId, { auth: true });
      const kb = new InlineKeyboard()
        .text("Rebel 🏠", "cliente:Rebel").text("Oana 🌊", "cliente:Oana").row()
        .text("CPremier 🏢", "cliente:CPremier");
      await ctx.reply("✅ Contraseña correcta. Elige el cliente:", { reply_markup: kb });
    } else {
      await ctx.reply("❌ Contraseña incorrecta. Inténtalo de nuevo:");
    }
    return;
  }

  // --- Cliente en línea (e.g. "rebel: idea de contenido") ---
  let cliente = getCliente(chatId);
  const m = text.match(/^(rebel|oana|cpremier)\s*:\s*(.*)$/i);
  if (m) {
    const map = { rebel: "Rebel", oana: "Oana", cpremier: "CPremier" };
    cliente = map[m[1].toLowerCase()];
    setCliente(chatId, cliente);
    await ctx.reply(`Cliente cambiado a *${cliente}*`, { parse_mode: "Markdown" });
  }

  if (!cliente) {
    return ctx.reply("👋 Primero elige un cliente con /start (Rebel, Oana, CPremier).");
  }

  await ctx.reply("⏳ pensando...");
  try {
    const ans = await handleUserQuestion({
      chatId,
      cliente,
      pregunta: m ? m[2] : text,
    });
    await ctx.reply(ans.text, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Bot error:", e);
    await ctx.reply(`⚠️ Error: ${e.message}`);
  }
});

// --- Selección de cliente (inline button) ---
bot.callbackQuery(/^cliente:(.*)$/, async (ctx) => {
  const cliente = ctx.match[1];
  setCliente(ctx.chat.id, cliente);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`Cliente seleccionado: *${cliente}*.\n\nEscribe tu pregunta.`, {
    parse_mode: "Markdown"
  });
});

// --- Webhook para Vercel ---
export default async function handler(req, res) {
  if (req.method === "POST") {
    return webhookCallback(bot, "express")(req, res);
  }
  res.status(200).send("OK");
}
