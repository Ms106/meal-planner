import { useEffect, useState } from "react"
import { supabase } from "./supabaseClient"
import Auth from "./Auth"

function App() {
  const [session, setSession] = useState(null)

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
    <div className="min-h-screen bg-green-50 flex items-center justify-center">
      <h1 className="text-2xl font-bold text-green-800">
        Welcome, {session.user.email}
      </h1>
    </div>
  )
}

export default App