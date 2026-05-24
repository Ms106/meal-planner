import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

const CATEGORY_ORDER = [
  "Produce", "Meat & Seafood", "Dairy & Eggs", "Deli & Charcuterie",
  "Bakery", "Pantry — Dry", "Pantry — Condiments", "Frozen", "Drinks", "Other"
]

const VIEWS = ["Recipes", "General", "Combined"]

function getMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split("T")[0]
}

export default function ShoppingList({ householdId }) {
  const [view, setView] = useState("Recipes")
  const [week, setWeek] = useState(getMonday())

  // Recipe list state
  const [recipeItems, setRecipeItems] = useState([])
  const [recipeChecked, setRecipeChecked] = useState({})
  const [recipeLoading, setRecipeLoading] = useState(true)

  // General list state (used by General and Combined views)
  const [generalItems, setGeneralItems] = useState([])
  const [generalLoading, setGeneralLoading] = useState(true)

  // Separate checked state for recipe items in the Combined view
  const [combinedRecipeChecked, setCombinedRecipeChecked] = useState({})

  useEffect(() => { fetchRecipeList() }, [week])

  useEffect(() => {
    fetchGeneralItems()
    const subscription = supabase
      .channel("shopping_list_general")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "general_list_items" },
        ({ new: row }) => setGeneralItems(prev => [...prev, row])
      )
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "general_list_items" },
        ({ new: row }) => setGeneralItems(prev => prev.map(i => i.id === row.id ? row : i))
      )
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "general_list_items" },
        ({ old: row }) => setGeneralItems(prev => prev.filter(i => i.id !== row.id))
      )
      .subscribe()
    return () => supabase.removeChannel(subscription)
  }, [])

  async function fetchRecipeList() {
    setRecipeLoading(true)
    const { data: planEntries } = await supabase
      .from("meal_plan")
      .select("recipe_id, servings_multiplier, recipes(name)")
      .eq("week_commencing", week)
      .eq("household_id", householdId)
      .not("recipe_id", "is", null)

    if (!planEntries || planEntries.length === 0) {
      setRecipeItems([])
      setRecipeLoading(false)
      return
    }

    const recipeIds = [...new Set(planEntries.map(e => e.recipe_id))]
    const multipliers = {}
    const recipeNames = {}
    for (const e of planEntries) {
      multipliers[e.recipe_id] = (multipliers[e.recipe_id] || 0) + (e.servings_multiplier || 1)
      recipeNames[e.recipe_id] = e.recipes?.name || ""
    }

    const { data: riData } = await supabase
      .from("recipe_ingredients")
      .select("quantity, unit, ingredient_id, recipe_id, ingredients(name, category, always_stocked)")
      .in("recipe_id", recipeIds)

    const aggregated = {}
    for (const ri of riData || []) {
      const ing = ri.ingredients
      if (!ing) continue
      const key = ing.name + "__" + ri.unit
      const multiplier = multipliers[ri.recipe_id] || 1
      const qty = (ri.quantity || 0) * multiplier
      const recipeName = recipeNames[ri.recipe_id]
      if (aggregated[key]) {
        aggregated[key].quantity += qty
        if (recipeName && !aggregated[key].recipes.includes(recipeName)) {
          aggregated[key].recipes.push(recipeName)
        }
      } else {
        aggregated[key] = {
          name: ing.name,
          category: ing.category || "Other",
          unit: ri.unit,
          quantity: qty,
          always_stocked: ing.always_stocked,
          recipes: recipeName ? [recipeName] : [],
        }
      }
    }

    const sorted = Object.values(aggregated).sort((a, b) => {
      const catA = CATEGORY_ORDER.indexOf(a.category)
      const catB = CATEGORY_ORDER.indexOf(b.category)
      if (catA !== catB) return (catA === -1 ? 99 : catA) - (catB === -1 ? 99 : catB)
      return a.name.localeCompare(b.name)
    })
    setRecipeItems(sorted)
    setRecipeChecked({})
    setRecipeLoading(false)
  }

  async function fetchGeneralItems() {
    const { data } = await supabase
      .from("general_list_items")
      .select("*")
      .eq("household_id", householdId)
      .order("created_at")
    setGeneralItems(data || [])
    setGeneralLoading(false)
  }

  function toggleGeneralItem(id, currentChecked) {
    setGeneralItems(prev => prev.map(i => i.id === id ? { ...i, checked: !currentChecked } : i))
    supabase.from("general_list_items").update({ checked: !currentChecked }).eq("id", id)
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

  function formatWeek(dateStr) {
    const d = new Date(dateStr)
    return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })
  }

  function formatQty(qty) {
    if (!qty) return ""
    return qty === Math.floor(qty) ? String(Math.floor(qty)) : qty.toFixed(1)
  }

  const recipeGrouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const catItems = recipeItems.filter(i => i.category === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {})

  const generalGrouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const catItems = generalItems.filter(i => i.category === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {})

  // Combine by category — recipe items flagged with source, general items flagged separately
  const combinedGrouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const rItems = (recipeGrouped[cat] || []).map(i => ({
      ...i,
      _source: "recipe",
      _key: "r__" + i.name + "__" + i.unit,
    }))
    const gItems = (generalGrouped[cat] || []).map(i => ({
      ...i,
      _source: "general",
      _key: "g__" + i.id,
    }))
    const all = [...rItems, ...gItems]
    if (all.length > 0) acc[cat] = all
    return acc
  }, {})

  const recipeCheckedCount = Object.values(recipeChecked).filter(Boolean).length
  const generalCheckedCount = generalItems.filter(i => i.checked).length

  function WeekNav({ className = "" }) {
    return (
      <div className={`flex items-center gap-1 ${className}`}>
        <button onClick={prevWeek} className="text-gray-400 hover:text-gray-600 px-2 py-1">←</button>
        <span className="text-sm text-gray-600">w/c {formatWeek(week)}</span>
        <button onClick={nextWeek} className="text-gray-400 hover:text-gray-600 px-2 py-1">→</button>
      </div>
    )
  }

  function CheckCircle({ checked }) {
    return (
      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${checked ? "bg-green-600 border-green-600" : "border-gray-300"}`}>
        {checked && <span className="text-white text-xs">✓</span>}
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Shopping List</h2>
      </div>

      <div className="bg-gray-100 rounded-lg p-1 flex mb-4">
        {VIEWS.map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              view === v ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* ── Recipes view ─────────────────────────────────── */}
      {view === "Recipes" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <WeekNav />
          </div>
          {recipeLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : recipeItems.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm px-4 py-6 text-center">
              <p className="text-gray-400 text-sm">No meals planned for this week.</p>
              <p className="text-gray-300 text-xs mt-1">Add recipes to your Meal Plan first.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">{recipeCheckedCount} of {recipeItems.length} items collected</p>
                <button onClick={() => setRecipeChecked({})} className="text-xs text-gray-400 hover:text-gray-600">Clear all</button>
              </div>
              <div className="space-y-4">
                {Object.entries(recipeGrouped).map(([category, catItems]) => (
                  <div key={category}>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{category}</h3>
                    <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                      {catItems.map(item => {
                        const key = item.name + "__" + item.unit
                        const isChecked = !!recipeChecked[key]
                        return (
                          <div
                            key={key}
                            onClick={() => setRecipeChecked(prev => ({ ...prev, [key]: !prev[key] }))}
                            className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isChecked ? "bg-gray-50" : ""}`}
                          >
                            <div className="flex items-center gap-3">
                              <CheckCircle checked={isChecked} />
                              <span className={`text-sm ${isChecked ? "line-through text-gray-300" : "text-gray-700"}`}>
                                {item.name}
                                {item.always_stocked && <span className="ml-1 text-xs text-gray-300">(check pantry)</span>}
                              </span>
                            </div>
                            <span className={`text-sm font-medium tabular-nums ${isChecked ? "text-gray-300" : "text-gray-500"}`}>
                              {formatQty(item.quantity)} {item.unit}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── General view ─────────────────────────────────── */}
      {view === "General" && (
        <>
          {generalLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : generalItems.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm px-4 py-6 text-center">
              <p className="text-gray-400 text-sm">Your general list is empty.</p>
              <p className="text-gray-300 text-xs mt-1">Add items in the General List tab.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-gray-400">{generalCheckedCount} of {generalItems.length} items collected</p>
              </div>
              <div className="space-y-4">
                {Object.entries(generalGrouped).map(([category, catItems]) => (
                  <div key={category}>
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{category}</h3>
                    <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                      {catItems.map(item => (
                        <div
                          key={item.id}
                          onClick={() => toggleGeneralItem(item.id, item.checked)}
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${item.checked ? "bg-gray-50" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <CheckCircle checked={item.checked} />
                            <span className={`text-sm ${item.checked ? "line-through text-gray-300" : "text-gray-700"}`}>
                              {item.name}
                            </span>
                          </div>
                          <span className={`text-sm font-medium tabular-nums ${item.checked ? "text-gray-300" : "text-gray-500"}`}>
                            {formatQty(item.quantity)}{item.quantity && item.unit !== "other" ? ` ${item.unit}` : ""}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Combined view ────────────────────────────────── */}
      {view === "Combined" && (
        <>
          <div className="flex items-center justify-between mb-3">
            <WeekNav />
          </div>
          {recipeLoading || generalLoading ? (
            <p className="text-gray-400 text-sm">Loading...</p>
          ) : Object.keys(combinedGrouped).length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm px-4 py-6 text-center">
              <p className="text-gray-400 text-sm">Nothing on your shopping list.</p>
              <p className="text-gray-300 text-xs mt-1">Add recipes to your Meal Plan or items to your General List.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(combinedGrouped).map(([category, catItems]) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">{category}</h3>
                  <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
                    {catItems.map(item => {
                      const isChecked = item._source === "general"
                        ? item.checked
                        : !!combinedRecipeChecked[item._key]
                      return (
                        <div
                          key={item._key}
                          onClick={() => {
                            if (item._source === "general") {
                              toggleGeneralItem(item.id, item.checked)
                            } else {
                              setCombinedRecipeChecked(prev => ({ ...prev, [item._key]: !prev[item._key] }))
                            }
                          }}
                          className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${isChecked ? "bg-gray-50" : ""}`}
                        >
                          <div className="flex items-center gap-3">
                            <CheckCircle checked={isChecked} />
                            <div>
                              <span className={`text-sm ${isChecked ? "line-through text-gray-300" : "text-gray-700"}`}>
                                {item.name}
                                {item.always_stocked && <span className="ml-1 text-xs text-gray-300">(check pantry)</span>}
                              </span>
                              {item._source === "recipe" && item.recipes?.length > 0 && (
                                <p className={`text-xs ${isChecked ? "text-gray-300" : "text-gray-400"}`}>
                                  {item.recipes.join(", ")}
                                </p>
                              )}
                            </div>
                          </div>
                          <span className={`text-sm font-medium tabular-nums ${isChecked ? "text-gray-300" : "text-gray-500"}`}>
                            {item._source === "recipe"
                              ? `${formatQty(item.quantity)} ${item.unit}`
                              : `${formatQty(item.quantity)}${item.quantity && item.unit !== "other" ? ` ${item.unit}` : ""}`
                            }
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
