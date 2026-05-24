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

export default function Ingredients({ householdId }) {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [mergingId, setMergingId] = useState(null)
  const [mergeTargetId, setMergeTargetId] = useState("")
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: "", category: "Produce", default_unit: "whole", always_stocked: false
  })

  useEffect(() => { fetchIngredients() }, [])

  async function fetchIngredients() {
    setLoading(true)
    const { data } = await supabase
      .from("ingredients")
      .select("*")
      .eq("household_id", householdId)
      .order("category")
      .order("name")
    setIngredients(data || [])
    setLoading(false)
  }

  async function saveIngredient() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from("ingredients").insert({ ...form, household_id: householdId })
    setForm({ name: "", category: "Produce", default_unit: "whole", always_stocked: false })
    setShowForm(false)
    await fetchIngredients()
    setSaving(false)
  }

  async function saveEdit(id) {
    setSaving(true)
    await supabase.from("ingredients").update({
      name: editForm.name,
      category: editForm.category,
      default_unit: editForm.default_unit,
      always_stocked: editForm.always_stocked
    }).eq("id", id)
    setEditingId(null)
    await fetchIngredients()
    setSaving(false)
  }

  async function deleteIngredient(id) {
    await supabase.from("ingredients").delete().eq("id", id)
    await fetchIngredients()
  }

  async function mergeIngredient(fromId, toId) {
    if (!toId) return
    setSaving(true)
    // Move all recipe_ingredients to the target
    await supabase
      .from("recipe_ingredients")
      .update({ ingredient_id: toId })
      .eq("ingredient_id", fromId)
    // Delete the duplicate
    await supabase.from("ingredients").delete().eq("id", fromId)
    setMergingId(null)
    setMergeTargetId("")
    await fetchIngredients()
    setSaving(false)
  }

  function startEdit(ing) {
    setEditingId(ing.id)
    setEditForm({
      name: ing.name,
      category: ing.category,
      default_unit: ing.default_unit,
      always_stocked: ing.always_stocked
    })
    setMergingId(null)
  }

  function startMerge(id) {
    setMergingId(id)
    setMergeTargetId("")
    setEditingId(null)
  }

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
            Always stocked
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
                  <div key={ing.id}>
                    {editingId === ing.id ? (
                      <div className="p-4 space-y-2">
                        <input
                          type="text"
                          value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <select
                            value={editForm.category}
                            onChange={e => setEditForm({ ...editForm, category: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                          <select
                            value={editForm.default_unit}
                            onChange={e => setEditForm({ ...editForm, default_unit: e.target.value })}
                            className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                          >
                            {UNITS.map(u => <option key={u}>{u}</option>)}
                          </select>
                        </div>
                        <label className="flex items-center gap-2 text-sm text-gray-600">
                          <input
                            type="checkbox"
                            checked={editForm.always_stocked}
                            onChange={e => setEditForm({ ...editForm, always_stocked: e.target.checked })}
                          />
                          Always stocked
                        </label>
                        <div className="flex gap-2">
                          <button
                            onClick={() => saveEdit(ing.id)}
                            disabled={saving}
                            className="flex-1 bg-green-700 text-white rounded-lg py-1.5 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
                          >
                            {saving ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="flex-1 border border-gray-300 rounded-lg py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : mergingId === ing.id ? (
                      <div className="p-4 space-y-2">
                        <p className="text-sm font-medium text-gray-700">Merge <span className="text-green-700">{ing.name}</span> into:</p>
                        <select
                          value={mergeTargetId}
                          onChange={e => setMergeTargetId(e.target.value)}
                          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                        >
                          <option value="">Select ingredient...</option>
                          {ingredients
                            .filter(i => i.id !== ing.id)
                            .map(i => <option key={i.id} value={i.id}>{i.name}</option>)
                          }
                        </select>
                        <p className="text-xs text-gray-400">All recipes using {ing.name} will be updated to use the selected ingredient. {ing.name} will be deleted.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={() => mergeIngredient(ing.id, mergeTargetId)}
                            disabled={saving || !mergeTargetId}
                            className="flex-1 bg-orange-600 text-white rounded-lg py-1.5 text-sm font-medium hover:bg-orange-700 disabled:opacity-50"
                          >
                            {saving ? "Merging..." : "Merge"}
                          </button>
                          <button
                            onClick={() => setMergingId(null)}
                            className="flex-1 border border-gray-300 rounded-lg py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{ing.name}</p>
                          <p className="text-xs text-gray-400">
                            {ing.default_unit}
                            {ing.always_stocked && " · always stocked"}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => startEdit(ing)}
                            className="text-xs text-gray-400 hover:text-green-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => startMerge(ing.id)}
                            className="text-xs text-gray-400 hover:text-orange-600"
                          >
                            Merge
                          </button>
                          <button
                            onClick={() => deleteIngredient(ing.id)}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    )}
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
