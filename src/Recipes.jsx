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

export default function Recipes({ householdId }) {
  const [recipes, setRecipes] = useState([])
  const [ingredients, setIngredients] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [pasteText, setPasteText] = useState("")
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState("")
  const [showPaste, setShowPaste] = useState(false)

  const emptyForm = { name: "", serves: 4, protein: "Chicken", cuisine: "Italian", meal_type: "Dinner", source_url: "", notes: "" }
  const [form, setForm] = useState(emptyForm)
  const [recipeIngredients, setRecipeIngredients] = useState([{ ingredient_id: "", quantity: "", unit: "whole", preparation: "" }])

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
        const existing = ingredients.find(i => i.name.toLowerCase() === item.name.toLowerCase())
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
          console.error("Insert error:", insertError)
          setParseError("Failed to create ingredients: " + insertError.message)
          setParsing(false)
          return
        }

        const { data: freshIngredients } = await supabase
          .from("ingredients")
          .select("*")
          .eq("household_id", householdId)
          .order("name")

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
          .from("ingredients")
          .select("*")
          .eq("household_id", householdId)
          .order("name")
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
    const { data: recipe } = await supabase.from("recipes").insert({ ...form, household_id: householdId }).select().single()
    const valid = recipeIngredients.filter(ri => ri.ingredient_id)
    if (valid.length > 0) {
      await supabase.from("recipe_ingredients").insert(
        valid.map(ri => ({ recipe_id: recipe.id, ingredient_id: ri.ingredient_id, quantity: ri.quantity ? parseFloat(ri.quantity) : null, unit: ri.unit, preparation: ri.preparation }))
      )
    }
    setForm(emptyForm)
    setRecipeIngredients([{ ingredient_id: "", quantity: "", unit: "whole", preparation: "" }])
    setShowForm(false)
    setShowPaste(false)
    setPasteText("")
    await fetchAll()
    setSaving(false)
  }

  async function deleteRecipe(id) {
    await supabase.from("recipes").delete().eq("id", id)
    await fetchAll()
  }

  function addRow() { setRecipeIngredients([...recipeIngredients, { ingredient_id: "", quantity: "", unit: "whole", preparation: "" }]) }

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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Recipes</h2>
        <button onClick={() => setShowForm(!showForm)} className="bg-green-700 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-green-800">+ Add</button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl shadow-sm p-4 mb-4 space-y-3">
          <p className="font-medium text-gray-700 text-sm">Recipe details</p>
          <input type="text" placeholder="Recipe name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Serves</label>
              <input type="number" value={form.serves} onChange={e => setForm({ ...form, serves: parseInt(e.target.value) })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Meal type</label>
              <select value={form.meal_type} onChange={e => setForm({ ...form, meal_type: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {MEAL_TYPES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Protein</label>
              <select value={form.protein} onChange={e => setForm({ ...form, protein: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {PROTEINS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Cuisine</label>
              <select value={form.cuisine} onChange={e => setForm({ ...form, cuisine: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
                {CUISINES.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <input type="url" placeholder="Source URL (optional)" value={form.source_url} onChange={e => setForm({ ...form, source_url: e.target.value })} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />
          <textarea placeholder="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500" />

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
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  rows={6}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
                />
                {parseError && <p className="text-xs text-red-500">{parseError}</p>}
                <button
                  onClick={parseIngredients}
                  disabled={parsing || !pasteText.trim()}
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
              <button onClick={saveRecipe} disabled={saving} className="flex-1 bg-green-700 text-white rounded-lg py-2 text-sm font-medium hover:bg-green-800 disabled:opacity-50">{saving ? "Saving..." : "Save recipe"}</button>
              <button onClick={() => { setShowForm(false); setShowPaste(false); setPasteText("") }} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          )}

          {showPaste && pasteText === "" && (
            <div className="flex gap-2 pt-2">
              <button onClick={() => { setShowForm(false); setShowPaste(false) }} className="flex-1 border border-gray-300 rounded-lg py-2 text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : recipes.length === 0 ? (
        <p className="text-gray-400 text-sm">No recipes yet — add your first one.</p>
      ) : (
        <div className="space-y-2">
          {recipes.map(recipe => (
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
                    <a href={recipe.source_url} target="_blank" rel="noreferrer" className="text-xs text-green-700 hover:underline">View original recipe</a>
                  )}
                  <button onClick={() => deleteRecipe(recipe.id)} className="text-xs text-red-400 hover:text-red-600">Delete recipe</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
