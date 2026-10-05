import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';

export default function App() {
  const [session, setSession] = useState(null);

  useEffect(() => {
    // Récupère la session au premier chargement
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Écoute les changements (connexion, déconnexion)
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  return (
    <>
      {!session ? <Auth /> : <Dashboard session={session} />}
    </>
  );
}