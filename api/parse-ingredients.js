export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  const { text, recipeName } = req.body

  if (!text) {
    return res.status(400).json({ error: "No ingredient text provided" })
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Parse the following ingredient list into JSON. Return ONLY a JSON array, no other text, no markdown.

Each item in the array should have these fields:
- name: string (canonical ingredient name, title case, e.g. "Chicken Breast")
- quantity: number or null (numeric amount only)
- unit: string (must be one of: g, kg, ml, l, tsp, tbsp, whole, rasher, slice, sheet, sprig, bunch, head, clove, fillet, steak, can, jar, packet, sachet, pinch, other)
- preparation: string (e.g. "diced", "minced", or "" if none)

Rules:
- Convert imperial to metric: oz to g (multiply by 28.35, round to nearest 5), cups to ml (multiply by 240), lb to g (multiply by 453.6)
- If something is clearly countable (eggs, onions, sausages) use "whole" as unit
- If quantity is "to taste" or missing, set quantity to null and unit to "pinch"
- Strip any parenthetical clarifications from the name

Recipe name for context: ${recipeName || "Unknown"}

Ingredient list:
${text}`
          }
        ]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || "API error" })
    }

    const content = data.content[0].text.trim()

    try {
      const cleaned = content
        .replace(/```json/g, "")
        .replace(/```/g, "")
        .trim()
      const parsed = JSON.parse(cleaned)
      return res.status(200).json({ ingredients: parsed })
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: content })
    }

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}