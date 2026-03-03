export default async function handler(req, res) {
  // ---- CORS (allow from localhost; use * for class if you want) ----
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { passcode, messages } = req.body || {};

    if (passcode !== process.env.CLASS_PASSCODE) {
      return res.status(403).json({ error: "Invalid passcode" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Server missing OPENAI_API_KEY" });
    }

    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: "messages must be an array" });
    }

    // Trim history to control cost
    const trimmed = messages.slice(-10);

    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano",
        input: trimmed.map((m) => ({
          role: m.role,
          content: [{ type: "input_text", text: String(m.content || "") }],
        })),
        max_output_tokens: 250,
        temperature: 0.7,
        store: false,
      }),
    });

    const data = await resp.json();

    if (!resp.ok) {
      return res.status(resp.status).json({
        error: data?.error?.message || "OpenAI request failed",
        detail: data,
      });
    }

    // Extract assistant text
    let text = "";
    for (const item of data.output || []) {
      if (item.type === "message" && item.role === "assistant") {
        for (const part of item.content || []) {
          if (part.type === "output_text") text += part.text;
        }
      }
    }

    return res.status(200).json({ text: text || "(No text returned.)" });
  } catch (err) {
    // IMPORTANT: still returns JSON with CORS headers already set above
    return res.status(500).json({
      error: "Proxy crashed",
      message: err?.message || String(err),
    });
  }
}