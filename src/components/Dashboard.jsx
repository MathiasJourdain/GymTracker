import { useMemo, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';

const EXERCISE_STORAGE_KEY = 'gym-tracker-shared-exercises';
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
  const [exercises, setExercises] = useState(() => loadLocalStorage(EXERCISE_STORAGE_KEY, []));
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

  const displayName = session?.user?.user_metadata?.username || session?.user?.email?.split('@')[0] || 'Sportif';

  useEffect(() => {
    const savedWorkouts = loadLocalStorage(getUserWorkoutStorageKey(currentUserId), []);
    setWorkoutHistory(Array.isArray(savedWorkouts) ? savedWorkouts : []);
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem(EXERCISE_STORAGE_KEY, JSON.stringify(exercises));
  }, [exercises]);

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

    return {
      bestWeight,
      bestReps,
      totalSessions,
      lastSession,
    };
  }, [workoutHistory]);

  const activeHistory = useMemo(() => {
    return [...workoutHistory]
      .filter((entry) => entry.machine_id === selectedExerciseId)
      .sort((a, b) => new Date(b.created_at || b.date || 0) - new Date(a.created_at || a.date || 0));
  }, [workoutHistory, selectedExerciseId]);

  const chartData = useMemo(() => {
    if (!activeHistory.length) {
      return { weightPoints: '', repsPoints: '', maxValue: 1 };
    }

    const sorted = [...activeHistory].sort((a, b) => new Date(a.created_at || a.date) - new Date(b.created_at || b.date));
    const maxValue = Math.max(
      ...sorted.map((entry) => Number(entry.weight || 0)),
      ...sorted.map((entry) => Number(entry.reps || 0)),
      1,
    );

    const width = 280;
    const height = 120;
    const padding = 18;

    const toPoint = (value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(sorted.length - 1, 1);
      const y = height - padding - ((Number(value) / maxValue) * (height - padding * 2));
      return `${x},${y}`;
    };

    const weightPoints = sorted.map((entry, index) => toPoint(entry.weight, index)).join(' ');
    const repsPoints = sorted.map((entry, index) => toPoint(entry.reps, index)).join(' ');

    return { weightPoints, repsPoints, maxValue };
  }, [activeHistory]);

  const updateSettings = (key, value) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleFormChange = (field, value) => {
    setExerciseForm((prev) => ({
      ...prev,
      [field]: value,
    }));
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

    let imageData = exerciseForm.imageData || '';
    let videoData = exerciseForm.videoData || '';

    if (exerciseForm.imageFile) {
      imageData = await fileToDataUrl(exerciseForm.imageFile);
    }

    if (exerciseForm.videoFile) {
      videoData = await fileToDataUrl(exerciseForm.videoFile);
    }

    const preparedExercise = {
      id: editingExerciseId || getSafeId(),
      name: trimmedName,
      target: exerciseForm.target.trim() || 'General',
      imageData,
      videoData,
      instructions: exerciseForm.instructions
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
    };

    if (editingExerciseId) {
      setExercises((prev) =>
        prev.map((exercise) =>
          exercise.id === editingExerciseId ? preparedExercise : exercise
        )
      );
      setMessage('Exercice modifié avec succès !');
    } else {
      setExercises((prev) => [preparedExercise, ...prev]);
      setMessage('Exercice ajouté avec succès !');
    }

    setSelectedExerciseId(preparedExercise.id);
    setTimeout(() => setMessage(''), 2500);
    resetExerciseForm();
  };

  const handleEditExercise = (exercise) => {
    setSelectedExerciseId(exercise.id);
    setEditingExerciseId(exercise.id);
    setExerciseForm({
      name: exercise.name || '',
      target: exercise.target || '',
      imageData: exercise.imageData || '',
      videoData: exercise.videoData || '',
      instructions: Array.isArray(exercise.instructions)
        ? exercise.instructions.join('\n')
        : exercise.instructions || '',
      imageFile: null,
      videoFile: null,
    });
    setShowExerciseForm(true);
  };

  const handleDeleteExercise = (exerciseId) => {
    const remainingExercises = exercises.filter((exercise) => exercise.id !== exerciseId);
    setExercises(remainingExercises);

    if (selectedExerciseId === exerciseId) {
      setSelectedExerciseId(remainingExercises[0]?.id || '');
    }

    setWorkoutHistory((prev) => prev.filter((entry) => entry.machine_id !== exerciseId));

    if (editingExerciseId === exerciseId) {
      resetExerciseForm();
    }
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
      setWorkoutHistory((prev) =>
        prev.map((item) => (item.id === editingWorkoutId ? { ...item, ...entry } : item))
      );
      setMessage('Série mise à jour !');
      setEditingWorkoutId(null);
    } else {
      setWorkoutHistory((prev) => [entry, ...prev]);
      setMessage('Série enregistrée avec succès ! 💪');
    }

    setWeight('');
    setReps('');
    setTimeout(() => setMessage(''), 2500);

    try {
      if (editingWorkoutId) {
        await supabase.from('workouts').update({
          weight: numericWeight,
          reps: numericReps,
          created_at: entry.created_at,
        }).eq('id', editingWorkoutId).eq('user_id', userId);
      } else {
        await supabase.from('workouts').insert([{ ...entry, user_id: userId }]);
      }
    } catch (error) {
      console.warn('Synchronisation Supabase ignorée :', error);
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
    setWeight('');
    setReps('');
    setMessage('');
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-6 pb-24">
      <header className="flex justify-between items-center mb-8 bg-gray-900 p-6 rounded-3xl shadow-xl border border-gray-800 max-w-4xl mx-auto">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-sky-300/80">Performance</div>
          <h1 className="text-3xl font-extrabold text-blue-500">Gym<span className="text-white">Tracker</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSettings((prev) => !prev)}
            className="text-sm bg-slate-800 text-slate-100 px-4 py-2.5 rounded-full border border-slate-700 hover:border-sky-500 transition"
          >
            Paramètres
          </button>
          <span className="text-gray-400 font-medium hidden sm:block">{displayName}</span>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm bg-red-600/10 text-red-400 px-5 py-2.5 rounded-full hover:bg-red-600 hover:text-white transition"
          >
            Déconnexion
          </button>
        </div>
      </header>

      {showSettings && (
        <div className="max-w-4xl mx-auto mb-8 bg-slate-900/80 border border-slate-700 rounded-3xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-white">Paramètres</h2>
            <span className="text-xs text-slate-400">Personnalisation</span>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <label className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/80 p-3 text-sm text-slate-200">
              <span>Mode compact</span>
              <input
                type="checkbox"
                checked={settings.compactMode}
                onChange={(e) => updateSettings('compactMode', e.target.checked)}
                className="h-4 w-4 accent-blue-500"
              />
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/80 p-3 text-sm text-slate-200">
              <span>Afficher astuces</span>
              <input
                type="checkbox"
                checked={settings.showTips}
                onChange={(e) => updateSettings('showTips', e.target.checked)}
                className="h-4 w-4 accent-emerald-500"
              />
            </label>
            <label className="flex items-center justify-between rounded-2xl border border-slate-700 bg-slate-800/80 p-3 text-sm text-slate-200">
              <span>Couleur</span>
              <select
                value={settings.accent}
                onChange={(e) => updateSettings('accent', e.target.value)}
                className="bg-slate-900 text-white rounded-lg border border-slate-600 px-2 py-1 ml-2"
              >
                <option value="blue">Bleu</option>
                <option value="purple">Violet</option>
                <option value="green">Vert</option>
              </select>
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
            <div className="mt-3 text-lg font-bold text-white">
              {workoutSummary.lastSession ? `${workoutSummary.lastSession.weight} kg` : '—'}
            </div>
          </div>
        </div>

        {settings.showTips && (
          <div className="rounded-3xl border border-slate-700 bg-slate-900/80 p-4 text-sm text-slate-300">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-slate-100">Petit conseil du jour</span>
              <span className="text-xs uppercase tracking-[0.2em] text-sky-300">Focus</span>
            </div>
            <p>Priorise la qualité du mouvement et ajoute une série quand tu sens le bon effort, sans t’écraser dans la fatigue.</p>
          </div>
        )}

        <div className="bg-gray-900 p-5 rounded-3xl border border-gray-800">
          <div className="flex items-center justify-between mb-4 gap-3">
            <h2 className="text-xl font-bold">1. Mes exercices</h2>
            <button
              type="button"
              onClick={() => {
                setShowExerciseForm((prev) => !prev);
                if (!showExerciseForm) {
                  setExerciseForm(emptyExerciseForm);
                  setEditingExerciseId(null);
                }
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 text-sm rounded-xl font-semibold"
            >
              {showExerciseForm ? 'Fermer' : 'Ajouter un exercice'}
            </button>
          </div>

          {showExerciseForm && (
            <form onSubmit={handleSubmitExercise} className="mb-6 p-4 rounded-2xl border border-blue-500/30 bg-blue-950/20 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm text-gray-300">
                  Nom de l’exercice
                  <input
                    value={exerciseForm.name}
                    onChange={(e) => handleFormChange('name', e.target.value)}
                    className="mt-2 w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 outline-none focus:border-blue-500"
                    placeholder="Par exemple : Squat"
                  />
                </label>

                <label className="block text-sm text-gray-300">
                  Muscle ciblé
                  <input
                    value={exerciseForm.target}
                    onChange={(e) => handleFormChange('target', e.target.value)}
                    className="mt-2 w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 outline-none focus:border-blue-500"
                    placeholder="Abdos, poitrine, jambes..."
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block text-sm text-gray-300">
                  Photo locale
                  <input
                    type="file"
                    accept="image/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const data = await fileToDataUrl(file);
                      handleFormChange('imageData', data);
                      handleFormChange('imageFile', file);
                    }}
                    className="mt-2 w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 outline-none focus:border-blue-500"
                  />
                </label>

                <label className="block text-sm text-gray-300">
                  Vidéo locale
                  <input
                    type="file"
                    accept="video/*"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const data = await fileToDataUrl(file);
                      handleFormChange('videoData', data);
                      handleFormChange('videoFile', file);
                    }}
                    className="mt-2 w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 outline-none focus:border-blue-500"
                  />
                </label>
              </div>

              {(exerciseForm.imageData || exerciseForm.videoData) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {exerciseForm.imageData && (
                    <div className="rounded-xl overflow-hidden border border-gray-700 bg-gray-800 p-2">
                      <p className="text-xs text-gray-300 mb-2">Aperçu image</p>
                      <img src={exerciseForm.imageData} alt="Aperçu" className="w-full h-32 object-cover rounded-lg" />
                    </div>
                  )}
                  {exerciseForm.videoData && (
                    <div className="rounded-xl overflow-hidden border border-gray-700 bg-gray-800 p-2">
                      <p className="text-xs text-gray-300 mb-2">Aperçu vidéo</p>
                      <video src={exerciseForm.videoData} controls className="w-full h-32 object-cover rounded-lg" />
                    </div>
                  )}
                </div>
              )}

              <label className="block text-sm text-gray-300">
                Instructions
                <textarea
                  rows={4}
                  value={exerciseForm.instructions}
                  onChange={(e) => handleFormChange('instructions', e.target.value)}
                  className="mt-2 w-full bg-gray-800 border border-gray-700 text-white rounded-xl p-3 outline-none focus:border-blue-500"
                  placeholder="Une instruction par ligne"
                />
              </label>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={resetExerciseForm}
                  className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  className="bg-green-600 hover:bg-green-500 text-white px-5 py-2 rounded-xl font-semibold"
                >
                  {editingExerciseId ? 'Modifier l’exercice' : 'Ajouter l’exercice'}
                </button>
              </div>
            </form>
          )}

          {exercises.length === 0 ? (
            <div className="text-center py-8 border border-dashed border-gray-700 rounded-2xl text-gray-400">
              Aucun exercice ajouté pour le moment.
            </div>
          ) : (
            <div className="flex overflow-x-auto gap-4 pb-2 hide-scrollbar">
              {exercises.map((exercise) => (
                <div
                  key={exercise.id}
                  onClick={() => setSelectedExerciseId(exercise.id)}
                  className={`relative shrink-0 w-52 rounded-2xl overflow-hidden cursor-pointer border-2 transition-all duration-300 ${
                    selectedExerciseId === exercise.id
                      ? 'border-blue-500 scale-[1.02] shadow-[0_0_16px_rgba(59,130,246,0.4)]'
                      : 'border-gray-800 opacity-90 hover:opacity-100'
                  }`}
                >
                  <div className="h-40 bg-white p-2">
                    {exercise.videoData ? (
                      <video
                        src={exercise.videoData}
                        className="w-full h-full object-cover rounded-xl"
                        muted
                        playsInline
                        loop
                        autoPlay
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          e.currentTarget.parentElement.innerHTML = '<img src="/exercise-placeholder.svg" class="w-full h-full object-cover rounded-xl opacity-80" />';
                        }}
                      />
                    ) : exercise.imageData ? (
                      <img
                        src={exercise.imageData}
                        alt={exercise.name}
                        className="w-full h-full object-cover rounded-xl"
                        onError={(e) => {
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = '/exercise-placeholder.svg';
                        }}
                      />
                    ) : (
                      <img src="/exercise-placeholder.svg" alt={exercise.name} className="w-full h-full object-cover rounded-xl opacity-80" />
                    )}
                  </div>

                  <div className="bg-gray-900 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-sm capitalize truncate">{exercise.name}</p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditExercise(exercise);
                          }}
                          className="text-xs text-blue-300 hover:text-blue-200"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteExercise(exercise.id);
                          }}
                          className="text-xs text-red-300 hover:text-red-200"
                        >
                          Suppr.
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">{exercise.target || 'Général'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeExercise && (
          <div className="bg-blue-950/25 border border-blue-500/30 rounded-2xl p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-blue-400">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
              </div>
              <h3 className="font-bold text-blue-400">Exécution</h3>
            </div>

            {Array.isArray(activeExercise.instructions) && activeExercise.instructions.length > 0 ? (
              <ul className="text-gray-300 text-sm leading-relaxed space-y-2 list-disc pl-5">
                {activeExercise.instructions.map((step, index) => (
                  <li key={`${activeExercise.id}-step-${index}`}>{step}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-400 text-sm">Aucune instruction ajoutée pour ce mouvement.</p>
            )}
          </div>
        )}

        <form onSubmit={saveWorkout} className="bg-gray-900 p-8 rounded-3xl shadow-2xl border border-gray-800">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h2 className="text-xl font-bold">2. Enregistre ta série</h2>
            {editingWorkoutId && (
              <button
                type="button"
                onClick={cancelWorkoutEdit}
                className="text-sm text-gray-300 underline hover:text-white"
              >
                Annuler la modif
              </button>
            )}
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-2 font-medium">Poids (kg)</label>
              <input
                type="number"
                step="0.5"
                required
                className="w-full bg-gray-800 p-4 rounded-xl text-white border border-gray-700 focus:border-blue-500 outline-none text-xl text-center font-bold"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-400 mb-2 font-medium">Reps</label>
              <input
                type="number"
                required
                className="w-full bg-gray-800 p-4 rounded-xl text-white border border-gray-700 focus:border-blue-500 outline-none text-xl text-center font-bold"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={!selectedExerciseId}
            className={`w-full p-5 rounded-2xl font-extrabold text-xl mt-6 transition-all ${
              selectedExerciseId
                ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/30 cursor-pointer'
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
          >
            {editingWorkoutId ? 'Mettre à jour la série' : selectedExerciseId ? 'Valider la série' : 'Sélectionne un exercice d\'abord'}
          </button>

          {message && (
            <div className="mt-4 p-3 bg-green-900/30 border border-green-500/50 rounded-xl text-green-400 text-center font-medium">
              {message}
            </div>
          )}
        </form>

        {activeExercise && (
          <div className="bg-gray-900 p-6 rounded-3xl border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">3. Progression</h2>
              <span className="text-sm text-gray-400">{activeHistory.length} série(s)</span>
            </div>

            {activeHistory.length > 0 ? (
              <>
                <div className="bg-gray-800 rounded-2xl p-4 mb-6">
                  <svg viewBox="0 0 300 140" className="w-full h-36">
                    <line x1="18" y1="110" x2="282" y2="110" stroke="#475569" strokeWidth="1" />
                    <line x1="18" y1="18" x2="18" y2="110" stroke="#475569" strokeWidth="1" />
                    <polyline
                      points={chartData.weightPoints}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                    <polyline
                      points={chartData.repsPoints}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth="3"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="flex gap-6 text-xs text-gray-300 mt-2">
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-blue-500" /> Poids</span>
                    <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-emerald-400" /> Répétitions</span>
                  </div>
                </div>

                <div className="space-y-3">
                  {activeHistory.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => startEditingWorkout(entry)}
                      className="w-full text-left p-3 bg-gray-800 hover:bg-gray-700 rounded-xl border border-gray-700 transition"
                    >
                      <div className="flex justify-between gap-3 items-center">
                        <div>
                          <div className="font-semibold text-white">{entry.weight} kg</div>
                          <div className="text-sm text-gray-400">{entry.reps} reps</div>
                        </div>
                        <div className="text-sm text-gray-400">{formatDate(entry.created_at || entry.date)}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-gray-400 text-sm py-10 text-center border border-dashed border-gray-700 rounded-2xl">
                Aucune série enregistrée pour cet exercice.
              </div>
            )}
          </div>
        )}
      </main>

      <style dangerouslySetInnerHTML={{ __html: `
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      ` }} />
    </div>
  );
}
