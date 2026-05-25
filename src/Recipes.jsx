import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

const PROTEINS = ["Beef","Chicken","Pork","Lamb","Seafood","Vegetarian","Vegan","Egg","Other"]
const CUISINES = ["Australian","Italian","Asian","Japanese","Chinese","Thai","Indian","Mexican","Middle Eastern","French","Greek","American","Other"]
const MEAL_TYPES = ["Breakfast","Lunch","Dinner","Snack"]
const UNITS = ["g","kg","ml","l","tsp","tbsp","whole","rasher","slice","sheet","sprig","bunch","head","clove","fillet","steak","can","jar","packet","sachet","pinch","other"]

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

const emptyForm = { name: "", serves: 4, protein: "Chicken", cuisine: "Italian", meal_type: "Dinner", source_url: "", notes: "" }
const emptyRow = { ingredient_id: "", quantity: "", unit: "whole", preparation: "" }

export default function Recipes({ householdId }) {
  const [recipes, setRecipes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState("")
  const [showPaste, setShowPaste] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [recipeIngredients, setRecipeIngredients] = useState([emptyRow])

  // Search / filter state
  const [search, setSearch] = useState("")
  const [filterProtein, setFilterProtein] = useState("")
  const [filterCuisine, setFilterCuisine] = useState("")
  const [filterMealType, setFilterMealType] = useState("")

  useEffect(() => { fetchAll() }, [])

  async function fetchAll() {
    setLoading(true)
    const [{ data: r }, { data: i }] = await Promise.all([
      supabase.from("recipes").select("*, recipe_ingredients(*, ingredients(*))").eq("household_id", householdId).order("name"),
      supabase.from("ingredients").select("*").eq("household_id", householdId).order("name")
    ])
    setRecipes(r || [])
    setIngredients(i || [])
    setLoading(false)
  }

  function openEdit(recipe) {
    setForm({
      name: recipe.name,
      serves: recipe.serves,
      protein: recipe.protein || "Chicken",
      cuisine: recipe.cuisine || "Italian",
      meal_type: recipe.meal_type || "Dinner",
      source_url: recipe.source_url || "",
      notes: recipe.notes || "",
    })
    setRecipeIngredients(
      recipe.recipe_ingredients?.length > 0
        ? recipe.recipe_ingredients.map(ri => ({
            ingredient_id: ri.ingredient_id,
            quantity: ri.quantity != null ? String(ri.quantity) : "",
            unit: ri.unit || "whole",
            preparation: ri.preparation || "",
          }))
        : [emptyRow]
    )
    setEditingId(recipe.id)
    setExpandedId(null)
    setShowForm(true)
    setShowPaste(false)
    setPasteText("")
    setParseError("")
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setRecipeIngredients([emptyRow])
    setShowPaste(false)
    setPasteText("")
    setParseError("")
  }

  function clearFilters() {
    setSearch("")
    setFilterProtein("")
    setFilterCuisine("")
    setFilterMealType("")
  }

  async function parseIngredients() {
    if (!pasteText.trim()) return
    setParsing(true)
    setParseError("")
    try {
      const res = await fetch("/api/parse-ingredients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: pasteText, recipeName: form.name })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Parse failed")

      const parsed = data.ingredients
      const newRows = []
      const newIngredients = []

      for (const item of parsed) {
        const itemWords = item.name.toLowerCase().split(" ")
        const existing = ingredients.find(i => {
          const ingWords = i.name.toLowerCase().split(" ")
          if (i.name.toLowerCase() === item.name.toLowerCase()) return true
          if (itemWords.every(w => ingWords.includes(w))) return true
          if (ingWords.every(w => itemWords.includes(w))) return true
          return false
        })
        if (existing) {
          newRows.push({ ingredient_id: existing.id, quantity: item.quantity || "", unit: item.unit || "whole", preparation: item.preparation || "" })
        } else {
          newIngredients.push(item)
          newRows.push({ ingredient_id: "", quantity: item.quantity || "", unit: item.unit || "whole", preparation: item.preparation || "", _newName: item.name })
        }
      }

      if (newIngredients.length > 0) {
        const { data: inserted, error: insertError } = await supabase
          .from("ingredients")
          .insert(newIngredients.map(i => ({
            name: i.name,
            category: mapCategory(i.category),
            default_unit: i.unit || "whole",
            always_stocked: false,
            household_id: householdId
          })))
          .select()

        if (insertError) {
          setParseError("Failed to create ingredients: " + insertError.message)
          setParsing(false)
          return
        }

        const { data: freshIngredients } = await supabase
          .from("ingredients").select("*").eq("household_id", householdId).order("name")
        const allIngredients = freshIngredients || [...ingredients, ...(inserted || [])]
        setIngredients(allIngredients)

        for (const row of newRows) {
          if (row._newName) {
            const match = allIngredients.find(i => i.name.toLowerCase() === row._newName.toLowerCase())
            if (match) row.ingredient_id = match.id
            delete row._newName
          }
        }
      } else {
        const { data: freshIngredients } = await supabase
          .from("ingredients").select("*").eq("household_id", householdId).order("name")
        if (freshIngredients) setIngredients(freshIngredients)
      }

      setRecipeIngredients(newRows)
      setPasteText("")
      setShowPaste(false)
    } catch (err) {
      setParseError(err.message)
    }
    setParsing(false)
  }

  async function saveRecipe() {
    if (!form.name.trim()) return
    setSaving(true)
    const valid = recipeIngredients.filter(ri => ri.ingredient_id)

    if (editingId) {
      const { name, serves, protein, cuisine, meal_type, source_url, notes } = form
      await supabase.from("recipes").update({ name, serves, protein, cuisine, meal_type, source_url, notes }).eq("id", editingId)
      await supabase.from("recipe_ingredients").delete().eq("recipe_id", editingId)
      if (valid.length > 0) {
        await supabase.from("recipe_ingredients").insert(
          valid.map(ri => ({ recipe_id: editingId, ingredient_id: ri.ingredient_id, quantity: ri.quantity ? parseFloat(ri.quantity) : null, unit: ri.unit, preparation: ri.preparation }))
        )
      }
    } else {
      const { data: recipe } = await supabase.from("recipes").insert({ ...form, household_id: householdId }).select().single()
      if (valid.length > 0) {
        await supabase.from("recipe_ingredients").insert(
          valid.map(ri => ({ recipe_id: recipe.id, ingredient_id: ri.ingredient_id, quantity: ri.quantity ? parseFloat(ri.quantity) : null, unit: ri.unit, preparation: ri.preparation }))
        )
      }
    }

    cancelForm()
    await fetchAll()
    setSaving(false)
  }

  async function deleteRecipe(id) {
    await supabase.from("recipes").delete().eq("id", id)
    await fetchAll()
  }

  function addRow() { setRecipeIngredients([...recipeIngredients, emptyRow]) }

  function updateRow(index, field, value) {
    const updated = [...recipeIngredients]
    updated[index][field] = value
    if (field === "ingredient_id") {
      const ing = ingredients.find(i => i.id === value)
      if (ing) updated[index].unit = ing.default_unit
    }
    setRecipeIngredients(updated)
  }

  function removeRow(index) { setRecipeIngredients(recipeIngredients.filter((_, i) => i !== index)) }

  const filteredRecipes = recipes.filter(r => {
    if (search && !r.name.toLowerCase().includes(search.toLowerCase())) return false
    if (filterProtein && r.protein !== filterProtein) return false
    if (filterCuisine && r.cuisine !== filterCuisine) return false
    if (filterMealType && r.meal_type !== filterMealType) return false
    return true
  })
  const hasFilters = !!(search || filterProtein || filterCuisine || filterMealType)

  const selectClass = "w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Recipes</h2>
        <button
          onClick={() => { if (showForm) { cancelForm() } else { setShowForm(true) } }}
          className="bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-800"
        >
          + Add
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-3">
          <p className="font-medium text-gray-700 text-sm">{editingId ? "Edit recipe" : "Recipe details"}</p>
          <input
            type="text" placeholder="Recipe name" value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Serves</label>
              <input type="number" value={form.serves} onChange={e => setForm({ ...form, serves: parseInt(e.target.value) })} className={selectClass} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Meal type</label>
              <select value={form.meal_type} onChange={e => setForm({ ...form, meal_type: e.target.value })} className={selectClass}>
                {MEAL_TYPES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Protein</label>
              <select value={form.protein} onChange={e => setForm({ ...form, protein: e.target.value })} className={selectClass}>
                {PROTEINS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Cuisine</label>
              <select value={form.cuisine} onChange={e => setForm({ ...form, cuisine: e.target.value })} className={selectClass}>
                {CUISINES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <input
            type="url" placeholder="Source URL (optional)" value={form.source_url}
            onChange={e => setForm({ ...form, source_url: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <textarea
            placeholder="Notes (optional)" value={form.notes}
            onChange={e => setForm({ ...form, notes: e.target.value })}
            rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />

          <div className="border-t border-gray-100 pt-3">
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-gray-700 text-sm">Ingredients</p>
              <button onClick={() => setShowPaste(!showPaste)} className="text-xs text-green-700 hover:underline">
                {showPaste ? "Add manually instead" : "Paste from recipe"}
              </button>
            </div>

            {showPaste ? (
              <div className="space-y-2">
                <p className="text-xs text-gray-400">Copy the ingredient list from any recipe website and paste it below. AI will parse it automatically.</p>
                <textarea
                  placeholder={"1 cup flour\n2 eggs\n200g butter\n..."}
                  value={pasteText} onChange={e => setPasteText(e.target.value)}
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                />
                {parseError && <p className="text-xs text-red-500">{parseError}</p>}
                <button
                  onClick={parseIngredients} disabled={parsing || !pasteText.trim()}
                  className="w-full bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50"
                >
                  {parsing ? "Parsing..." : "Parse ingredients"}
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-gray-400 -mt-1">Add ingredients to your master list first if they do not appear here.</p>
                {recipeIngredients.map((ri, index) => (
                  <div key={index} className="grid grid-cols-12 gap-1 items-center">
                    <div className="col-span-5">
                      <select value={ri.ingredient_id} onChange={e => updateRow(index, "ingredient_id", e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                        <option value="">Select...</option>
                        {ingredients.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input type="number" placeholder="Qty" value={ri.quantity} onChange={e => updateRow(index, "quantity", e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div className="col-span-2">
                      <select value={ri.unit} onChange={e => updateRow(index, "unit", e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                        {UNITS.map(u => <option key={u}>{u}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <input type="text" placeholder="Prep" value={ri.preparation} onChange={e => updateRow(index, "preparation", e.target.value)} className="w-full border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button onClick={() => removeRow(index)} className="text-gray-300 hover:text-red-400 text-lg">x</button>
                    </div>
                  </div>
                ))}
                <button onClick={addRow} className="text-green-700 text-sm hover:underline">+ Add ingredient row</button>
              </div>
            )}
          </div>

          {!showPaste && (
            <div className="flex gap-2 pt-2">
              <button onClick={saveRecipe} disabled={saving || !form.name.trim()} className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50">
                {saving ? "Saving..." : editingId ? "Update recipe" : "Save recipe"}
              </button>
              <button onClick={cancelForm} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          )}

          {showPaste && pasteText === "" && (
            <div className="flex gap-2 pt-2">
              <button onClick={cancelForm} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : recipes.length === 0 ? (
        <p className="text-gray-400 text-sm">No recipes yet — add your first one.</p>
      ) : (
        <>
          {/* Search and filter */}
          <div className="mb-4 space-y-2">
            <input
              type="text"
              placeholder="Search recipes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={filterProtein}
                onChange={e => setFilterProtein(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-gray-600"
              >
                <option value="">Protein</option>
                {PROTEINS.map(p => <option key={p}>{p}</option>)}
              </select>
              <select
                value={filterCuisine}
                onChange={e => setFilterCuisine(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-gray-600"
              >
                <option value="">Cuisine</option>
                {CUISINES.map(c => <option key={c}>{c}</option>)}
              </select>
              <select
                value={filterMealType}
                onChange={e => setFilterMealType(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white text-gray-600"
              >
                <option value="">Meal</option>
                {MEAL_TYPES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">
                {hasFilters ? `${filteredRecipes.length} of ${recipes.length} recipes` : `${recipes.length} recipe${recipes.length !== 1 ? "s" : ""}`}
              </p>
              {hasFilters && (
                <button onClick={clearFilters} className="text-xs text-gray-400 hover:text-gray-600">
                  Clear filters
                </button>
              )}
            </div>
          </div>

          {/* Recipe list */}
          {filteredRecipes.length === 0 ? (
            <div className="bg-white rounded-xl shadow-sm px-4 py-6 text-center">
              <p className="text-gray-400 text-sm">No recipes match your filters.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRecipes.map(recipe => (
                <div key={recipe.id} className="bg-white rounded-xl shadow-sm">
                  <div className="flex items-center justify-between px-4 py-3 cursor-pointer" onClick={() => setExpandedId(expandedId === recipe.id ? null : recipe.id)}>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{recipe.name}</p>
                      <p className="text-xs text-gray-400">{recipe.protein} · {recipe.cuisine} · serves {recipe.serves}</p>
                    </div>
                    <span className="text-gray-300 text-sm">{expandedId === recipe.id ? "▲" : "▼"}</span>
                  </div>
                  {expandedId === recipe.id && (
                    <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-2">
                      {recipe.recipe_ingredients?.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Ingredients</p>
                          <div className="space-y-1">
                            {recipe.recipe_ingredients.map(ri => (
                              <div key={ri.id} className="flex items-center gap-2 text-sm text-gray-600">
                                <span className="font-medium">{ri.quantity} {ri.unit}</span>
                                <span>{ri.ingredients?.name}</span>
                                {ri.preparation && <span className="text-gray-400">— {ri.preparation}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {recipe.notes && <p className="text-xs text-gray-400 italic">{recipe.notes}</p>}
                      {recipe.source_url && (
                        <a href={recipe.source_url} target="_blank" rel="noreferrer" className="text-xs text-green-700 hover:underline block">View original recipe</a>
                      )}
                      <div className="flex items-center gap-4 pt-1">
                        <button onClick={() => openEdit(recipe)} className="text-xs text-green-700 hover:text-green-900 font-medium">Edit recipe</button>
                        <button onClick={() => deleteRecipe(recipe.id)} className="text-xs text-red-400 hover:text-red-600">Delete recipe</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
