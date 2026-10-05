import { useMemo, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const WORKOUT_STORAGE_KEY = 'gym-tracker-workouts';
const SETTINGS_KEY = 'gym-tracker-settings';

const getUserWorkoutStorageKey = (userId) => `${WORKOUT_STORAGE_KEY}-${userId || 'guest'}`;

const defaultSettings = {
  compactMode: false,
  showTips: true,
  accent: 'blue',
};

const emptyExerciseForm = {
  name: '',
  target: '',
  imageData: '',
  videoData: '',
  instructions: '',
  imageFile: null,
  videoFile: null,
};

const getSafeId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `exercise-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

const loadLocalStorage = (key, fallback) => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const formatDate = (value) => {
  if (!value) return 'Aujourd’hui';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date inconnue';
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
};

export default function Dashboard({ session }) {
  const currentUserId = session?.user?.id || 'guest';
  
  const [exercises, setExercises] = useState([]);
  const [workoutHistory, setWorkoutHistory] = useState([]);
  const [selectedExerciseId, setSelectedExerciseId] = useState('');
  const [exerciseForm, setExerciseForm] = useState(emptyExerciseForm);
  const [editingExerciseId, setEditingExerciseId] = useState(null);
  const [showExerciseForm, setShowExerciseForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState(() => loadLocalStorage(SETTINGS_KEY, defaultSettings));
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('');
  const [message, setMessage] = useState('');
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  
  // Nouvel état pour l'agrandissement des médias
  const [enlargedMedia, setEnlargedMedia] = useState({ isOpen: false, type: '', src: '' });

  const displayName = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0] || 'Sportif';

  useEffect(() => {
    fetchSharedExercises();
  }, []);

  const fetchSharedExercises = async () => {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      const formattedExercises = data.map(ex => ({
        id: ex.id,
        name: ex.name,
        target: ex.target,
        imageData: ex.image_data,
        videoData: ex.video_data,
        instructions: ex.instructions || [],
        created_by: ex.created_by // Correction : on récupère bien l'auteur !
      }));
      setExercises(formattedExercises);
    }
  };

  useEffect(() => {
    const savedWorkouts = loadLocalStorage(getUserWorkoutStorageKey(currentUserId), []);
    setWorkoutHistory(Array.isArray(savedWorkouts) ? savedWorkouts : []);
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem(getUserWorkoutStorageKey(currentUserId), JSON.stringify(workoutHistory));
  }, [workoutHistory, currentUserId]);

  useEffect(() => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!selectedExerciseId && exercises.length > 0) {
      setSelectedExerciseId(exercises[0].id);
    }
  }, [exercises, selectedExerciseId]);

  const activeExercise = exercises.find((exercise) => exercise.id === selectedExerciseId) || null;

  const workoutSummary = useMemo(() => {
    const allWeights = workoutHistory.map((entry) => Number(entry.weight || 0));
    const allReps = workoutHistory.map((entry) => Number(entry.reps || 0));
    const bestWeight = allWeights.length ? Math.max(...allWeights) : 0;
    const bestReps = allReps.length ? Math.max(...allReps) : 0;
    const totalSessions = workoutHistory.length;
    const lastSession = workoutHistory[0];

    return { bestWeight, bestReps, totalSessions, lastSession };
  }, [workoutHistory]);

  const activeHistory = useMemo(() => {
    return [...workoutHistory]
      .filter((entry) => entry.machine_id === selectedExerciseId)
      .sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0));
  }, [workoutHistory, selectedExerciseId]);

  const chartData = useMemo(() => {
    if (!activeHistory.length) return { weightPoints: '', repsPoints: '', maxValue: 1 };
    const sorted = [...activeHistory].sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date));
    const maxValue = Math.max(...sorted.map(e => Number(e.weight || 0)), ...sorted.map(e => Number(e.reps || 0)), 1);
    
    const width = 280; const height = 120; const padding = 18;
    const toPoint = (value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(sorted.length - 1, 1);
      const y = height - padding - ((Number(value) / maxValue) * (height - padding * 2));
      return `${x},${y}`;
    };

    return {
      weightPoints: sorted.map((e, i) => toPoint(e.weight, i)).join(' '),
      repsPoints: sorted.map((e, i) => toPoint(e.reps, i)).join(' '),
      maxValue
    };
  }, [activeHistory]);

  const updateSettings = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleFormChange = (field, value) => {
    setExerciseForm((prev) => ({ ...prev, [field]: value }));
  };

  const resetExerciseForm = () => {
    setExerciseForm(emptyExerciseForm);
    setEditingExerciseId(null);
    setShowExerciseForm(false);
  };

  const handleSubmitExercise = async (e) => {
    e.preventDefault();
    const trimmedName = exerciseForm.name.trim();
    if (!trimmedName) {
      setMessage('Donne un nom à l’exercice.');
      return;
    }

    setIsUploading(true);
    setMessage('Enregistrement en cours (les médias peuvent prendre quelques secondes)... ⏳');

    let finalImageUrl = exerciseForm.imageData || '';
    let finalVideoUrl = exerciseForm.videoData || '';

    try {
      if (exerciseForm.imageFile) {
        const fileExt = exerciseForm.imageFile.name.split('.').pop();
        const fileName = `img-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('exercise-media')
          .upload(fileName, exerciseForm.imageFile);
          
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('exercise-media').getPublicUrl(fileName);
        finalImageUrl = data.publicUrl;
      }

      if (exerciseForm.videoFile) {
        const fileExt = exerciseForm.videoFile.name.split('.').pop();
        const fileName = `vid-${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await supabase.storage
          .from('exercise-media')
          .upload(fileName, exerciseForm.videoFile);
          
        if (uploadError) throw uploadError;
        const { data } = supabase.storage.from('exercise-media').getPublicUrl(fileName);
        finalVideoUrl = data.publicUrl;
      }

      const dbExercise = {
        id: editingExerciseId || getSafeId(),
        name: trimmedName,
        target: exerciseForm.target.trim() || 'General',
        image_data: finalImageUrl,
        video_data: finalVideoUrl,
        instructions: exerciseForm.instructions.split('\n').map((line) => line.trim()).filter(Boolean),
        created_by: currentUserId
      };

      if (editingExerciseId) {
        await supabase.from('exercises').update(dbExercise).eq('id', editingExerciseId);
        setMessage('Exercice modifié pour tout le monde !');
      } else {
        await supabase.from('exercises').insert([dbExercise]);
        setMessage('Exercice ajouté pour tout le monde !');
      }

      await fetchSharedExercises();
      setSelectedExerciseId(dbExercise.id);
      setTimeout(() => setMessage(''), 2500);
      resetExerciseForm();
      
    } catch (error) {
      console.error(error);
      setMessage("Erreur lors de l'envoi du fichier.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleEditExercise = (exercise) => {
    setSelectedExerciseId(exercise.id);
    setEditingExerciseId(exercise.id);
    setExerciseForm({
      name: exercise.name || '',
      target: exercise.target || '',
      imageData: exercise.imageData || '',
      videoData: exercise.videoData || '',
      instructions: Array.isArray(exercise.instructions) ? exercise.instructions.join('\n') : exercise.instructions || '',
      imageFile: null,
      videoFile: null,
    });
    setShowExerciseForm(true);
  };

  const handleDeleteExercise = async (exercise) => {
    if (exercise.imageData && exercise.imageData.includes('supabase.co')) {
      const fileName = exercise.imageData.split('/').pop();
      await supabase.storage.from('exercise-media').remove([fileName]);
    }
    if (exercise.videoData && exercise.videoData.includes('supabase.co')) {
      const fileName = exercise.videoData.split('/').pop();
      await supabase.storage.from('exercise-media').remove([fileName]);
    }

    await supabase.from('exercises').delete().eq('id', exercise.id);
    const remainingExercises = exercises.filter((ex) => ex.id !== exercise.id);
    setExercises(remainingExercises);
    
    if (selectedExerciseId === exercise.id) setSelectedExerciseId(remainingExercises[0]?.id || '');
    setWorkoutHistory((prev) => prev.filter((entry) => entry.machine_id !== exercise.id));
    if (editingExerciseId === exercise.id) resetExerciseForm();
  };

  const saveWorkout = async (e) => {
    e.preventDefault();
    const numericWeight = Number(weight);
    const numericReps = Number(reps);
    const userId = session?.user?.id || 'guest';

    if (!selectedExerciseId || !Number.isFinite(numericWeight) || !Number.isFinite(numericReps)) {
      setMessage('Remplis bien le poids et les répétitions.');
      return;
    }

    const entry = {
      id: editingWorkoutId || `workout-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      machine_id: selectedExerciseId,
      user_id: userId,
      weight: numericWeight,
      reps: numericReps,
      created_at: new Date().toISOString(),
      date: new Date().toISOString(),
    };

    if (editingWorkoutId) {
      setWorkoutHistory((prev) => prev.map((item) => (item.id === editingWorkoutId ? { ...item, ...entry } : item)));
      setMessage('Série mise à jour !');
      setEditingWorkoutId(null);
    } else {
      setWorkoutHistory((prev) => [entry, ...prev]);
      setMessage('Série enregistrée avec succès ! 💪');
    }

    setWeight(''); setReps('');
    setTimeout(() => setMessage(''), 2500);

    try {
      if (editingWorkoutId) {
        await supabase.from('workouts').update({
          weight: numericWeight, reps: numericReps, created_at: entry.created_at,
        }).eq('id', editingWorkoutId).eq('user_id', userId);
      } else {
        await supabase.from('workouts').insert([{ ...entry, user_id: userId }]);
      }
    } catch (error) {
      console.warn('Erreur synchro', error);
    }
  };

  const startEditingWorkout = (entry) => {
    setEditingWorkoutId(entry.id);
    setWeight(String(entry.weight));
    setReps(String(entry.reps));
    setMessage('Modification en cours pour cette série.');
    setTimeout(() => setMessage(''), 1800);
  };

  const cancelWorkoutEdit = () => {
    setEditingWorkoutId(null);
    setWeight(''); setReps(''); setMessage('');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 pb-24">
      <header className="flex justify-between items-center mb-8 bg-gray-900 p-6 rounded-3xl shadow-xl border border-gray-800 max-w-4xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-sky-300/80">Performance</div>
          <h1 className="text-3xl font-extrabold text-blue-500">Gym<span className="text-white">Tracker</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowSettings(!showSettings)} className="text-sm bg-slate-800 text-slate-100 px-4 py-2.5 rounded-full border border-slate-700 hover:border-sky-500 transition">
            Paramètres
          </button>
          <span className="text-gray-400 font-medium hidden sm:block">{displayName}</span>
          <button onClick={() => supabase.auth.signOut()} className="text-sm bg-red-600/10 text-red-400 px-5 py-2.5 rounded-full hover:bg-red-600 hover:text-white transition">
            Déconnexion
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="max-w-4xl mx-auto mb-8 bg-slate-900/80 border border-slate-700 rounded-3xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Paramètres</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <label className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/80 p-3 text-sm text-slate-200">
              <span>Mode compact</span>
              <input type="checkbox" checked={settings.compactMode} onChange={(e) => updateSettings('compactMode', e.target.checked)} className="h-4 w-4 accent-blue-500"/>
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/80 p-3 text-sm text-slate-200">
              <span>Afficher astuces</span>
              <input type="checkbox" checked={settings.showTips} onChange={(e) => updateSettings('showTips', e.target.checked)} className="h-4 w-4 accent-emerald-500"/>
            </label>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto space-y-8">
        <div className="grid md:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-blue-500/30 bg-linear-to-br from-blue-600/20 to-sky-500/10 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-blue-200">Best charge</div>
            <div className="mt-3 text-2xl font-bold text-white">{workoutSummary.bestWeight || 0} kg</div>
          </div>
          <div className="rounded-2xl border border-emerald-500/30 bg-linear-to-br from-emerald-600/20 to-green-500/10 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-emerald-200">Meilleure reps</div>
            <div className="mt-3 text-2xl font-bold text-white">{workoutSummary.bestReps || 0}</div>
          </div>
          <div className="rounded-2xl border border-violet-500/30 bg-linear-to-br from-violet-600/20 to-fuchsia-500/10 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-violet-200">Total séries</div>
            <div className="mt-3 text-2xl font-bold text-white">{workoutSummary.totalSessions}</div>
          </div>
          <div className="rounded-2xl border border-amber-500/30 bg-linear-to-br from-amber-500/20 to-yellow-500/10 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-200">Dernière</div>
            <div className="mt-3 text-lg font-bold text-white">{workoutSummary.lastSession ? `${workoutSummary.lastSession.weight} kg` : '—'}</div>
          </div>
        </div>

        <div className="bg-gray-900 p-5 rounded-3xl border border-gray-800">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-xl font-bold">1. Mes exercices</h2>
            <button
              type="button"
              onClick={() => {
                if (showExerciseForm) {
                  resetExerciseForm();
                } else {
                  setExerciseForm(emptyExerciseForm);
                  setEditingExerciseId(null);
                  setShowExerciseForm(true);
                }
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm rounded-xl font-semibold transition"
            >
              {showExerciseForm ? 'Fermer' : 'Ajouter un exercice'}
            </button>
          </div>

          {showExerciseForm && (
            <form onSubmit={handleSubmitExercise} className="mb-6 p-4 rounded-2xl border border-blue-500/30 bg-blue-950/20 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm text-gray-300">
                  Nom de l’exercice
                  <input value={exerciseForm.name} onChange={(e) => handleFormChange('name', e.target.value)} className="mt-2 w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 outline-none focus:border-blue-500" required />
                </label>
                <label className="block text-sm text-gray-300">
                  Muscle ciblé
                  <input value={exerciseForm.target} onChange={(e) => handleFormChange('target', e.target.value)} className="mt-2 w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 outline-none focus:border-blue-500" placeholder="Ex: Triceps" />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm text-gray-300">
                  Photo
                  <input type="file" accept="image/*" onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    handleFormChange('imageData', await fileToDataUrl(file));
                    handleFormChange('imageFile', file);
                  }} className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-xl p-3" />
                </label>
                <label className="block text-sm text-gray-300">
                  Vidéo
                  <input type="file" accept="video/*" onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return;
                    handleFormChange('videoData', await fileToDataUrl(file));
                    handleFormChange('videoFile', file);
                  }} className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-xl p-3" />
                </label>
              </div>

              {(exerciseForm.imageData || exerciseForm.videoData) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {exerciseForm.imageData && <img src={exerciseForm.imageData} className="w-full h-32 object-cover rounded-lg" alt="aperçu" />}
                  {exerciseForm.videoData && <video src={exerciseForm.videoData} controls className="w-full h-32 object-cover rounded-lg" />}
                </div>
              )}

              <label className="block text-sm text-gray-300">
                Instructions (une par ligne)
                <textarea rows={3} value={exerciseForm.instructions} onChange={(e) => handleFormChange('instructions', e.target.value)} className="mt-2 w-full bg-gray-800 border border-gray-700 rounded-xl p-3 outline-none focus:border-blue-500" />
              </label>

              <div className="flex gap-3 justify-end items-center">
                <button type="button" onClick={resetExerciseForm} className="text-gray-400 hover:text-white px-4 py-2">Annuler</button>
                <button type="submit" disabled={isUploading} className="bg-green-600 hover:bg-green-500 disabled:bg-gray-600 text-white px-5 py-2 rounded-xl font-semibold">
                  {isUploading ? 'Envoi...' : editingExerciseId ? 'Modifier' : 'Ajouter'}
                </button>
              </div>
            </form>
          )}

          {exercises.length === 0 ? (
            <div className="text-center py-8 text-gray-400 border border-dashed border-gray-700 rounded-2xl">Aucun exercice disponible.</div>
          ) : (
            <div className="flex overflow-x-auto gap-4 pb-2 hide-scrollbar">
              {exercises.map((exercise) => (
                <div key={exercise.id} onClick={() => setSelectedExerciseId(exercise.id)} className={`shrink-0 w-52 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all ${selectedExerciseId === exercise.id ? 'border-blue-500 scale-[1.02]' : 'border-gray-800 opacity-90 hover:opacity-100'}`}>
                  
                  <div 
                    className="h-40 bg-black relative group"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedExerciseId(exercise.id); // Sélectionne quand même l'exercice
                      if (exercise.videoData) setEnlargedMedia({ isOpen: true, type: 'video', src: exercise.videoData });
                      else if (exercise.imageData) setEnlargedMedia({ isOpen: true, type: 'image', src: exercise.imageData });
                    }}
                  >
                    {exercise.videoData ? (
                      <video src={exercise.videoData} className="w-full h-full object-cover" muted playsInline loop autoPlay />
                    ) : exercise.imageData ? (
                      <img src={exercise.imageData} className="w-full h-full object-cover" alt={exercise.name} />
                    ) : (
                      <div className="w-full h-full bg-gray-800 flex items-center justify-center text-xs">Pas d'image</div>
                    )}
                    
                    {/* Icône de loupe au survol */}
                    {(exercise.videoData || exercise.imageData) && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <svg className="w-10 h-10 text-white drop-shadow-md" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                      </div>
                    )}
                  </div>

                  <div className="bg-gray-900 p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-bold text-sm capitalize truncate">{exercise.name}</p>
                      
                      {/* Les boutons Modifier/Supprimer sont de retour ! */}
                      {exercise.created_by === currentUserId && (
                        <div className="flex gap-2">
                          <button onClick={(e) => { e.stopPropagation(); handleEditExercise(exercise); }} className="text-xs text-blue-300 hover:text-blue-200">Modifier</button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteExercise(exercise); }} className="text-xs text-red-300 hover:text-red-200">Suppr.</button>
                        </div>
                      )}
                    </div>
                    {/* L'étiquette du muscle ciblé est de retour ! */}
                    <p className="text-xs text-gray-400">{exercise.target || 'Général'}</p>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>

        {activeExercise && activeExercise.instructions.length > 0 && (
          <div className="bg-blue-950/25 border border-blue-500/30 rounded-2xl p-5">
            <h3 className="font-bold text-blue-400 mb-3">Exécution</h3>
            <ul className="text-gray-300 text-sm space-y-2 list-disc pl-5">
              {activeExercise.instructions.map((step, i) => <li key={i}>{step}</li>)}
            </ul>
          </div>
        )}

        <form onSubmit={saveWorkout} className="bg-gray-900 p-8 rounded-3xl shadow-2xl border border-gray-800">
          <h2 className="text-xl font-bold mb-6">2. Enregistre ta série</h2>
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-2 font-medium">Poids (kg)</label>
              <input type="number" step="0.5" required className="w-full bg-gray-800 p-4 rounded-xl text-white text-xl text-center font-bold outline-none focus:border-blue-500 border border-gray-700" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-2 font-medium">Reps</label>
              <input type="number" required className="w-full bg-gray-800 p-4 rounded-xl text-white text-xl text-center font-bold outline-none focus:border-blue-500 border border-gray-700" value={reps} onChange={(e) => setReps(e.target.value)} />
            </div>
          </div>
          <button type="submit" disabled={!selectedExerciseId} className="w-full p-5 rounded-2xl font-extrabold text-xl mt-6 transition-all bg-blue-600 hover:bg-blue-700 text-white disabled:bg-gray-800 disabled:text-gray-500">
            {editingWorkoutId ? 'Mettre à jour' : 'Valider'}
          </button>
          {message && <div className="mt-4 p-3 bg-green-900/30 text-green-400 text-center font-medium rounded-xl border border-green-500/50">{message}</div>}
        </form>

        {activeExercise && (
          <div className="bg-gray-900 p-6 rounded-3xl border border-gray-800">
            <h2 className="text-xl font-bold mb-4">3. Progression ({activeHistory.length} séries)</h2>
            {activeHistory.length > 0 ? (
              <div className="space-y-3">
                {activeHistory.map((entry) => (
                  <button key={entry.id} onClick={() => startEditingWorkout(entry)} className="w-full text-left p-3 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 transition">
                    <div className="flex justify-between items-center">
                      <div><div className="font-semibold text-white">{entry.weight} kg</div><div className="text-sm text-gray-400">{entry.reps} reps</div></div>
                      <div className="text-sm text-gray-400">{formatDate(entry.created_at || entry.date)}</div>
                    </div>
                  </button>
                ))}
              </div>
            ) : <div className="text-gray-400 text-sm py-5 text-center border border-dashed border-gray-700 rounded-2xl">Aucune série enregistrée.</div>}
          </div>
        )}
      </main>

      {/* MODAL POUR AGRANDIR L'IMAGE/VIDEO */}
      {enlargedMedia.isOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 backdrop-blur-sm" 
          onClick={() => setEnlargedMedia({ isOpen: false, type: '', src: '' })}
        >
          <button className="absolute top-6 right-6 text-white bg-gray-800 rounded-full p-3 hover:bg-gray-700 transition">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
          <div className="max-w-4xl max-h-[90vh] w-full h-full flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {enlargedMedia.type === 'video' ? (
              <video src={enlargedMedia.src} controls autoPlay className="max-w-full max-h-full rounded-2xl shadow-2xl" />
            ) : (
              <img src={enlargedMedia.src} className="max-w-full max-h-full rounded-2xl object-contain shadow-2xl" alt="Agrandissement" />
            )}
          </div>
        </div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      ` }} />
    </div>
  );
}