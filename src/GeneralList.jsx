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

const CATEGORY_ORDER = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Deli & Charcuterie",
  "Bakery", "Pantry — Dry", "Pantry — Condiments", "Frozen", "Drinks", "Other"
]

export default function GeneralList({ householdId, userId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ name: "", quantity: "", unit: "whole", category: "Other" })

  useEffect(() => {
    fetchItems()
    const subscription = supabase
      .channel("general_list")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "general_list_items" },
        ({ new: row }) => setItems(prev => [...prev, row])
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "general_list_items" },
        ({ new: row }) => setItems(prev => prev.map(i => i.id === row.id ? row : i))
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "general_list_items" },
        ({ old: row }) => setItems(prev => prev.filter(i => i.id !== row.id))
      )
      .subscribe()
    return () => supabase.removeChannel(subscription)
  }, [])

  async function fetchItems() {
    const { data } = await supabase
      .from("general_list_items")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at")
    setItems(data || [])
    setLoading(false)
  }

  async function addItem() {
    if (!form.name.trim()) return
    setSaving(true)
    const newItem = {
      household_id: householdId,
      added_by: userId,
      name: form.name.trim(),
      quantity: form.quantity ? parseFloat(form.quantity) : null,
      unit: form.unit || null,
      category: form.category,
      checked: false,
      created_at: new Date().toISOString(),
    }
    // Optimistically add with a temp id — subscription will replace it with the real row
    const tempId = "temp_" + Date.now()
    setItems(prev => [...prev, { ...newItem, id: tempId }])
    setForm({ name: "", quantity: "", unit: "whole", category: "Other" })
    setShowForm(false)
    setSaving(false)
    const { data } = await supabase.from("general_list_items").insert(newItem).select().single()
    // Swap temp row for the real one (subscription may beat us here, that's fine)
    if (data) setItems(prev => prev.map(i => i.id === tempId ? data : i))
    else setItems(prev => prev.filter(i => i.id !== tempId))
  }

  function toggleItem(id, currentChecked) {
    // Optimistic update — no await
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !currentChecked } : i))
    supabase.from("general_list_items").update({ checked: !currentChecked }).eq("id", id)
  }

  function deleteItem(id) {
    setItems(prev => prev.filter(i => i.id !== id))
    supabase.from("general_list_items").delete().eq("id", id)
  }

  function clearChecked() {
    // Optimistic update — no await
    setItems(prev => prev.filter(i => !i.checked))
    supabase.from("general_list_items").delete().eq("household_id", householdId).eq("checked", true)
  }

  function formatQty(qty) {
    if (!qty) return ""
    return qty === Math.floor(qty) ? String(Math.floor(qty)) : qty.toFixed(1)
  }

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {})

  // Catch any items with an unrecognised category
  const knownCategories = new Set(CATEGORY_ORDER)
  const overflow = items.filter(i => !knownCategories.has(i.category))
  if (overflow.length > 0) grouped["Other"] = [...(grouped["Other"] || []), ...overflow]

  const checkedCount = items.filter(i => i.checked).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">General List</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-800"
        >
          + Add item
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Item name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            onKeyDown={e => e.key === "Enter" && addItem()}
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder="Qty (optional)"
              value={form.quantity}
              onChange={e => setForm({ ...form, quantity: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <select
              value={form.unit}
              onChange={e => setForm({ ...form, unit: e.target.value })}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              {UNITS.map(u => <option key={u}>{u}</option>)}
            </select>
          </div>
          <select
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="flex gap-2">
            <button
              onClick={addItem}
              disabled={saving || !form.name.trim()}
              className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add"}
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
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm px-4 py-6 text-center">
          <p className="text-gray-400 text-sm">Your general list is empty.</p>
          <p className="text-gray-300 text-xs mt-1">Tap + Add item to get started.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400">{checkedCount} of {items.length} items collected</p>
            {checkedCount > 0 && (
              <button onClick={clearChecked} className="text-xs text-gray-400 hover:text-gray-600">
                Clear checked
              </button>
            )}
          </div>
          <div className="space-y-4">
            {Object.entries(grouped).map(([category, catItems]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                  {category}
                </h3>
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {catItems.map(item => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between px-4 py-3 transition-colors ${item.checked ? "bg-gray-50" : ""}`}
                    >
                      <div
                        className="flex items-center gap-3 flex-1 cursor-pointer"
                        onClick={() => toggleItem(item.id, item.checked)}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${item.checked ? "bg-green-600 border-green-600" : "border-gray-300"}`}>
                          {item.checked && <span className="text-white text-xs">✓</span>}
                        </div>
                        <span className={`text-sm ${item.checked ? "line-through text-gray-300" : "text-gray-700"}`}>
                          {item.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-sm font-medium tabular-nums ${item.checked ? "text-gray-300" : "text-gray-500"}`}>
                          {formatQty(item.quantity)}{item.quantity && item.unit !== "other" ? ` ${item.unit}` : ""}
                        </span>
                        <button
                          onClick={() => deleteItem(item.id)}
                          className="text-gray-300 hover:text-red-400 text-lg leading-none"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
