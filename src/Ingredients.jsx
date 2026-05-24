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

function mapCategory(cat) {
  const map = {
    "Meat and Seafood": "Meat & Seafood",
    "Dairy and Eggs": "Dairy & Eggs",
    "Deli": "Deli & Charcuterie",
    "Pantry Dry": "Pantry — Dry",
    "Pantry Condiments": "Pantry — Condiments",
  }
  return map[cat] || cat || "Other"
}

export default function Ingredients({ householdId }) {
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const [bulkText, setBulkText] = useState("")
  const [bulkParsed, setBulkParsed] = useState(null)
  const [bulkParsing, setBulkParsing] = useState(false)
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkError, setBulkError] = useState("")
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
    await supabase.from("recipe_ingredients").update({ ingredient_id: toId }).eq("ingredient_id", fromId)
    await supabase.from("ingredients").delete().eq("id", fromId)
    setMergingId(null)
    setMergeTargetId("")
    await fetchIngredients()
    setSaving(false)
  }

  async function parseBulk() {
    if (!bulkText.trim()) return
    setBulkParsing(true)
    setBulkError("")
    setBulkParsed(null)
    try {
      const res = await fetch("/api/parse-ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: bulkText,
          recipeName: "bulk ingredient import"
        })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Parse failed")

      // Filter out ones that already exist
      const existing = ingredients.map(i => i.name.toLowerCase())
      const filtered = data.ingredients.filter(i => {
        const words = i.name.toLowerCase().split(" ")
        return !existing.some(e => {
          const eWords = e.split(" ")
          return words.every(w => eWords.includes(w)) || eWords.every(w => words.includes(w))
        })
      }).map(i => ({ ...i, category: mapCategory(i.category), selected: true }))

      setBulkParsed(filtered)
    } catch (err) {
      setBulkError(err.message)
    }
    setBulkParsing(false)
  }

  async function saveBulk() {
    const toSave = bulkParsed.filter(i => i.selected)
    if (toSave.length === 0) return
    setBulkSaving(true)
    await supabase.from("ingredients").insert(
      toSave.map(i => ({
        name: i.name,
        category: i.category,
        default_unit: i.unit || "whole",
        always_stocked: false,
        household_id: householdId
      }))
    )
    setBulkParsed(null)
    setBulkText("")
    setShowBulk(false)
    await fetchIngredients()
    setBulkSaving(false)
  }

  function toggleBulkItem(index) {
    const updated = [...bulkParsed]
    updated[index].selected = !updated[index].selected
    setBulkParsed(updated)
  }

  function updateBulkItem(index, field, value) {
    const updated = [...bulkParsed]
    updated[index][field] = value
    setBulkParsed(updated)
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
        <div className="flex gap-2">
          <button
            onClick={() => { setShowBulk(!showBulk); setShowForm(false); setBulkParsed(null) }}
            className="border border-green-700 text-green-700 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-50"
          >
            Bulk import
          </button>
          <button
            onClick={() => { setShowForm(!showForm); setShowBulk(false) }}
            className="bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-800"
          >
            + Add
          </button>
        </div>
      </div>

      {showBulk && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-3">
          <p className="font-medium text-gray-700 text-sm">Bulk ingredient import</p>
          <p className="text-xs text-gray-400">Paste a list of ingredient names, one per line. AI will assign categories and units. Duplicates are automatically filtered out.</p>

          {!bulkParsed ? (
            <>
              <textarea
                placeholder={"Chicken breast\nOnion\nGarlic\nOlive oil\nParmesan\nBasmati rice\n..."}
                value={bulkText}
                onChange={e => setBulkText(e.target.value)}
                rows={8}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
              />
              {bulkError && <p className="text-xs text-red-500">{bulkError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={parseBulk}
                  disabled={bulkParsing || !bulkText.trim()}
                  className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
                >
                  {bulkParsing ? "Parsing..." : "Parse ingredients"}
                </button>
                <button
                  onClick={() => { setShowBulk(false); setBulkText("") }}
                  className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500">{bulkParsed.filter(i => i.selected).length} of {bulkParsed.length} ingredients selected. Untick any you don't want. Edit category or unit inline.</p>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {bulkParsed.map((item, index) => (
                  <div key={index} className={`flex items-center gap-2 px-3 py-2 ${!item.selected ? "opacity-40" : ""}`}>
                    <input
                      type="checkbox"
                      checked={item.selected}
                      onChange={() => toggleBulkItem(index)}
                      className="flex-shrink-0"
                    />
                    <span className="text-sm text-gray-800 w-32 flex-shrink-0">{item.name}</span>
                    <select
                      value={item.category}
                      onChange={e => updateBulkItem(index, "category", e.target.value)}
                      disabled={!item.selected}
                      className="flex-1 border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                    <select
                      value={item.unit}
                      onChange={e => updateBulkItem(index, "unit", e.target.value)}
                      disabled={!item.selected}
                      className="w-20 border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                    >
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveBulk}
                  disabled={bulkSaving || bulkParsed.filter(i => i.selected).length === 0}
                  className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
                >
                  {bulkSaving ? "Saving..." : `Save ${bulkParsed.filter(i => i.selected).length} ingredients`}
                </button>
                <button
                  onClick={() => { setBulkParsed(null); setBulkText("") }}
                  className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      )}

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
                          {ingredients.filter(i => i.id !== ing.id).map(i => (
                            <option key={i.id} value={i.id}>{i.name}</option>
                          ))}
                        </select>
                        <p className="text-xs text-gray-400">All recipes using {ing.name} will be updated. {ing.name} will be deleted.</p>
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
                          <button onClick={() => startEdit(ing)} className="text-xs text-gray-400 hover:text-green-700">Edit</button>
                          <button onClick={() => startMerge(ing.id)} className="text-xs text-gray-400 hover:text-orange-600">Merge</button>
                          <button onClick={() => deleteIngredient(ing.id)} className="text-gray-300 hover:text-red-400 text-lg leading-none">×</button>
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
