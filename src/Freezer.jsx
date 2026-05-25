import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

const CATEGORIES = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Pantry — Dry",
  "Pantry — Condiments", "Frozen", "Other"
]

const UNITS = ["g", "kg", "ml", "l", "whole", "rasher", "fillet", "steak", "packet", "other"]

const CATEGORY_ORDER = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Pantry — Dry",
  "Pantry — Condiments", "Frozen", "Other"
]

const BULK_ITEMS = [
  { name: "Beef Mince", unit: "g" },
  { name: "Pork Mince", unit: "g" },
  { name: "Chicken Breast", unit: "g" },
  { name: "Chicken Thighs", unit: "g" },
  { name: "Bacon", unit: "rasher" },
  { name: "Sausages", unit: "whole" },
]

const DEFAULT_FORM = {
  name: "",
  category: "Meat & Seafood",
  quantity: "",
  unit: "g",
  packs: "1",
  date_frozen: new Date().toISOString().split("T")[0],
  use_by: "",
  notes: "",
  low_stock_threshold: "",
}

function getUseByStatus(useby) {
  if (!useby) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const [y, m, d] = useby.split("-").map(Number)
  const useByDate = new Date(y, m - 1, d)
  const diffDays = Math.floor((useByDate - today) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return "expired"
  if (diffDays <= 7) return "soon"
  return "ok"
}

function worstUseByStatus(groupItems) {
  let worst = null
  for (const item of groupItems) {
    const s = getUseByStatus(item.use_by)
    if (s === "expired") return "expired"
    if (s === "soon") worst = "soon"
  }
  return worst
}

function formatQty(qty) {
  if (qty == null) return ""
  return qty === Math.floor(qty) ? String(Math.floor(qty)) : parseFloat(qty.toFixed(2)).toString()
}

function formatDate(dateStr) {
  if (!dateStr) return ""
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(y, m - 1, d).toLocaleDateString("en-AU", { day: "numeric", month: "short" })
}

export default function Freezer({ householdId }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [showBulkPicker, setShowBulkPicker] = useState(false)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [saving, setSaving] = useState(false)
  const [useModal, setUseModal] = useState(null)
  const [useAmount, setUseAmount] = useState("")
  const [using, setUsing] = useState(false)

  useEffect(() => {
    fetchItems()
    const subscription = supabase
      .channel("freezer_items")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "freezer_items" },
        ({ new: row }) => setItems(prev => [...prev, row])
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "freezer_items" },
        ({ new: row }) => setItems(prev => prev.map(i => i.id === row.id ? row : i))
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "freezer_items" },
        ({ old: row }) => setItems(prev => prev.filter(i => i.id !== row.id))
      )
      .subscribe()
    return () => supabase.removeChannel(subscription)
  }, [])

  async function fetchItems() {
    const { data } = await supabase
      .from("freezer_items")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at")
    setItems(data || [])
    setLoading(false)
  }

  async function addItem() {
    if (!form.name.trim() || !form.quantity) return
    const packCount = Math.max(1, parseInt(form.packs) || 1)
    setSaving(true)
    const baseItem = {
      household_id: householdId,
      name: form.name.trim(),
      category: form.category,
      quantity: parseFloat(form.quantity),
      unit: form.unit,
      date_frozen: form.date_frozen || null,
      use_by: form.use_by || null,
      notes: form.notes.trim() || null,
      low_stock_threshold: form.low_stock_threshold ? parseFloat(form.low_stock_threshold) : null,
    }
    setForm(DEFAULT_FORM)
    setShowForm(false)
    setSaving(false)

    if (packCount === 1) {
      const tempId = "temp_" + Date.now()
      setItems(prev => [...prev, { ...baseItem, id: tempId, created_at: new Date().toISOString() }])
      const { data } = await supabase.from("freezer_items").insert(baseItem).select().single()
      if (data) setItems(prev => prev.map(i => i.id === tempId ? data : i))
      else setItems(prev => prev.filter(i => i.id !== tempId))
    } else {
      // Insert N rows — subscription callbacks will add each to state
      const rows = Array.from({ length: packCount }, () => ({ ...baseItem }))
      await supabase.from("freezer_items").insert(rows)
    }
  }

  function openUseModal(item) {
    setUseModal(item)
    setUseAmount("")
  }

  async function confirmUse() {
    if (!useAmount || !useModal) return
    const amount = parseFloat(useAmount)
    if (isNaN(amount) || amount <= 0) return
    setUsing(true)
    const newQty = useModal.quantity - amount
    if (newQty <= 0) {
      setItems(prev => prev.filter(i => i.id !== useModal.id))
      await supabase.from("freezer_items").delete().eq("id", useModal.id)
    } else {
      setItems(prev => prev.map(i => i.id === useModal.id ? { ...i, quantity: newQty } : i))
      await supabase.from("freezer_items").update({ quantity: newQty }).eq("id", useModal.id)
    }
    setUsing(false)
    setUseModal(null)
    setUseAmount("")
  }

  // Removes the oldest item in a name+category group (FIFO)
  function useOneFromGroup(groupItems) {
    const oldest = [...groupItems].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]
    if (!oldest) return
    setItems(prev => prev.filter(i => i.id !== oldest.id))
    supabase.from("freezer_items").delete().eq("id", oldest.id)
  }

  function deleteItem(id) {
    setItems(prev => prev.filter(i => i.id !== id))
    supabase.from("freezer_items").delete().eq("id", id)
  }

  function selectBulkItem(bulkItem) {
    setForm({ ...DEFAULT_FORM, name: bulkItem.name, unit: bulkItem.unit, category: "Meat & Seafood" })
    setShowBulkPicker(false)
    setShowForm(true)
  }

  // Group by category, then by name within each category
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat)
    if (catItems.length === 0) return acc
    const byName = {}
    for (const item of catItems) {
      if (!byName[item.name]) byName[item.name] = []
      byName[item.name].push(item)
    }
    acc[cat] = byName
    return acc
  }, {})
  const knownCategories = new Set(CATEGORY_ORDER)
  const overflow = items.filter(i => !knownCategories.has(i.category))
  if (overflow.length > 0) {
    if (!grouped["Other"]) grouped["Other"] = {}
    for (const item of overflow) {
      if (!grouped["Other"][item.name]) grouped["Other"][item.name] = []
      grouped["Other"][item.name].push(item)
    }
  }

  const packCount = parseInt(form.packs) || 1

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Freezer</h2>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowBulkPicker(v => !v); setShowForm(false) }}
            className="bg-green-100 text-green-800 px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-200"
          >
            Bulk pack
          </button>
          <button
            onClick={() => { setShowForm(v => !v); setShowBulkPicker(false) }}
            className="bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-800"
          >
            + Add item
          </button>
        </div>
      </div>

      {showBulkPicker && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4">
          <p className="text-sm font-medium text-gray-700 mb-3">Quick add bulk pack</p>
          <div className="grid grid-cols-2 gap-2">
            {BULK_ITEMS.map(item => (
              <button
                key={item.name}
                onClick={() => selectBulkItem(item)}
                className="border border-green-200 rounded-lg px-3 py-2.5 text-sm text-green-800 hover:bg-green-50 text-left font-medium"
              >
                {item.name}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowBulkPicker(false)}
            className="mt-3 w-full text-xs text-gray-400 hover:text-gray-600"
          >
            Cancel
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-3">
          <input
            type="text"
            placeholder="Item name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            autoFocus
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">
                {packCount > 1 ? "Size per pack" : "Quantity"}
              </label>
              <input
                type="number"
                placeholder="e.g. 500"
                value={form.quantity}
                onChange={e => setForm({ ...form, quantity: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Unit</label>
              <select
                value={form.unit}
                onChange={e => setForm({ ...form, unit: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Number of packs</label>
            <input
              type="number"
              min="1"
              placeholder="1"
              value={form.packs}
              onChange={e => setForm({ ...form, packs: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            {packCount > 1 && (
              <p className="text-xs text-green-700 mt-1">
                Adding {packCount} × {form.quantity || "?"}{form.unit !== "other" ? form.unit : ""} packs
              </p>
            )}
          </div>
          <select
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Date frozen</label>
              <input
                type="date"
                value={form.date_frozen}
                onChange={e => setForm({ ...form, date_frozen: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Use by (optional)</label>
              <input
                type="date"
                value={form.use_by}
                onChange={e => setForm({ ...form, use_by: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
          <input
            type="number"
            placeholder={`Low stock threshold (optional, in ${form.unit})`}
            value={form.low_stock_threshold}
            onChange={e => setForm({ ...form, low_stock_threshold: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <textarea
            placeholder="Notes (optional)"
            value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={addItem}
              disabled={saving || !form.name.trim() || !form.quantity}
              className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
            >
              {saving ? "Adding..." : packCount > 1 ? `Add ${packCount} packs` : "Add to freezer"}
            </button>
            <button
              onClick={() => { setShowForm(false); setForm(DEFAULT_FORM) }}
              className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {useModal && (
        <div className="fixed inset-0 bg-black/40 flex items-end justify-center z-50" onClick={() => setUseModal(null)}>
          <div className="bg-white rounded-t-2xl p-5 w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold text-gray-800 mb-1">Use from freezer</p>
            <p className="text-xs text-gray-400 mb-4">
              {useModal.name} — {formatQty(useModal.quantity)}{useModal.unit !== "other" ? ` ${useModal.unit}` : ""} remaining
            </p>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder={`Amount in ${useModal.unit}`}
                value={useAmount}
                onChange={e => setUseAmount(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirmUse()}
                autoFocus
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              {useModal.unit !== "other" && (
                <span className="text-sm text-gray-500 whitespace-nowrap">{useModal.unit}</span>
              )}
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={confirmUse}
                disabled={using || !useAmount}
                className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
              >
                {using ? "Updating..." : "Use"}
              </button>
              <button
                onClick={() => setUseModal(null)}
                className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm px-4 py-6 text-center">
          <p className="text-gray-400 text-sm">Your freezer is empty.</p>
          <p className="text-gray-300 text-xs mt-1">Tap + Add item or Bulk pack to get started.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, byName]) => (
            <div key={category}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{category}</h3>
              <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                {Object.entries(byName).map(([name, groupItems]) => {
                  const sorted = [...groupItems].sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                  const count = sorted.length
                  const oldest = sorted[0]
                  const useByStatus = worstUseByStatus(sorted)
                  const allSameQty = sorted.every(i => i.quantity === oldest.quantity && i.unit === oldest.unit)
                  const isLow = oldest.low_stock_threshold != null &&
                    sorted.reduce((sum, i) => sum + i.quantity, 0) <= oldest.low_stock_threshold

                  return (
                    <div
                      key={name}
                      className={`px-4 py-3 ${
                        useByStatus === "expired" ? "bg-red-50" : useByStatus === "soon" ? "bg-amber-50" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-gray-800">{name}</span>
                            {count > 1 && (
                              <span className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full font-medium">
                                × {count} packs
                              </span>
                            )}
                            {isLow && (
                              <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">
                                Running low
                              </span>
                            )}
                            {useByStatus === "expired" && (
                              <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                                Expired
                              </span>
                            )}
                            {useByStatus === "soon" && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                                Use soon
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                            <span className="text-sm text-gray-600 font-medium tabular-nums">
                              {allSameQty
                                ? `${formatQty(oldest.quantity)}${oldest.unit !== "other" ? oldest.unit : ""}${count > 1 ? " each" : ""}`
                                : `${formatQty(sorted.reduce((s, i) => s + i.quantity, 0))}${oldest.unit !== "other" ? oldest.unit : ""} total`
                              }
                            </span>
                            {oldest.date_frozen && (
                              <span className="text-xs text-gray-400">frozen {formatDate(oldest.date_frozen)}</span>
                            )}
                            {oldest.use_by && (
                              <span className={`text-xs ${
                                useByStatus === "expired" ? "text-red-500" :
                                useByStatus === "soon" ? "text-amber-600" : "text-gray-400"
                              }`}>
                                use by {formatDate(oldest.use_by)}
                              </span>
                            )}
                          </div>
                          {oldest.notes && (
                            <p className="text-xs text-gray-400 mt-0.5">{oldest.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {count > 1 ? (
                            <button
                              onClick={() => useOneFromGroup(sorted)}
                              className="text-xs bg-green-100 text-green-800 px-2.5 py-1 rounded-lg hover:bg-green-200 font-medium whitespace-nowrap"
                            >
                              Use one
                            </button>
                          ) : (
                            <button
                              onClick={() => openUseModal(oldest)}
                              className="text-xs bg-green-100 text-green-800 px-2.5 py-1 rounded-lg hover:bg-green-200 font-medium"
                            >
                              Use
                            </button>
                          )}
                          <button
                            onClick={() => deleteItem(oldest.id)}
                            className="text-gray-300 hover:text-red-400 text-lg leading-none"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
