import { Bot, InlineKeyboard, webhookCallback } from "grammy";
import { handleUserQuestion, getCliente, setCliente } from "../botCore.js";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) throw new Error("Falta TELEGRAM_BOT_TOKEN");

const bot = new Bot(TOKEN);
bot.init().catch(() => {});

// /start
bot.command("start", async (ctx) => {
  const kb = new InlineKeyboard()
    .text("Rebel 🏠", "cliente:Rebel").text("Oana 🌊", "cliente:Oana").row()
    .text("CPremier 🏢", "cliente:CPremier");
  await ctx.reply("Elige el cliente con el que quieres trabajar:", { reply_markup: kb });
});

// Selección
bot.callbackQuery(/^cliente:(.*)$/, async (ctx) => {
  const cliente = ctx.match[1];
  setCliente(ctx.chat.id, cliente);
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(`Cliente seleccionado: *${cliente}*.\n\nEscribe tu pregunta.`, { parse_mode: "Markdown" });
});

// Mensajes
bot.on("message", async (ctx) => {
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
  if (!cliente) return ctx.reply("Primero elige un cliente con /start (Rebel, Oana, CPremier).");

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

// Handler Vercel
export default async function handler(req, res) {
  if (req.method === "POST") {
    // --- SHIM para “express” en Vercel ---
    if (typeof req.header !== "function") {
      req.header = (name) => req.headers?.[name.toLowerCase()];
    }
    return webhookCallback(bot, "express")(req, res);
  }
  res.status(200).send("OK");
}
