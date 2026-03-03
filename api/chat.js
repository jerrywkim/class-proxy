export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { passcode, groupId, messages } = req.body || {};

  // Simple class passcode gate
  if (passcode !== process.env.CLASS_PASSCODE) {
    return res.status(403).json({ error: "Invalid passcode" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Server missing OPENAI_API_KEY" });
  }

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "messages must be an array" });
  }

  // Optional: clamp groups to group1..group10
  const g = String(groupId || "group1").toLowerCase().trim();
  if (!/^group([1-9]|10)$/.test(g)) {
    return res.status(400).json({ error: "groupId must be group1..group10" });
  }

  // Guardrails: trim history
  const trimmed = messages.slice(-10);

  try {
    const resp = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4.1-nano", // or gpt-4.1-mini, etc.
        input: trimmed.map(m => ({
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

    // Extract assistant text from Responses API output
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
    return res.status(500).json({ error: err?.message || "Unknown error" });
  }
}