import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

const CATEGORIES = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Deli & Charcuterie",
  "Bakery", "Pantry — Dry", "Pantry — Condiments", "Frozen", "Drinks", "Other"
]

const UNITS = [
  "g", "kg", "ml", "l", "tsp", "tbsp", "whole", "rasher", "slice",
  "sheet", "sprig", "bunch", "head", "clove", "fillet", "steak",
  "can", "jar", "packet", "sachet", "pinch", "other"
]

export default function Ingredients({ userId }) {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    name: "", category: "Produce", default_unit: "whole", always_stocked: false
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchIngredients()
  }, [])

  async function fetchIngredients() {
    setLoading(true)
    const { data } = await supabase
      .from("ingredients")
      .select("*")
      .order("category")
      .order("name")
    setIngredients(data || [])
    setLoading(false)
  }

  async function saveIngredient() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from("ingredients").insert({
      ...form,
      user_id: userId
    })
    setForm({ name: "", category: "Produce", default_unit: "whole", always_stocked: false })
    setShowForm(false)
    await fetchIngredients()
    setSaving(false)
  }

  async function deleteIngredient(id) {
    await supabase.from("ingredients").delete().eq("id", id)
    await fetchIngredients()
  }

  // Group by category
  const grouped = ingredients.reduce((acc, ing) => {
    const cat = ing.category || "Other"
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ing)
    return acc
  }, {})

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Ingredients</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-800"
        >
          + Add
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Ingredient name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <select
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <select
            value={form.default_unit}
            onChange={e => setForm({ ...form, default_unit: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {UNITS.map(u => <option key={u}>{u}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={form.always_stocked}
              onChange={e => setForm({ ...form, always_stocked: e.target.checked })}
              className="rounded"
            />
            Always stocked (exclude from shopping list)
          </label>
          <div className="flex gap-2">
            <button
              onClick={saveIngredient}
              disabled={saving}
              className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={() => setShowForm(false)}
              className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Ingredient list */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : ingredients.length === 0 ? (
        <p className="text-gray-400 text-sm">No ingredients yet — add your first one.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                {category}
              </h3>
              <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                {items.map(ing => (
                  <div key={ing.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{ing.name}</p>
                      <p className="text-xs text-gray-400">
                        {ing.default_unit}
                        {ing.always_stocked && " · always stocked"}
                      </p>
                    </div>
                    <button
                      onClick={() => deleteIngredient(ing.id)}
                      className="text-gray-300 hover:text-red-400 text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}