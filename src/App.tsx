import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDropzone } from 'react-dropzone';
import { 
  BookOpen, 
  Camera, 
  ChevronLeft, 
  Languages, 
  Loader2, 
  MessageSquare, 
  RotateCcw, 
  Send, 
  Upload,
  User as UserIcon,
  Quote,
  LogIn,
  LogOut,
  History,
  Trash2
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import confetti from 'canvas-confetti';
import { onAuthStateChanged, User } from 'firebase/auth';

import { Language, AnalysisResult, ChatMessage, FileData, SavedStudy } from './types';
import { UI_LABELS } from './constants';
import { analyzeText, chatWithRabbi } from './services/geminiService';
import { auth, loginWithGoogle, logout } from './lib/firebase';
import { 
  saveStudySession, 
  updateStudyChat, 
  getStudySessions, 
  testConnection,
  deleteStudySession
} from './lib/firestoreUtils';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [language, setLanguage] = useState<Language | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentFile, setCurrentFile] = useState<FileData | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [history, setHistory] = useState<SavedStudy[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeStudyId, setActiveStudyId] = useState<string | null>(null);
  const [view, setView] = useState<'main' | 'repository'>('main');
  const [isDeleting, setIsDeleting] = useState<string | null>(null);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  const loadingMessages = [
    "Reviewing the sacred words...",
    "Consulting the Gemara...",
    "Studying the Rishonim...",
    "Seeking wisdom in the text...",
    "Preparing your explanation..."
  ];

  useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchHistory();
    } else {
      setHistory([]);
    }
  }, [user]);

  const fetchHistory = async () => {
    setLoadingHistory(true);
    const sessions = await getStudySessions();
    setHistory(sessions);
    setLoadingHistory(false);
  };

  useEffect(() => {
    let interval: any;
    if (isAnalyzing) {
      interval = setInterval(() => {
        setLoadingMessageIndex(prev => (prev + 1) % loadingMessages.length);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isAnalyzing]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0 || !language) return;
    
    const file = acceptedFiles[0];
    if (file.size > 20 * 1024 * 1024) {
      alert("File is too large. Please upload an image or PDF smaller than 20MB.");
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const resultString = reader.result as string;
      const base64 = resultString.split(',')[1];
      
      let mimeType = file.type;
      if (!mimeType) {
        const extension = file.name.split('.').pop()?.toLowerCase();
        if (['jpg', 'jpeg'].includes(extension || '')) mimeType = 'image/jpeg';
        else if (extension === 'png') mimeType = 'image/png';
        else if (extension === 'pdf') mimeType = 'application/pdf';
        else mimeType = 'application/octet-stream';
      }
      
      const fileData: FileData = { base64, mimeType, name: file.name };
      setCurrentFile(fileData);
      processFile(fileData);
    };
    reader.readAsDataURL(file);
  }, [language]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: { 'image/*': ['.jpeg', '.jpg', '.png'], 'application/pdf': ['.pdf'] },
    multiple: false
  });

  const processFile = async (fileData: FileData) => {
    if (!language) return;
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeText(fileData, language);
      setAnalysis(result);
      
      // Save to Firebase
      const studyId = await saveStudySession({
        fileName: fileData.name,
        mimeType: fileData.mimeType,
        fileBase64: fileData.base64.length < 400000 ? fileData.base64 : undefined, // Check rule limit
        analysisText: result.text,
        isGemara: result.isGemara,
        language: result.language,
        chatHistory: []
      });
      setActiveStudyId(studyId || null);
      fetchHistory();

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#1e3a8a', '#b45309']
      });
    } catch (err: any) {
      console.error(err);
      setError(err?.message || UI_LABELS[language].error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (err) {
      console.error("Error accessing camera:", err);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    const stream = videoRef.current?.srcObject as MediaStream;
    stream?.getTracks().forEach(track => track.stop());
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !language) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    const targetAspect = 3 / 4;
    let width = video.videoWidth, height = video.videoHeight, sx = 0, sy = 0, sWidth = width, sHeight = height;

    if (width / height > targetAspect) {
      sWidth = height * targetAspect;
      sx = (width - sWidth) / 2;
    } else {
      sHeight = width / targetAspect;
      sy = (height - sHeight) / 2;
    }

    canvas.width = sWidth; canvas.height = sHeight;
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
    
    const base64 = canvas.toDataURL('image/jpeg').split(',')[1];
    const fileData: FileData = { base64, mimeType: 'image/jpeg', name: 'camera_capture.jpg' };
    
    stopCamera();
    setCurrentFile(fileData);
    processFile(fileData);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !language || isSending) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    const newHistory: ChatMessage[] = [...chatHistory, { role: 'user', content: userMessage }];
    setChatHistory(newHistory);
    setIsSending(true);

    try {
      const rabbiResponse = await chatWithRabbi(
        newHistory, 
        userMessage, 
        language, 
        analysis?.text,
        currentFile || undefined
      );
      const finalHistory: ChatMessage[] = [...newHistory, { role: 'assistant', content: rabbiResponse }];
      setChatHistory(finalHistory);
      
      if (activeStudyId) {
        await updateStudyChat(activeStudyId, finalHistory);
      }
    } catch (error) {
      console.error(error);
      alert(UI_LABELS[language].error);
    } finally {
      setIsSending(false);
    }
  };

  const loadStudy = (study: SavedStudy) => {
    setLanguage(study.language);
    setAnalysis({ text: study.analysisText, isGemara: study.isGemara, language: study.language });
    setChatHistory(study.chatHistory);
    setActiveStudyId(study.id!);
    setCurrentFile({ base64: study.fileBase64 || '', mimeType: study.mimeType, name: study.fileName });
    setView('main');
  };

  const handleDeleteStudy = async (studyId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm("Are you sure you want to delete this study session?")) return;
    
    setIsDeleting(studyId);
    try {
      await deleteStudySession(studyId);
      setHistory(prev => prev.filter(s => s.id !== studyId));
      if (activeStudyId === studyId) {
        resetStudy();
      }
    } catch (err) {
      console.error(err);
      alert("Failed to delete the study session.");
    } finally {
      setIsDeleting(null);
    }
  };

  const resetStudy = () => {
    setAnalysis(null);
    setChatHistory([]);
    setCurrentFile(null);
    setActiveStudyId(null);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-rabbi-cream">
        <Loader2 className="w-12 h-12 text-rabbi-blue animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-rabbi-cream font-sans">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full bg-white rounded-3xl shadow-2xl p-10 border border-rabbi-gold/20 text-center"
        >
          <div className="flex justify-center mb-8">
            <div className="p-5 bg-rabbi-blue rounded-full shadow-lg">
              <BookOpen className="w-16 h-16 text-rabbi-cream" />
            </div>
          </div>
          <h1 className="text-4xl font-serif font-bold text-rabbi-blue mb-4">Daf Rabbi</h1>
          <p className="text-slate-600 mb-8 leading-relaxed">
            Welcome to the digital study hall. Please sign in to access the wisdom of the Torah anywhere.
          </p>
          <button 
            onClick={loginWithGoogle}
            className="w-full py-4 bg-rabbi-blue text-white rounded-2xl hover:bg-rabbi-blue/90 shadow-xl transition-all flex items-center justify-center gap-3 font-bold group"
          >
            <LogIn className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  if (!language) {
    const labels = UI_LABELS.en; // Default for intro
    return (
      <div className="min-h-screen flex flex-col bg-rabbi-cream">
        <AnimatePresence mode="wait">
          {view === 'main' ? (
            <motion.div 
              key="main-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex-1 flex flex-col md:flex-row"
            >
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="max-w-xl w-full bg-white rounded-3xl shadow-xl p-8 border border-rabbi-gold/20">
                  <div className="flex justify-between items-start mb-8">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-rabbi-blue rounded-xl flex items-center justify-center text-rabbi-cream shadow-md">
                         <BookOpen className="w-6 h-6" />
                      </div>
                      <div>
                        <h1 className="text-2xl font-serif font-bold text-rabbi-blue">Daf Rabbi</h1>
                        <p className="text-xs text-rabbi-gold uppercase font-bold tracking-widest leading-none">Holy Study Assistant</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                       <button 
                        onClick={() => setView('repository')}
                        className="p-3 hover:bg-rabbi-blue/5 text-rabbi-blue rounded-xl transition-colors"
                        title="Repository"
                      >
                        <History className="w-5 h-5" />
                      </button>
                      <button 
                        onClick={logout}
                        className="p-3 hover:bg-red-50 text-red-500 rounded-xl transition-colors"
                        title="Logout"
                      >
                        <LogOut className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <button 
                      onClick={() => setView('repository')}
                      className="w-full p-4 bg-rabbi-blue/5 border-2 border-rabbi-blue/10 rounded-2xl flex items-center justify-center gap-3 text-rabbi-blue font-bold hover:bg-rabbi-blue/10 transition-all mb-4"
                    >
                      <History className="w-5 h-5" />
                      {labels.repository}
                    </button>

                    <p className="text-center text-rabbi-gold font-bold flex items-center justify-center gap-2 mb-2">
                      <Languages className="w-5 h-5" />
                      {labels.selectLanguage}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {[
                        { id: 'en', label: 'English' },
                        { id: 'pt', label: 'Português' },
                        { id: 'es', label: 'Español' },
                        { id: 'fr', label: 'Français' },
                        { id: 'ru', label: 'Русский' }
                      ].map((lang) => (
                        <button
                          key={lang.id}
                          onClick={() => setLanguage(lang.id as Language)}
                          className="p-4 border-2 border-slate-50 rounded-2xl hover:border-rabbi-blue hover:bg-rabbi-blue/5 transition-all text-left font-bold text-slate-700 flex items-center justify-between group"
                        >
                          {lang.label}
                          <div className="w-2 h-2 rounded-full bg-transparent group-hover:bg-rabbi-blue transition-colors" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar Snapshot */}
              <div className="hidden lg:flex w-80 bg-white border-l border-rabbi-gold/10 p-6 flex-col overflow-hidden">
                <div className="flex items-center gap-2 text-rabbi-blue font-serif font-bold text-lg mb-6 border-b border-slate-100 pb-2">
                  <History className="w-5 h-5" />
                  Recent Studies
                </div>
                <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                  {history.slice(0, 5).map((study) => (
                    <button
                      key={study.id}
                      onClick={() => loadStudy(study)}
                      className="w-full p-4 bg-slate-50 hover:bg-rabbi-blue/5 border border-transparent hover:border-rabbi-blue/10 rounded-2xl transition-all text-left"
                    >
                      <p className="text-[10px] font-bold text-rabbi-gold uppercase mb-1">{study.language.toUpperCase()}</p>
                      <p className="text-xs text-rabbi-blue font-serif line-clamp-1">{study.analysisText.slice(0, 60)}...</p>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="repository-view"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="flex-1 max-w-5xl mx-auto w-full p-6 md:p-12 flex flex-col"
            >
              <div className="flex items-center justify-between mb-12">
                <div className="flex items-center gap-6">
                  <button 
                    onClick={() => setView('main')}
                    className="p-3 bg-white hover:bg-slate-50 border border-slate-100 rounded-2xl transition-all shadow-sm group"
                  >
                    <ChevronLeft className="w-6 h-6 text-slate-400 group-hover:text-rabbi-blue" />
                  </button>
                  <div>
                    <h2 className="text-4xl font-serif font-bold text-rabbi-blue">{labels.repositoryTitle}</h2>
                    <p className="text-rabbi-gold font-medium italic opacity-70">{labels.repositorySubtitle}</p>
                  </div>
                </div>
                <div className="bg-rabbi-blue/5 px-6 py-3 rounded-2xl border border-rabbi-blue/10 flex items-center gap-3">
                   <UserIcon className="w-5 h-5 text-rabbi-blue" />
                   <span className="text-sm font-bold text-rabbi-blue md:block hidden">{user.email}</span>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto pr-2 custom-scrollbar pb-12">
                 {loadingHistory ? (
                   <div className="col-span-full py-20 flex flex-col items-center gap-4 opacity-30">
                      <Loader2 className="w-12 h-12 animate-spin" />
                      <p className="text-xl font-serif">Opening the archives...</p>
                   </div>
                 ) : history.length === 0 ? (
                   <div className="col-span-full py-20 text-center flex flex-col items-center gap-6">
                      <div className="w-24 h-24 bg-rabbi-gold/5 rounded-full flex items-center justify-center border-2 border-dashed border-rabbi-gold/20">
                         <History className="w-10 h-10 text-rabbi-gold/30" />
                      </div>
                      <p className="text-2xl font-serif text-slate-400 max-w-sm">{labels.noHistory}</p>
                      <button 
                        onClick={() => setView('main')}
                        className="bg-rabbi-blue text-white px-8 py-3 rounded-xl font-bold hover:shadow-lg transition-all"
                      >
                        Start First Study
                      </button>
                   </div>
                 ) : (
                   history.map((study) => (
                     <div 
                      key={study.id}
                      className="bg-white border rounded-[2rem] p-6 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all flex flex-col relative group overflow-hidden"
                     >
                       <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                         <button 
                          onClick={(e) => handleDeleteStudy(study.id!, e)}
                          disabled={isDeleting === study.id}
                          className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-colors shadow-sm"
                         >
                           {isDeleting === study.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                         </button>
                       </div>

                       <div className="mb-4 flex items-center gap-2">
                        <span className="px-3 py-1 bg-rabbi-gold/10 text-rabbi-gold text-[10px] font-bold rounded-full uppercase tracking-widest">
                          {study.language}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {new Date(study.createdAt?.toDate()).toLocaleDateString()}
                        </span>
                       </div>

                       <h3 className="font-serif font-bold text-rabbi-blue text-lg mb-3 line-clamp-2 leading-tight">
                         {study.fileName}
                       </h3>
                       
                       <p className="text-slate-500 text-sm italic mb-6 line-clamp-3 leading-relaxed">
                         "{study.analysisText.slice(0, 150)}..."
                       </p>

                       <button 
                        onClick={() => loadStudy(study)}
                        className="mt-auto w-full py-4 bg-rabbi-blue/5 text-rabbi-blue rounded-2xl font-bold hover:bg-rabbi-blue hover:text-white transition-all flex items-center justify-center gap-2"
                       >
                         <BookOpen className="w-4 h-4" />
                         Continue Studying
                       </button>
                     </div>
                   ))
                 )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  const labels = UI_LABELS[language];

  return (
    <div className="min-h-screen flex flex-col max-w-7xl mx-auto p-4 md:p-8 bg-rabbi-cream font-sans">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 border-b border-rabbi-gold/20 pb-6">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { setLanguage(null); resetStudy(); }}
            className="p-2 hover:bg-white rounded-xl transition-colors text-slate-500 shadow-sm border border-slate-100"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 bg-rabbi-blue rounded-xl flex items-center justify-center text-rabbi-cream shadow-sm">
                <BookOpen className="w-5 h-5" />
             </div>
             <div>
              <h1 className="text-xl md:text-2xl font-serif font-bold text-rabbi-blue leading-tight">{labels.title}</h1>
              <p className="text-[10px] md:text-xs text-rabbi-gold font-bold uppercase tracking-[0.2em]">{labels.subtitle}</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {analysis && (
            <button 
              onClick={resetStudy}
              className="flex items-center gap-2 px-5 py-2.5 bg-rabbi-gold text-white rounded-full hover:bg-rabbi-gold/90 transition-all font-bold text-sm shadow-lg shadow-rabbi-gold/20"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="hidden sm:inline">{labels.reset}</span>
            </button>
          )}
          <button 
            onClick={logout}
            className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
            title="Sign Out"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-6">
        <AnimatePresence mode="wait">
          {!analysis && !isAnalyzing && (
            <motion.div 
              key="upload-view"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex-1 flex flex-col items-center justify-center gap-6"
            >
              {isCameraActive ? (
                <div className="relative w-full max-w-md aspect-[3/4] bg-black rounded-3xl overflow-hidden border-8 border-rabbi-blue shadow-2xl">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-0 border-2 border-white/20 pointer-events-none m-6 rounded-2xl" />
                  <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-4">
                    <button 
                      onClick={stopCamera}
                      className="px-6 py-3 bg-white/20 backdrop-blur-lg text-white rounded-2xl hover:bg-white/30 transition-all font-bold"
                    >
                      {labels.back}
                    </button>
                    <button 
                      onClick={capturePhoto}
                      className="px-8 py-3 bg-rabbi-gold text-white rounded-2xl hover:bg-rabbi-gold/90 shadow-xl shadow-rabbi-gold/40 transform active:scale-95 transition-all font-bold flex items-center gap-2 text-lg"
                    >
                      <Camera className="w-6 h-6" />
                      Capture
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-3xl flex flex-col gap-6">
                  <div 
                    {...getRootProps()} 
                    className={`
                      border-2 border-dashed rounded-[2.5rem] p-12 text-center cursor-pointer transition-all h-[450px] flex flex-col items-center justify-center shadow-inner
                      ${isDragActive ? 'border-rabbi-blue bg-rabbi-blue/10' : 'border-rabbi-gold/20 bg-white hover:border-rabbi-gold hover:bg-rabbi-gold/5'}
                    `}
                  >
                    <input {...getInputProps()} />
                    <motion.div 
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      className="w-24 h-24 bg-rabbi-blue/10 rounded-[2rem] flex items-center justify-center mb-8 text-rabbi-blue shadow-sm"
                    >
                      <Upload className="w-12 h-12" />
                    </motion.div>
                    <p className="text-2xl font-serif text-slate-800 max-w-md mb-6 leading-relaxed">
                      {labels.uploadPrompt}
                    </p>
                    <div className="flex gap-4">
                      <span className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-bold text-slate-500 uppercase tracking-widest">PDF</span>
                      <span className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-bold text-slate-500 uppercase tracking-widest">JPEG</span>
                      <span className="px-4 py-1.5 bg-slate-100 rounded-full text-xs font-bold text-slate-500 uppercase tracking-widest">PNG</span>
                    </div>
                  </div>
                  
                  {error && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-red-50 border border-red-200 p-5 rounded-2xl text-red-700 flex flex-col items-center gap-3"
                    >
                       <p className="font-medium">{error}</p>
                       <button 
                        onClick={() => currentFile && processFile(currentFile)}
                        className="text-sm bg-red-100 px-6 py-2 rounded-full hover:bg-red-200 transition-colors font-bold"
                       >
                        Tentar novamente
                       </button>
                    </motion.div>
                  )}
                  
                  <div className="flex items-center gap-6">
                    <div className="flex-1 h-px bg-rabbi-gold/20" />
                    <span className="text-rabbi-gold/40 font-bold text-sm tracking-[0.3em]">HASHEM PROVIDES</span>
                    <div className="flex-1 h-px bg-rabbi-gold/20" />
                  </div>

                  <button 
                    onClick={startCamera}
                    className="w-full py-8 bg-rabbi-blue text-white rounded-[2rem] hover:bg-rabbi-blue/90 shadow-2xl shadow-rabbi-blue/30 flex items-center justify-center gap-4 transition-all transform hover:-translate-y-2 active:translate-y-0"
                  >
                    <Camera className="w-8 h-8" />
                    <span className="text-2xl font-serif font-bold">{labels.cameraPrompt}</span>
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {isAnalyzing && (
            <motion.div 
              key="loader-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col items-center justify-center"
            >
              <div className="relative mb-10">
                <Loader2 className="w-24 h-24 text-rabbi-blue animate-spin opacity-20" />
                <div className="absolute inset-0 flex items-center justify-center">
                   <BookOpen className="w-12 h-12 text-rabbi-gold animate-bounce" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-3xl font-serif text-rabbi-blue mb-4">{labels.analyzing}</p>
                <motion.p 
                  key={loadingMessageIndex}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-rabbi-gold text-lg font-medium italic opacity-70"
                >
                  {loadingMessages[loadingMessageIndex]}
                </motion.p>
              </div>
            </motion.div>
          )}

          {analysis && (
            <motion.div 
              key="content-view"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-8 h-full"
            >
              {/* Main Analysis Text */}
              <div className="lg:col-span-8 bg-white border border-rabbi-gold/20 rounded-[2.5rem] shadow-xl overflow-hidden flex flex-col h-[70vh] lg:h-[80vh]">
                <div className="p-6 border-b border-slate-50 flex items-center justify-between bg-white">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-rabbi-gold/10 rounded-lg text-rabbi-gold">
                      <Quote className="w-5 h-5" />
                    </div>
                    <span className="font-serif font-bold text-xl text-rabbi-blue">Rabbi's Insights</span>
                  </div>
                  {currentFile && (
                    <div className="text-[10px] px-4 py-1.5 bg-slate-50 border border-slate-100 rounded-full text-slate-400 font-bold uppercase tracking-widest">
                      {currentFile.name}
                    </div>
                  )}
                </div>
                <div className="flex-1 p-8 md:p-12 overflow-auto scroll-smooth custom-scrollbar">
                   <div className="markdown-body max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {analysis.text}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* Chat Sidebar */}
              <div className="lg:col-span-4 flex flex-col h-[60vh] lg:h-[80vh]">
                <div className="flex-1 bg-rabbi-blue rounded-[2.5rem] shadow-2xl p-8 flex flex-col overflow-hidden relative border border-white/5">
                   <div className="flex items-center gap-3 text-rabbi-cream mb-8 border-b border-white/10 pb-6">
                    <div className="p-2 bg-white/10 rounded-xl">
                      <MessageSquare className="w-6 h-6 text-rabbi-gold" />
                    </div>
                    <h3 className="font-serif font-bold text-xl">Study Conversation</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-6 pr-3 custom-scrollbar">
                    {chatHistory.length === 0 && (
                      <div className="text-white/40 text-center py-16 flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full border-2 border-dashed border-white/10 flex items-center justify-center">
                          <MessageSquare className="w-6 h-6 opacity-20" />
                        </div>
                        <p className="italic font-serif text-lg">The Rabbi is ready to discuss the deeper meanings of this text with you.</p>
                      </div>
                    )}
                    {chatHistory.map((msg, i) => (
                      <div 
                        key={i} 
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`
                          max-w-[90%] p-5 rounded-2xl text-base leading-relaxed shadow-lg
                          ${msg.role === 'user' 
                            ? 'bg-rabbi-gold text-white rounded-tr-none' 
                            : 'bg-white/10 text-rabbi-cream rounded-tl-none border border-white/10 backdrop-blur-sm'}
                        `}>
                          <div className="flex items-center gap-2 mb-2 opacity-50">
                            {msg.role === 'user' ? <UserIcon className="w-3 h-3" /> : <Quote className="w-3 h-3" />}
                            <span className="text-[10px] uppercase font-bold tracking-[0.2em]">
                              {msg.role === 'user' ? 'Student' : 'Rabbi'}
                            </span>
                          </div>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isSending && (
                      <div className="flex items-center gap-3 text-rabbi-gold/80 animate-pulse text-sm pl-2 font-medium">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Rabbi is formulating the response...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} className="mt-8 relative">
                    <input 
                      type="text" 
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={labels.askQuestion}
                      className="w-full bg-white/5 border border-white/15 rounded-[1.5rem] py-5 pl-6 pr-16 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-rabbi-gold/50 transition-all font-serif text-lg"
                    />
                    <button 
                      type="submit"
                      disabled={isSending || !inputValue.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-4 bg-rabbi-gold text-white rounded-2xl hover:bg-rabbi-gold/90 disabled:opacity-50 disabled:grayscale transition-all shadow-xl active:scale-95"
                    >
                      <Send className="w-6 h-6" />
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-12 text-center text-slate-400 text-xs py-6 flex items-center justify-between border-t border-rabbi-gold/10">
        <div className="flex items-center gap-6">
           {language && (
            <div className="flex items-center gap-2 bg-white px-4 py-1.5 rounded-full shadow-sm border border-slate-100 text-[10px] font-bold text-rabbi-blue">
              <Languages className="w-3 h-3 text-rabbi-gold" />
              <span>{language.toUpperCase()}</span>
            </div>
           )}
           <div className="hidden md:flex items-center gap-2 opacity-50">
             <UserIcon className="w-3 h-3"/>
             <span>{user.email}</span>
           </div>
        </div>
        <div className="opacity-40 hover:opacity-100 transition-opacity flex items-center gap-2 font-bold tracking-widest text-[10px] text-rabbi-blue">
          <BookOpen className="w-3 h-3 text-rabbi-gold" />
          <span>L'SHEM SHAMAYIM</span>
        </div>
      </footer>
    </div>
  );
}
