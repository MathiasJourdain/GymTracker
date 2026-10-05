import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Auth() {
  const [authView, setAuthView] = useState('login');
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleMagicLink = async () => {
    const email = prompt("Ton email pour te connecter rapidement :");
    if (email) {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) alert("Erreur : " + error.message);
      else alert('Lien de connexion envoyé ! Vérifie ta boîte mail.');
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    const username = e.target.username.value; 
    const email = e.target.email.value;
    const password = e.target.password.value;
    const confirmPassword = e.target.confirmPassword.value;

    if (password !== confirmPassword) {
      alert("Les mots de passe ne correspondent pas.");
      return;
    }

    const { error } = await supabase.auth.signUp({ 
      email, 
      password,
      options: {
        data: {
          username: username
        }
      }
    });
    
    if (error) {
      alert("Erreur d'inscription : " + error.message);
    } else {
      // C'EST ICI QUE ÇA CHANGE : Plus de demande de vérification d'email
      alert('Inscription réussie ! Bienvenue ' + username + ' 💪');
      setShowPassword(false);
      setShowConfirmPassword(false);
    }
  };

  const handleLoginWithPassword = async (e) => {
    e.preventDefault();
    const email = e.target.email.value;
    const password = e.target.password.value;

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) alert("Erreur de connexion : " + error.message);
  };

  const EyeIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  );

  const EyeSlashIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.522 10.522 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
    </svg>
  );

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-gray-900 rounded-3xl p-10 shadow-2xl border border-gray-800">
        
        <div className="flex items-center justify-center gap-3 mb-10">
          <div className="p-3 bg-gray-800 rounded-2xl border border-gray-700">
            <svg className="w-9 h-9 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <h1 className="text-4xl font-extrabold text-white">
            Gym<span className="text-blue-500">Tracker</span>
          </h1>
        </div>

        <div className="grid grid-cols-2 gap-2 bg-gray-800/50 p-2 rounded-2xl mb-10 border border-gray-700">
          <button 
            onClick={() => { setAuthView('login'); setShowPassword(false); }}
            className={`w-full px-6 py-3 rounded-xl font-bold transition-all text-lg ${authView === 'login' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800/80'}`}
          >
            Connexion
          </button>
          <button 
            onClick={() => { setAuthView('register'); setShowPassword(false); setShowConfirmPassword(false); }}
            className={`w-full px-6 py-3 rounded-xl font-bold transition-all text-lg ${authView === 'register' ? 'bg-blue-600 text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800/80'}`}
          >
            Inscription
          </button>
        </div>

        {authView === 'login' ? (
          <form onSubmit={handleLoginWithPassword} className="space-y-6">
            <input name="email" type="email" required placeholder="Ton email" className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 text-white text-lg placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500 outline-none" />
            
            <div className="relative">
              <input 
                name="password" 
                type={showPassword ? "text" : "password"} 
                required 
                placeholder="Ton mot de passe" 
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 pr-14 text-white text-lg placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500 outline-none" 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white p-5 rounded-2xl font-extrabold text-xl hover:bg-blue-700 transition-all mt-4">
              Se connecter
            </button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-6">
            <input name="username" type="text" required placeholder="Ton pseudo" className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 text-white text-lg placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500 outline-none" />

            <input name="email" type="email" required placeholder="Ton email" className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 text-white text-lg placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500 outline-none" />
            
            <div className="relative">
              <input 
                name="password" 
                type={showPassword ? "text" : "password"} 
                required 
                placeholder="Choisis ton mot de passe" 
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 pr-14 text-white text-lg placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500 outline-none" 
              />
              <button 
                type="button" 
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-white transition-colors"
              >
                {showPassword ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>

            <div className="relative">
              <input 
                name="confirmPassword" 
                type={showConfirmPassword ? "text" : "password"} 
                required 
                placeholder="Confirme ton mot de passe" 
                className="w-full bg-gray-800 border border-gray-700 rounded-2xl px-6 py-4 pr-14 text-white text-lg placeholder:text-gray-500 focus:border-blue-500 focus:ring-blue-500 outline-none" 
              />
              <button 
                type="button" 
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-4 flex items-center text-gray-400 hover:text-white transition-colors"
              >
                {showConfirmPassword ? <EyeSlashIcon /> : <EyeIcon />}
              </button>
            </div>

            <button type="submit" className="w-full bg-blue-600 text-white p-5 rounded-2xl font-extrabold text-xl hover:bg-blue-700 transition-all mt-4">
              Créer mon compte
            </button>
          </form>
        )}

        <div className="mt-12 text-center border-t border-gray-800 pt-10">
          <button onClick={handleMagicLink} className="flex items-center gap-3 w-full bg-gray-800 border border-gray-700 text-gray-300 p-4 rounded-2xl font-semibold hover:bg-gray-700 transition-all text-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L22 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
              Un lien magique par email
          </button>
        </div>

      </div>
    </div>
  );
}