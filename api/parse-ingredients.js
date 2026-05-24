export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" })
  }

  let body = req.body
  if (typeof body === "string") {
    try { body = JSON.parse(body) } catch { body = {} }
  }

  const { text, recipeName } = body || {}

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
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: "Parse the following ingredient list into JSON. Return ONLY a JSON array, no other text, no markdown backticks.\n\nEach item must have:\n- name: string (title case, e.g. Chicken Breast)\n- quantity: number or null\n- unit: one of: g kg ml l tsp tbsp whole rasher slice sheet sprig bunch head clove fillet steak can jar packet sachet pinch other\n- preparation: string (e.g. diced) or empty string\n- category: one of: Produce, Meat and Seafood, Dairy and Eggs, Deli, Bakery, Pantry Dry, Pantry Condiments, Frozen, Drinks, Other\n\nRules:\n- oz to g: multiply by 28.35 round to 5\n- cups to ml: multiply by 240\n- lb to g: multiply by 453.6\n- countable items (eggs onions sausages): use whole\n- missing quantity: null with pinch unit\n- Produce: fresh fruit veg\n- Meat and Seafood: raw meat fish\n- Dairy and Eggs: milk cheese eggs butter\n- Pantry Dry: pasta rice canned goods flour\n- Pantry Condiments: oils spices sauces vinegar\n\nRecipe: " + (recipeName || "Unknown") + "\n\nIngredients:\n" + text
          }
        ]
      })
    })

    const data = await response.json()

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || "API error" })
    }

    const content = data.content[0].text.trim()
const cleaned = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    try {
      const parsed = JSON.parse(cleaned)
      return res.status(200).json({ ingredients: parsed })
    } catch {
      return res.status(500).json({ error: "Failed to parse AI response", raw: content })
    }

  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
