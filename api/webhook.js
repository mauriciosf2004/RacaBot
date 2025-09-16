import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { handleUserQuestion, getCliente, setCliente } from "../botCore.js";

// --- Configuración ---
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const PASSWORD = "Raca2025@";

if (!TOKEN) throw new Error("Falta TELEGRAM_BOT_TOKEN");
const bot = new Bot(TOKEN);

// --- Estado de sesión (temporal, en memoria) ---
const authenticated = new Set(); // chatId => authenticated

bot.init().catch(() => {});

// --- /start ---
bot.command("start", async (ctx) => {
  const chatId = ctx.chat.id;
  if (authenticated.has(chatId)) {
    return mostrarSelectorCliente(ctx);
  } else {
    await ctx.reply("🔒 Este bot está protegido. Ingresa la contraseña:");
  }
});

// --- Mensajes ---
bot.on("message", async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text?.trim();
  if (!text) return;

  // Si no está autenticado → esperar contraseña
  if (!authenticated.has(chatId)) {
    if (text === PASSWORD) {
      authenticated.add(chatId);
      return mostrarSelectorCliente(ctx);
    } else {
      return ctx.reply("❌ Contraseña incorrecta. Inténtalo de nuevo:");
    }
  }

  // Detecta cliente en línea (e.g. rebel: idea...)
  let cliente = getCliente(chatId);
  const m = text.match(/^(rebel|oana|cpremier)\s*:\s*(.*)$/i);
  if (m) {
    const map = { rebel: "Rebel", oana: "Oana", cpremier: "CPremier" };
    cliente = map[m[1].toLowerCase()];
    setCliente(chatId, cliente);
    await ctx.reply(`Cliente cambiado a *${cliente}*`, { parse_mode: "Markdown" });
  }

  if (!cliente) {
    return ctx.reply("Primero elige un cliente con /start (Rebel, Oana, CPremier).");
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

// --- Botón para elegir cliente ---
bot.callbackQuery(/^cliente:(.*)$/, async (ctx) => {
  const cliente = ctx.match[1];
  setCliente(ctx.chat.id, cliente);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`Cliente seleccionado: *${cliente}*.\n\nEscribe tu pregunta.`, {
    parse_mode: "Markdown"
  });
});

// --- Mostrar el teclado para elegir cliente ---
async function mostrarSelectorCliente(ctx) {
  const kb = new InlineKeyboard()
    .text("Rebel 🏠", "cliente:Rebel").text("Oana 🌊", "cliente:Oana").row()
    .text("CPremier 🏢", "cliente:CPremier");
  await ctx.reply("✅ Acceso autorizado. Elige el cliente:", { reply_markup: kb });
}

// --- Webhook para Vercel ---
export default async function handler(req, res) {
  if (req.method === "POST") {
    return webhookCallback(bot, "express")(req, res);
  }
  res.status(200).send("OK");
}
