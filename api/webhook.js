import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { handleUserQuestion, getCliente, setCliente } from "../botCore.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("Falta TELEGRAM_BOT_TOKEN");

const bot = new Bot(TOKEN);
bot.init().catch(() => {}); // evitar long-polling en Vercel

const PASSWORD = "Raca2025@";
const sessions = new Map(); // chatId -> { authenticated: true, cliente: "Rebel"|"Oana"|"CPremier" }

// /start: pide contraseña si no está autenticado
bot.command("start", async (ctx) => {
  const chatId = ctx.chat.id;
  const ses = sessions.get(chatId) || {};
  if (!ses.authenticated) {
    await ctx.reply("🔒 Ingresa la contraseña para usar el bot:");
    sessions.set(chatId, { ...ses, awaitingPassword: true });
    return;
  }

  const kb = new InlineKeyboard()
    .text("Rebel 🏠", "cliente:Rebel").text("Oana 🌊", "cliente:Oana").row()
    .text("CPremier 🏢", "cliente:CPremier");

  await ctx.reply("Elige el cliente con el que quieres trabajar:", { reply_markup: kb });
});

// Contraseña
bot.on("message:text", async (ctx, next) => {
  const chatId = ctx.chat.id;
  const ses = sessions.get(chatId);

  if (ses?.awaitingPassword) {
    const pass = ctx.message.text.trim();
    if (pass === PASSWORD) {
      sessions.set(chatId, { authenticated: true });
      await ctx.reply("✅ Acceso concedido. Usa /start para comenzar.");
    } else {
      await ctx.reply("❌ Contraseña incorrecta. Intenta de nuevo con /start.");
    }
    return; // importante: no seguir
  }

  await next(); // pasar al siguiente middleware (como mensajes normales)
});

// Selección de cliente
bot.callbackQuery(/^cliente:(.*)$/, async (ctx) => {
  const cliente = ctx.match[1];
  setCliente(ctx.chat.id, cliente);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`Cliente seleccionado: *${cliente}*.\n\nEscribe tu pregunta.`, { parse_mode: "Markdown" });
});

// Preguntas normales
bot.on("message:text", async (ctx) => {
  const text = ctx.message.text?.trim();
  if (!text) return;

  let cliente = getCliente(ctx.chat.id);
  const m = text.match(/^(rebel|oana|cpremier)\s*:\s*(.*)$/i);
  if (m) {
    const map = { rebel: "Rebel", oana: "Oana", cpremier: "CPremier" };
    cliente = map[m[1].toLowerCase()];
    setCliente(ctx.chat.id, cliente);
    await ctx.reply(`Cliente cambiado a *${cliente}*`, { parse_mode: "Markdown" });
  }

  if (!cliente) {
    return ctx.reply("Primero elige un cliente con /start (Rebel, Oana, CPremier).");
  }

  await ctx.reply("⏳ pensando…");
  try {
    const ans = await handleUserQuestion({
      chatId: ctx.chat.id,
      cliente,
      pregunta: m ? m[2] : text,
    });
    await ctx.reply(ans.text, { parse_mode: "Markdown" });
  } catch (e) {
    console.error("Bot error:", e);
    await ctx.reply(`⚠️ Error: ${e.message}`);
  }
});

// Webhook handler para Vercel
export default async function handler(req, res) {
  if (req.method === "POST") {
    return webhookCallback(bot, "express")(req, res);
  }
  res.status(200).send("OK");
}
