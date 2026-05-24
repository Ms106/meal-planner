import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

const CATEGORY_ORDER = ["Produce","Meat & Seafood","Dairy & Eggs","Deli & Charcuterie","Bakery","Pantry — Dry","Pantry — Condiments","Frozen","Drinks","Other"]

function getMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split("T")[0]
}

export default function ShoppingList({ householdId }) {
  const [items, setItems] = useState([])
  const [checked, setChecked] = useState({})
  const [loading, setLoading] = useState(true)
  const [week, setWeek] = useState(getMonday())

  useEffect(() => { fetchList() }, [week])

  async function fetchList() {
    setLoading(true)
    const { data: planEntries } = await supabase.from("meal_plan").select("recipe_id, servings_multiplier").eq("week_commencing", week).eq("household_id", householdId).not("recipe_id", "is", null)
    if (!planEntries || planEntries.length === 0) {
      setItems([])
      setLoading(false)
      return
    }
    const recipeIds = [...new Set(planEntries.map(e => e.recipe_id))]
    const multipliers = {}
    for (const e of planEntries) {
      multipliers[e.recipe_id] = (multipliers[e.recipe_id] || 0) + (e.servings_multiplier || 1)
    }
    const { data: riData } = await supabase.from("recipe_ingredients").select("quantity, unit, ingredient_id, recipe_id, ingredients(name, category, always_stocked)").in("recipe_id", recipeIds)
    const aggregated = {}
    for (const ri of riData || []) {
      const ing = ri.ingredients
      if (!ing) continue
      const key = ing.name + "__" + ri.unit
      const multiplier = multipliers[ri.recipe_id] || 1
      const qty = (ri.quantity || 0) * multiplier
      if (aggregated[key]) {
        aggregated[key].quantity += qty
      } else {
        aggregated[key] = { name: ing.name, category: ing.category || "Other", unit: ri.unit, quantity: qty, always_stocked: ing.always_stocked }
      }
    }
    const sorted = Object.values(aggregated).sort((a, b) => {
      const catA = CATEGORY_ORDER.indexOf(a.category)
      const catB = CATEGORY_ORDER.indexOf(b.category)
      if (catA !== catB) return catA - catB
      return a.name.localeCompare(b.name)
    })
    setItems(sorted)
    setChecked({})
    setLoading(false)
  }

  function formatWeek(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
  }

  function prevWeek() {
    const d = new Date(week)
    d.setDate(d.getDate() - 7)
    setWeek(d.toISOString().split("T")[0])
  }

  function nextWeek() {
    const d = new Date(week)
    d.setDate(d.getDate() + 7)
    setWeek(d.toISOString().split("T")[0])
  }

  function formatQty(qty) {
    if (!qty) return ""
    return qty === Math.floor(qty) ? String(Math.floor(qty)) : qty.toFixed(1)
  }

  function toggleChecked(key) {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {})

  const totalItems = items.length
  const checkedCount = Object.values(checked).filter(Boolean).length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Shopping List</h2>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="text-gray-400 hover:text-gray-600 px-2">←</button>
          <span className="text-sm text-gray-600">w/c {formatWeek(week)}</span>
          <button onClick={nextWeek} className="text-gray-400 hover:text-gray-600 px-2">→</button>
        </div>
      </div>
      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm px-4 py-6 text-center">
          <p className="text-gray-400 text-sm">No meals planned for this week.</p>
          <p className="text-gray-300 text-xs mt-1">Add recipes to your Meal Plan first.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs text-gray-400">{checkedCount} of {totalItems} items collected</p>
            <button onClick={() => setChecked({})} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>
          </div>
          <div className="space-y-4">
            {Object.entries(grouped).map(([category, catItems]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{category}</h3>
                <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                  {catItems.map(item => {
                    const key = item.name + "__" + item.unit
                    const isChecked = checked[key]
                    return (
                      <div key={key} onClick={() => toggleChecked(key)} className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isChecked ? "bg-gray-50" : ""}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isChecked ? "bg-green-600 border-green-600" : "border-gray-300"}`}>
                            {isChecked && <span className="text-white text-xs">✓</span>}
                          </div>
                          <span className={`text-sm ${isChecked ? "line-through text-gray-300" : "text-gray-700"}`}>
                            {item.name}
                            {item.always_stocked && <span className="ml-1 text-xs text-gray-300">(check pantry)</span>}
                          </span>
                        </div>
                        <span className={`text-sm font-medium ${isChecked ? "text-gray-300" : "text-gray-500"}`}>{formatQty(item.quantity)} {item.unit}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
