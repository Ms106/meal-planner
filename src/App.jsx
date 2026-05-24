import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import Auth from "./Auth"
import Ingredients from "./Ingredients"
import Recipes from "./Recipes"
import MealPlan from "./MealPlan"
import ShoppingList from "./ShoppingList"

const NAV_ITEMS = ["Ingredients", "Recipes", "Meal Plan", "Shopping List"]

function App() {
  const [session, setSession] = useState(null)
  const [currentPage, setCurrentPage] = useState("Recipes")

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  if (!session) return <Auth />

  return (
    <div className="min-h-screen bg-green-50">
      <header className="bg-green-800 text-white px-4 py-3 flex items-center justify-between">
        <h1 className="font-bold text-lg">🥗 Meal Planner</h1>
        <button
          onClick={() => supabase.auth.signOut()}
          className="text-green-200 text-sm hover:text-white"
        >
          Sign out
        </button>
      </header>

      <nav className="bg-white border-b border-gray-200 px-4 flex gap-1 overflow-x-auto">
        {NAV_ITEMS.map(item => (
          <button
            key={item}
            onClick={() => setCurrentPage(item)}
            className={`px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              currentPage === item
                ? "border-green-700 text-green-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {item}
          </button>
        ))}
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {currentPage === "Ingredients" && <Ingredients userId={session.user.id} />}
        {currentPage === "Recipes" && <p className="text-gray-400 text-sm">Recipes — coming soon</p>}
        {currentPage === "Meal Plan" && <p className="text-gray-400 text-sm">Meal Plan — coming soon</p>}
        {currentPage === "Shopping List" && <p className="text-gray-400 text-sm">Shopping List — coming soon</p>}
{currentPage === "Recipes" && <Recipes userId={session.user.id} />}
{currentPage === "Meal Plan" && <MealPlan userId={session.user.id} />}
{currentPage === "Shopping List" && <ShoppingList userId={session.user.id} />}
      </main>
    </div>
  )
}

export default App