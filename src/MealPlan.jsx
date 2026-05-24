import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
const SLOTS = ["Lunch","Dinner"]

function getMonday() {
  const d = new Date()
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split("T")[0]
}

export default function MealPlan({ userId }) {
  const [recipes, setRecipes] = useState([])
  const [plan, setPlan] = useState({})
  const [loading, setLoading] = useState(true)
  const [week, setWeek] = useState(getMonday())

  useEffect(() => { fetchAll() }, [week])

  async function fetchAll() {
    setLoading(true)
    const [{ data: r }, { data: p }] = await Promise.all([
      supabase.from("recipes").select("id, name").order("name"),
      supabase.from("meal_plan").select("*").eq("week_commencing", week).eq("user_id", userId)
    ])
    setRecipes(r || [])
    const mapped = {}
    for (const entry of p || []) {
      mapped[entry.day + "_" + entry.meal_slot] = entry
    }
    setPlan(mapped)
    setLoading(false)
  }

  async function setMeal(day, slot, recipeId) {
    const key = day + "_" + slot
    const existing = plan[key]
    if (recipeId === "") {
      if (existing) {
        await supabase.from("meal_plan").delete().eq("id", existing.id)
        const updated = { ...plan }
        delete updated[key]
        setPlan(updated)
      }
      return
    }
    if (existing) {
      await supabase.from("meal_plan").update({ recipe_id: recipeId }).eq("id", existing.id)
    } else {
      await supabase.from("meal_plan").insert({
        user_id: userId,
        week_commencing: week,
        day,
        meal_slot: slot,
        recipe_id: recipeId,
        servings_multiplier: 1.0
      })
    }
    await fetchAll()
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

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">Meal Plan</h2>
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="text-gray-400 hover:text-gray-600 px-2">←</button>
          <span className="text-sm text-gray-600">w/c {formatWeek(week)}</span>
          <button onClick={nextWeek} className="text-gray-400 hover:text-gray-600 px-2">→</button>
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <div className="space-y-2">
          {DAYS.map(day => (
            <div key={day} className="bg-white rounded-xl shadow-sm px-4 py-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">{day}</p>
              <div className="space-y-2">
                {SLOTS.map(slot => {
                  const key = day + "_" + slot
                  const entry = plan[key]
                  return (
                    <div key={slot} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-12">{slot}</span>
                      <select
                        value={entry?.recipe_id || ""}
                        onChange={e => setMeal(day, slot, e.target.value)}
                        className="flex-1 border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 text-gray-700"
                      >
                        <option value="">— no meal planned —</option>
                        {recipes.map(r => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
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