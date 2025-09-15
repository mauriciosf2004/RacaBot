export default async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const base = process.env.VERCEL_URL || process.env.DEPLOY_URL; // Vercel setea VERCEL_URL
  if (!token || !base) {
    return res.status(500).json({ error: "Faltan TELEGRAM_BOT_TOKEN o VERCEL_URL" });
  }
  const url = `https://${base}/api/webhook`;
  const r = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
  const data = await r.json();
  res.status(200).json({ set: data, webhook_url: url });
}
