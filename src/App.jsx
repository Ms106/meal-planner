import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import Auth from "./Auth"
import Ingredients from "./Ingredients"
import Recipes from "./Recipes"
import MealPlan from "./MealPlan"
import GeneralList from "./GeneralList"
import ShoppingList from "./ShoppingList"

const NAV_ITEMS = ["Ingredients", "Recipes", "Meal Plan", "General List", "Shopping List"]

async function getOrCreateHousehold(userId) {
  // Check if user already belongs to a household
  const { data: membership } = await supabase
    .from("household_members")
    .select("household_id")
    .eq("user_id", userId)
    .single()

  if (membership) return membership.household_id

  // Create a new household and add the user to it
  const { data: household } = await supabase
    .from("households")
    .insert({ name: "My Household" })
    .select()
    .single()

  await supabase
    .from("household_members")
    .insert({ household_id: household.id, user_id: userId })

  return household.id
}

function App() {
  const [session, setSession] = useState(null)
  const [householdId, setHouseholdId] = useState(null)
  const [currentPage, setCurrentPage] = useState("Recipes")

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) {
        getOrCreateHousehold(session.user.id).then(setHouseholdId)
      }
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session) {
        getOrCreateHousehold(session.user.id).then(setHouseholdId)
      } else {
        setHouseholdId(null)
      }
    })
  }, [])

  if (!session) return <Auth />
  if (!householdId) return (
    <div className="min-h-screen bg-green-50 flex items-center justify-center">
      <p className="text-gray-400 text-sm">Setting up your household...</p>
    </div>
  )

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
        {currentPage === "Ingredients" && <Ingredients householdId={householdId} />}
        {currentPage === "Recipes" && <Recipes householdId={householdId} />}
        {currentPage === "Meal Plan" && <MealPlan householdId={householdId} />}
        {currentPage === "General List" && <GeneralList householdId={householdId} userId={session.user.id} />}
        {currentPage === "Shopping List" && <ShoppingList householdId={householdId} />}
      </main>
    </div>
  )
}

export default App