/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

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
  User,
  Quote
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import confetti from 'canvas-confetti';

import { Language, AnalysisResult, ChatMessage, FileData } from './types.ts';
import { UI_LABELS } from './constants.ts';
import { analyzeText, chatWithRabbi } from './services/geminiService.ts';

export default function App() {
  const [language, setLanguage] = useState<Language | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const [currentFile, setCurrentFile] = useState<FileData | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0 || !language) return;
    
    const file = acceptedFiles[0];
    const reader = new FileReader();
    
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const fileData: FileData = {
        base64,
        mimeType: file.type || 'application/pdf',
        name: file.name
      };
      
      setCurrentFile(fileData);
      processFile(fileData);
    };
    
    reader.readAsDataURL(file);
  }, [language]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ 
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png'],
      'application/pdf': ['.pdf']
    },
    multiple: false
  });

  const processFile = async (fileData: FileData) => {
    if (!language) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeText(fileData, language);
      setAnalysis(result);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#1e3a8a', '#b45309']
      });
    } catch (error) {
      console.error(error);
      alert(error?.message || error?.toString() || UI_LABELS[language].error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const startCamera = async () => {
    setIsCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
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
    
    // We want a vertical rectangle (3:4 aspect ratio)
    const targetAspect = 3 / 4;
    let width = video.videoWidth;
    let height = video.videoHeight;
    let sx = 0;
    let sy = 0;
    let sWidth = width;
    let sHeight = height;

    if (width / height > targetAspect) {
      // Source is wider than target (landscape) - crop sides
      sWidth = height * targetAspect;
      sx = (width - sWidth) / 2;
    } else {
      // Source is taller than target - crop top/bottom
      sHeight = width / targetAspect;
      sy = (height - sHeight) / 2;
    }

    canvas.width = sWidth;
    canvas.height = sHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
    }
    
    const base64 = canvas.toDataURL('image/jpeg').split(',')[1];
    const fileData: FileData = {
      base64,
      mimeType: 'image/jpeg',
      name: 'camera_capture.jpg'
    };
    
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
      setChatHistory([...newHistory, { role: 'assistant', content: rabbiResponse }]);
    } catch (error) {
      console.error(error);
      alert(UI_LABELS[language].error);
    } finally {
      setIsSending(false);
    }
  };

  const resetStudy = () => {
    setAnalysis(null);
    setChatHistory([]);
    setCurrentFile(null);
  };

  if (!language) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-xl w-full bg-white rounded-2xl shadow-xl p-8 border border-rabbi-gold/20"
        >
          <div className="flex justify-center mb-8">
            <div className="p-4 bg-rabbi-blue rounded-full">
              <BookOpen className="w-12 h-12 text-rabbi-cream shadow-sm" />
            </div>
          </div>
          
          <h1 className="text-4xl font-serif font-bold text-center text-rabbi-blue mb-2">Daf Rabbi</h1>
          <p className="text-slate-600 text-center mb-10 text-lg">Study Gemara and Torah with an Orthodox Rabbi AI</p>
          
          <div className="space-y-4">
            <p className="text-center text-rabbi-gold font-medium flex items-center justify-center gap-2">
              <Languages className="w-5 h-5" />
              Choose your study language
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
                  className="p-4 border-2 border-slate-100 rounded-xl hover:border-rabbi-blue hover:bg-rabbi-blue/5 transition-all text-left font-medium text-slate-700 flex items-center justify-between group"
                >
                  {lang.label}
                  <div className="w-2 h-2 rounded-full bg-transparent group-hover:bg-rabbi-blue transition-colors" />
                </button>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  const labels = UI_LABELS[language];

  return (
    <div className="min-h-screen flex flex-col max-w-6xl mx-auto p-4 md:p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8 border-b border-rabbi-gold/20 pb-4">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { setLanguage(null); resetStudy(); }}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-500"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-2xl md:text-3xl font-serif font-bold text-rabbi-blue">{labels.title}</h1>
            <p className="text-xs md:text-sm text-rabbi-gold font-medium uppercase tracking-widest">{labels.subtitle}</p>
          </div>
        </div>
        
        {analysis && (
          <button 
            onClick={resetStudy}
            className="flex items-center gap-2 px-4 py-2 bg-rabbi-gold/10 text-rabbi-gold rounded-full hover:bg-rabbi-gold/20 transition-all font-medium text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden sm:inline">{labels.reset}</span>
          </button>
        )}
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
                <div className="relative w-full max-w-md aspect-[3/4] bg-black rounded-3xl overflow-hidden border-4 border-rabbi-blue shadow-2xl">
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  <div className="absolute inset-0 border-2 border-white/20 pointer-events-none m-4 rounded-xl" />
                  <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-4">
                    <button 
                      onClick={stopCamera}
                      className="px-6 py-3 bg-white/20 backdrop-blur-md text-white rounded-full hover:bg-white/30 transition-all font-bold"
                    >
                      {labels.back}
                    </button>
                    <button 
                      onClick={capturePhoto}
                      className="px-8 py-3 bg-rabbi-gold text-white rounded-full hover:bg-rabbi-gold-dark shadow-lg transform active:scale-95 transition-all font-bold flex items-center gap-2"
                    >
                      <Camera className="w-5 h-5" />
                      Capture
                    </button>
                  </div>
                </div>
              ) : (
                <div className="w-full max-w-2xl flex flex-col gap-4">
                  <div 
                    {...getRootProps()} 
                    className={`
                      border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all h-[400px] flex flex-col items-center justify-center
                      ${isDragActive ? 'border-rabbi-blue bg-rabbi-blue/5' : 'border-slate-200 bg-white hover:border-rabbi-gold hover:bg-rabbi-gold/5'}
                    `}
                  >
                    <input {...getInputProps()} />
                    <div className="w-20 h-20 bg-rabbi-blue/10 rounded-full flex items-center justify-center mb-6 text-rabbi-blue">
                      <Upload className="w-10 h-10" />
                    </div>
                    <p className="text-xl font-serif text-slate-700 max-w-sm mb-4">
                      {labels.uploadPrompt}
                    </p>
                    <p className="text-sm text-slate-400">PDF, PNG, JPG (up to 10MB)</p>
                  </div>
                  
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-slate-400 font-medium text-sm">OR</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  <button 
                    onClick={startCamera}
                    className="w-full py-6 bg-rabbi-blue text-white rounded-3xl hover:bg-rabbi-blue/90 shadow-xl flex items-center justify-center gap-3 transition-all transform hover:-translate-y-1 active:translate-y-0"
                  >
                    <Camera className="w-6 h-6" />
                    <span className="text-xl font-medium">{labels.cameraPrompt}</span>
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
              <div className="relative mb-8">
                <Loader2 className="w-16 h-16 text-rabbi-blue animate-spin" />
                <BookOpen className="w-8 h-8 text-rabbi-gold absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-2xl font-serif text-rabbi-blue animate-pulse">{labels.analyzing}</p>
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
              <div className="lg:col-span-8 bg-white border border-rabbi-gold/20 rounded-3xl shadow-sm overflow-hidden flex flex-col h-[70vh] lg:h-[80vh]">
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-2">
                    <Quote className="w-5 h-5 text-rabbi-gold" />
                    <span className="font-serif font-bold text-rabbi-blue">Rabbi's Explanation</span>
                  </div>
                  {currentFile && (
                    <div className="text-xs px-3 py-1 bg-white border border-slate-200 rounded-full text-slate-500 font-mono">
                      {currentFile.name}
                    </div>
                  )}
                </div>
                <div className="flex-1 p-8 md:p-10 overflow-auto scroll-smooth">
                   <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {analysis.text}
                    </ReactMarkdown>
                  </div>
                </div>
              </div>

              {/* Chat Sidebar */}
              <div className="lg:col-span-4 flex flex-col h-[60vh] lg:h-[80vh]">
                <div className="flex-1 bg-rabbi-blue rounded-3xl shadow-2xl p-6 flex flex-col overflow-hidden">
                   <div className="flex items-center gap-2 text-rabbi-cream/90 mb-6 border-b border-white/10 pb-4">
                    <MessageSquare className="w-5 h-5" />
                    <h3 className="font-serif font-bold text-lg">Interactive Dialogue</h3>
                  </div>

                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {chatHistory.length === 0 && (
                      <div className="text-white/50 text-center py-10 italic">
                        The Rabbi awaits your inquiries about this text.
                      </div>
                    )}
                    {chatHistory.map((msg, i) => (
                      <div 
                        key={i} 
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                      >
                        <div className={`
                          max-w-[85%] p-4 rounded-2xl text-sm leading-relaxed
                          ${msg.role === 'user' 
                            ? 'bg-rabbi-gold text-white rounded-tr-none' 
                            : 'bg-white/10 text-rabbi-cream rounded-tl-none border border-white/5 shadow-inner'}
                        `}>
                          <div className="flex items-center gap-2 mb-1 opacity-60">
                            {msg.role === 'user' ? <User className="w-3 h-3" /> : <Quote className="w-3 h-3" />}
                            <span className="text-[10px] uppercase font-bold tracking-widest">
                              {msg.role === 'user' ? 'Study Guest' : 'The Rabbi'}
                            </span>
                          </div>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isSending && (
                      <div className="flex items-center gap-2 text-white/50 animate-pulse text-xs pl-2">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Rabbi is thinking...
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={handleSendMessage} className="mt-6 relative">
                    <input 
                      type="text" 
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      placeholder={labels.askQuestion}
                      className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-5 pr-14 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-rabbi-gold/50 transition-all font-serif"
                    />
                    <button 
                      type="submit"
                      disabled={isSending || !inputValue.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-rabbi-gold text-white rounded-xl hover:bg-rabbi-gold-dark disabled:opacity-50 disabled:grayscale transition-all shadow-lg active:scale-95"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </form>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="mt-8 text-center text-slate-400 text-xs py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
           {language && (
            <div className="flex items-center gap-1 opacity-70">
              <Languages className="w-3 h-3" />
              <span>{language.toUpperCase()}</span>
            </div>
           )}
        </div>
        <div className="opacity-50 hover:opacity-100 transition-opacity flex items-center gap-1">
          <BookOpen className="w-3 h-3" />
          <span>L'shem Shamayim</span>
        </div>
      </footer>

      {/* Camera modal/overlay backdrop fix if needed - here we use inline */}
    </div>
  );
}

