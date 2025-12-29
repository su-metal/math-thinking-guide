
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AppScreen, AnalysisResult, HistoryItem, DrillResult } from '../types';
import { analyzeMathProblem, generateDrillProblems } from '../services/geminiService';
import { 
  Camera, 
  Image as ImageIcon, 
  History, 
  Settings, 
  ChevronLeft, 
  X,
  CreditCard,
  Sparkles,
  Check,
  Lightbulb,
  ArrowDown,
  Trophy,
  Eye,
  FileText,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  Crown,
  Heart,
  LogOut,
  HelpCircle,
  BookOpen,
  ArrowRight,
  LayoutList,
  Maximize,
  ZoomIn,
  RotateCw,
  MessageCircle,
  Undo2
} from 'lucide-react';

// --- AI Teacher Illustration Component ---

type TeacherMood = 'NORMAL' | 'THINKING' | 'PRAISING' | 'SUPPORTIVE' | 'HAPPY';

const AITeacher = ({ mood = 'NORMAL', className = "" }: { mood?: TeacherMood, className?: string }) => {
  const getFace = () => {
    switch (mood) {
      case 'THINKING':
        return (
          <g>
            <path d="M35 45 Q40 42 45 45" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M55 45 Q60 42 65 45" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M45 60 Q50 55 55 60" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        );
      case 'PRAISING':
        return (
          <g>
            <path d="M30 45 Q40 35 50 45" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M50 45 Q60 35 70 45" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M35 60 Q50 75 65 60" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="20" cy="30" r="3" fill="#fbbf24" className="animate-pulse" />
            <circle cx="80" cy="35" r="4" fill="#fbbf24" className="animate-pulse" />
          </g>
        );
      case 'SUPPORTIVE':
        return (
          <g>
            <circle cx="40" cy="45" r="4" fill="currentColor" />
            <circle cx="60" cy="45" r="4" fill="currentColor" />
            <path d="M40 60 Q50 68 60 60" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        );
      case 'HAPPY':
        return (
          <g>
            <path d="M35 45 Q40 38 45 45" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M55 45 Q60 38 65 45" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M35 58 Q50 72 65 58" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        );
      default:
        return (
          <g>
            <circle cx="40" cy="45" r="3" fill="currentColor" />
            <circle cx="60" cy="45" r="3" fill="currentColor" />
            <path d="M42 62 Q50 68 58 62" stroke="currentColor" strokeWidth="3" fill="none" strokeLinecap="round" />
          </g>
        );
    }
  };

  return (
    <div className={`relative inline-block ${className} animate-bounce-slow`}>
      <svg width="100" height="100" viewBox="0 0 100 100" className="text-blue-500">
        <rect x="20" y="20" width="60" height="60" rx="20" fill="white" stroke="currentColor" strokeWidth="4" />
        <line x1="50" y1="20" x2="50" y2="5" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
        <circle cx="50" cy="5" r="5" fill="#fbbf24" stroke="currentColor" strokeWidth="2" />
        <rect x="30" y="32" width="40" height="36" rx="8" fill="#eff6ff" />
        {getFace()}
        <rect x="12" y="40" width="8" height="20" rx="4" fill="currentColor" />
        <rect x="80" y="40" width="8" height="20" rx="4" fill="currentColor" />
        <circle cx="35" cy="80" r="3" fill="#3b82f6" opacity="0.5" />
        <circle cx="65" cy="80" r="3" fill="#3b82f6" opacity="0.5" />
      </svg>
      {mood === 'PRAISING' && (
        <>
          <Sparkles className="absolute -top-4 -right-4 text-yellow-400 animate-pulse" size={24} />
          <Sparkles className="absolute -bottom-2 -left-4 text-yellow-300 animate-pulse delay-75" size={20} />
        </>
      )}
    </div>
  );
};

// --- Sub Components ---

const Header = ({ 
  title, 
  leftIcon, 
  rightIcon, 
  onLeftClick, 
  onRightClick 
}: { 
  title: string; 
  leftIcon?: React.ReactNode; 
  rightIcon?: React.ReactNode;
  onLeftClick?: () => void;
  onRightClick?: () => void;
}) => (
  <header className="flex items-center justify-between px-6 py-4 bg-white shadow-sm sticky top-0 z-50 border-b border-blue-50">
    <button onClick={onLeftClick} className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition-colors">
      {leftIcon}
    </button>
    <h1 className="text-xl font-bold text-gray-800">{title}</h1>
    <button onClick={onRightClick} className="p-2 text-blue-500 hover:bg-blue-50 rounded-full transition-colors">
      {rightIcon}
    </button>
  </header>
);

const SplashScreen = () => (
  <div className="fixed inset-0 bg-blue-500 flex flex-col items-center justify-center text-white p-6 text-center z-[999]">
    <div className="mb-6 shadow-xl">
      <AITeacher mood="HAPPY" className="scale-150" />
    </div>
    <h1 className="text-3xl font-bold mb-2 text-white">算数「考え方」ガイド</h1>
    <p className="text-blue-100 font-bold">AI先生スパッキーが「なぜ？」を教えるよ！</p>
  </div>
);

const LimitReachedModal = ({ onConfirm, onCancel }: { onConfirm: () => void, onCancel: () => void }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm">
    <div className="bg-white rounded-[2.5rem] w-full max-sm:max-w-xs p-8 flex flex-col items-center text-center shadow-2xl">
      <div className="w-20 h-20 bg-orange-50 rounded-full flex items-center justify-center mb-6">
        <AlertCircle className="w-10 h-10 text-orange-500" />
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-4">今日のぶんはおしまい！</h2>
      <p className="text-gray-500 mb-8 leading-relaxed">
        無料プランでは1日に3回まで<br />
        問題を解くことができるよ。<br />
        <span className="font-bold text-blue-500">Proプラン</span>なら、ずっと使い放題！
      </p>
      <div className="w-full space-y-3">
        <button onClick={onConfirm} className="w-full bg-blue-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg">
          Proプランについて見る
        </button>
        <button onClick={onCancel} className="w-full text-gray-400 py-2 text-sm font-medium">
          またこんどにする
        </button>
      </div>
    </div>
  </div>
);

const ProblemCropScreen = ({ 
  image, 
  onCancel, 
  onComplete 
}: { 
  image: string; 
  onCancel: () => void; 
  onComplete: (croppedImage: string) => void; 
}) => {
  const [box, setBox] = useState({ x: 10, y: 10, w: 80, h: 40 });
  const [rotation, setRotation] = useState(0); 
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const [isDragging, setIsDragging] = useState<string | null>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
    img.src = image;
  }, [image]);

  const handleStart = (e: React.MouseEvent | React.TouchEvent, type: string) => {
    setIsDragging(type);
  };

  const handleMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDragging || !imgRef.current) return;
    
    const rect = imgRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? (e as React.TouchEvent).touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? (e as React.TouchEvent).touches[0].clientY : (e as React.MouseEvent).clientY;
    
    const xPercent = ((clientX - rect.left) / rect.width) * 100;
    const yPercent = ((clientY - rect.top) / rect.height) * 100;

    setBox(prev => {
      let next = { ...prev };
      if (isDragging === 'move') {
        const dx = xPercent - (prev.x + prev.w / 2);
        const dy = yPercent - (prev.y + prev.h / 2);
        next.x = Math.max(0, Math.min(100 - prev.w, prev.x + dx));
        next.y = Math.max(0, Math.min(100 - prev.h, prev.y + dy));
      } else if (isDragging === 'br') {
        next.w = Math.max(5, Math.min(100 - prev.x, xPercent - prev.x));
        next.h = Math.max(5, Math.min(100 - prev.y, yPercent - prev.y));
      }
      return next;
    });
  };

  const handleEnd = () => setIsDragging(null);

  const rotate = () => {
    setRotation((prev) => (prev + 90) % 360);
  };

  const processCrop = () => {
    const img = new Image();
    img.onload = () => {
      const naturalWidth = img.naturalWidth;
      const naturalHeight = img.naturalHeight;

      const rotatedCanvas = document.createElement('canvas');
      if (rotation % 180 === 90) {
        rotatedCanvas.width = naturalHeight;
        rotatedCanvas.height = naturalWidth;
      } else {
        rotatedCanvas.width = naturalWidth;
        rotatedCanvas.height = naturalHeight;
      }

      const rotatedCtx = rotatedCanvas.getContext('2d');
      if (!rotatedCtx) return;

      rotatedCtx.translate(rotatedCanvas.width / 2, rotatedCanvas.height / 2);
      rotatedCtx.rotate((rotation * Math.PI) / 180);
      rotatedCtx.drawImage(img, -naturalWidth / 2, -naturalHeight / 2);

      const finalCanvas = document.createElement('canvas');
      finalCanvas.width = Math.floor((box.w * rotatedCanvas.width) / 100);
      finalCanvas.height = Math.floor((box.h * rotatedCanvas.height) / 100);
      
      const finalCtx = finalCanvas.getContext('2d');
      if (finalCtx) {
        finalCtx.imageSmoothingEnabled = true;
        finalCtx.imageSmoothingQuality = 'high';
        finalCtx.drawImage(
          rotatedCanvas,
          Math.floor((box.x * rotatedCanvas.width) / 100), Math.floor((box.y * rotatedCanvas.height) / 100),
          finalCanvas.width, finalCanvas.height,
          0, 0, finalCanvas.width, finalCanvas.height
        );
        onComplete(finalCanvas.toDataURL('image/jpeg', 0.95));
      }
    };
    img.src = image;
  };

  const isRotated90 = rotation === 90 || rotation === 270;
  const originalW = naturalSize.w || 300;
  const originalH = naturalSize.h || 400;
  const visualW = isRotated90 ? originalH : originalW;
  const visualH = isRotated90 ? originalW : originalH;

  const maxDisplayW = typeof window !== 'undefined' ? window.innerWidth * 0.92 : 300;
  const maxDisplayH = typeof window !== 'undefined' ? window.innerHeight * 0.65 : 400;
  
  const aspect = visualW / visualH;
  let displayW, displayH;

  if (aspect > maxDisplayW / maxDisplayH) {
    displayW = maxDisplayW;
    displayH = maxDisplayW / aspect;
  } else {
    displayH = maxDisplayH;
    displayW = maxDisplayH * aspect;
  }

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex flex-col z-[100] select-none overflow-hidden font-sans">
      <div className="h-16 flex justify-between items-center px-4 bg-black/80 backdrop-blur-md text-white shrink-0 border-b border-white/5">
        <button onClick={onCancel} className="p-2 hover:bg-white/10 rounded-full transition-colors"><X /></button>
        <h2 className="text-lg font-bold">問題をわくに入れてね</h2>
        <button onClick={rotate} className="p-2 text-blue-400 hover:bg-white/10 rounded-full transition-colors flex items-center gap-1.5 font-bold">
          <RotateCw size={20} /> <span className="text-xs">回転</span>
        </button>
      </div>
      
      <div 
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-none p-4"
        onMouseMove={handleMove}
        onMouseUp={handleEnd}
        onMouseLeave={handleEnd}
        onTouchMove={handleMove}
        onTouchEnd={handleEnd}
      >
        <div className="relative shadow-2xl flex items-center justify-center bg-white/5" style={{ width: displayW, height: displayH }}>
          <img 
            ref={imgRef}
            src={image} 
            className="absolute block pointer-events-none"
            style={{ 
              width: isRotated90 ? displayH : displayW, 
              height: isRotated90 ? displayW : displayH,
              transform: `rotate(${rotation}deg)`,
              transition: 'transform 0.3s ease-out'
            }}
            alt="target"
          />
          <div className="absolute inset-0 pointer-events-none" style={{
            clipPath: `polygon(0% 0%, 0% 100%, ${box.x}% 100%, ${box.x}% ${box.y}%, ${box.x + box.w}% ${box.y}%, ${box.x + box.w}% ${box.y + box.h}%, ${box.x}% ${box.y + box.h}%, ${box.x}% 100%, 100% 100%, 100% 0%)`,
            backgroundColor: 'rgba(0,0,0,0.7)'
          }}></div>
          <div 
            className="absolute border-[4px] border-blue-400 shadow-[0_0_0_2px_rgba(255,255,255,0.4)] cursor-move pointer-events-auto"
            style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%` }}
            onMouseDown={(e) => handleStart(e, 'move')}
            onTouchStart={(e) => handleStart(e, 'move')}
          >
            <div className="absolute -top-11 left-0 bg-blue-500 text-white text-[11px] px-3 py-2 rounded-t-lg font-bold flex items-center gap-1.5 whitespace-nowrap shadow-xl">
              <Check size={14} /> ここを解く！
            </div>
            <div 
              className="absolute -bottom-6 -right-6 w-14 h-14 bg-blue-500 border-4 border-white rounded-full cursor-se-resize flex items-center justify-center shadow-2xl active:scale-125 transition-transform z-20"
              onMouseDown={(e) => { e.stopPropagation(); handleStart(e, 'br'); }}
              onTouchStart={(e) => { e.stopPropagation(); handleStart(e, 'br'); }}
            >
              <div className="w-5 h-5 border-r-4 border-b-4 border-white rounded-br-sm"></div>
            </div>
          </div>
        </div>
      </div>
      
      <div className="p-8 bg-black shrink-0 flex flex-col items-center gap-4 border-t border-white/5">
        <p className="text-white/40 text-[11px] font-medium tracking-wide">※青いわくを動かして、問題をかこんでね！</p>
        <button onClick={processCrop} className="bg-blue-500 text-white px-20 py-4 rounded-full text-xl font-black shadow-[0_10px_30px_rgba(59,130,246,0.3)] active:scale-95 transition-all flex items-center gap-3">
          <Sparkles size={24} /> この問題を解く！
        </button>
      </div>
    </div>
  );
};

const App = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.SPLASH);
  const [prevScreen, setPrevScreen] = useState<AppScreen | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [drillResult, setDrillResult] = useState<DrillResult | null>(null);
  const [tempImage, setTempImage] = useState<string | null>(null);
  const [croppedImage, setCroppedImage] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [remainingTries, setRemainingTries] = useState<number>(3);
  const [isPro, setIsPro] = useState<boolean>(false);
  const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [currentDrillIndex, setCurrentDrillIndex] = useState(0);
  const [showDrillAnswer, setShowDrillAnswer] = useState(false);
  const [showFinalAnswer, setShowFinalAnswer] = useState(false);
  const [showLimitReachedModal, setShowLimitReachedModal] = useState(false);
  const [isLoadingDrills, setIsLoadingDrills] = useState(false);
  const [showFullImage, setShowFullImage] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      const isFirstTime = !localStorage.getItem('onboarded');
      if (isFirstTime) {
        setCurrentScreen(AppScreen.ONBOARDING);
      } else {
        setCurrentScreen(AppScreen.HOME);
      }
    }, 2000);

    const savedHistory = localStorage.getItem('math_history');
    if (savedHistory) setHistory(JSON.parse(savedHistory));

    const lastReset = localStorage.getItem('last_reset_date');
    const today = new Date().toLocaleDateString();
    if (lastReset !== today) {
      localStorage.setItem('last_reset_date', today);
      localStorage.setItem('remaining_tries', '3');
      setRemainingTries(3);
    } else {
      const tries = localStorage.getItem('remaining_tries');
      if (tries) setRemainingTries(parseInt(tries));
    }

    return () => clearTimeout(timer);
  }, []);

  const launchWebPage = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const saveHistory = (item: HistoryItem) => {
    const newHistory = [item, ...history].slice(0, 20);
    setHistory(newHistory);
    localStorage.setItem('math_history', JSON.stringify(newHistory));
  };

  const decreaseTries = () => {
    if (!isPro) {
      const newTries = Math.max(0, remainingTries - 1);
      setRemainingTries(newTries);
      localStorage.setItem('remaining_tries', newTries.toString());
    }
  };

  const navigateToOnboarding = () => {
    setPrevScreen(currentScreen);
    setCurrentScreen(AppScreen.ONBOARDING);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, forceCrop: boolean = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isPro && remainingTries <= 0) {
      setShowLimitReachedModal(true);
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setTempImage(base64);
      if (forceCrop) {
        setCurrentScreen(AppScreen.CROP);
      } else {
        startAnalysis(base64);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startAnalysis = async (img: string) => {
    setCroppedImage(img);
    setCurrentScreen(AppScreen.LOADING);
    setShowFinalAnswer(false);
    try {
      const result = await analyzeMathProblem(img);
      setAnalysisResult(result);
      setCurrentProblemIndex(0);
      setCurrentStepIndex(0);
      
      if (result.problems && result.problems.length > 1) {
        setCurrentScreen(AppScreen.PROBLEM_SELECT);
      } else if (result.problems && result.problems.length === 1) {
        setCurrentScreen(AppScreen.RESULT);
      } else {
        throw new Error("問題が見つかりませんでした。");
      }
      
      const historyItem: HistoryItem = { id: Date.now().toString(), timestamp: Date.now(), image: img, result };
      saveHistory(historyItem);
      decreaseTries();
    } catch (err: any) {
      alert(err.message || "エラーがおきました。");
      setCurrentScreen(AppScreen.HOME);
    }
  };

  const selectProblem = (index: number) => {
    setCurrentProblemIndex(index);
    setCurrentStepIndex(0);
    setShowFinalAnswer(false);
    setCurrentScreen(AppScreen.RESULT);
  };

  const startDrills = async () => {
    if (!isPro) { setCurrentScreen(AppScreen.PAYWALL); return; }
    if (!analysisResult?.problems[currentProblemIndex]) return;
    setIsLoadingDrills(true);
    try {
      const result = await generateDrillProblems(analysisResult.problems[currentProblemIndex].problem_text);
      setDrillResult(result);
      setCurrentDrillIndex(0);
      setShowDrillAnswer(false);
      setCurrentScreen(AppScreen.DRILL);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsLoadingDrills(false);
    }
  };

  const renderOnboarding = () => (
    <div className="min-h-screen bg-white flex flex-col items-center p-8 text-center">
      <div className="flex-1 flex flex-col items-center justify-center space-y-8">
        <AITeacher mood="SUPPORTIVE" className="scale-150" />
        <h2 className="text-3xl font-black text-gray-800">スパッキー先生の使い方</h2>
        <ul className="text-left space-y-4 text-gray-600 max-w-sm">
          <li className="flex items-start gap-4"><span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-sm">1</span><p className="font-bold">算数の問題をカメラで撮ります。</p></li>
          <li className="flex items-start gap-4"><span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-sm">2</span><p className="font-bold">解きたい問題をえらんでね。</p></li>
          <li className="flex items-start gap-4"><span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-sm">3</span><p className="font-bold">「なぜ？」を一歩ずつ教えるよ！</p></li>
        </ul>
      </div>
      <button onClick={() => { localStorage.setItem('onboarded', 'true'); setCurrentScreen(prevScreen || AppScreen.HOME); setPrevScreen(null); }} className="w-full max-w-sm bg-blue-500 text-white py-4 rounded-2xl text-xl font-black shadow-lg">いっしょにがんばろう！</button>
    </div>
  );

  const renderHome = () => (
    <div className="min-h-screen flex flex-col bg-blue-50/20">
      <Header title="AI算数ガイド" leftIcon={<History />} rightIcon={<Settings />} onLeftClick={() => setCurrentScreen(AppScreen.HISTORY)} onRightClick={() => setCurrentScreen(AppScreen.SETTINGS)} />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col items-center mb-8">
          <AITeacher mood="HAPPY" className="mb-4" />
          <div className="bg-white border-2 border-blue-100 rounded-2xl px-6 py-3 shadow-sm"><p className="text-blue-600 font-black">ぼくはスパッキーだよ。いっしょに算数をやろう！</p></div>
        </div>
        <div className="bg-white rounded-3xl p-6 shadow-sm border border-blue-50 flex items-center justify-between mb-8">
          <div className="flex items-center gap-4"><div className="bg-blue-100 p-3 rounded-2xl"><Lightbulb className="text-blue-500" /></div><div><p className="text-[10px] text-gray-400 font-black uppercase">今日ののこり</p><p className="text-lg font-black text-gray-800">{isPro ? "無制限" : `あと ${remainingTries} 回`}</p></div></div>
          {!isPro && <button onClick={() => setCurrentScreen(AppScreen.PAYWALL)} className="bg-yellow-400 text-yellow-900 px-5 py-2 rounded-full text-xs font-black">Proプランへ</button>}
        </div>
        <div className="space-y-6">
          <label className="group bg-blue-500 hover:bg-blue-600 rounded-[2.5rem] p-10 flex flex-col items-center text-white shadow-xl cursor-pointer active:scale-95">
            <Camera className="w-16 h-16 mb-4" /><span className="text-3xl font-black">自動スキャン</span>
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e)} />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="bg-white border-2 border-blue-100 rounded-[2rem] p-6 flex flex-col items-center text-blue-500 cursor-pointer active:scale-95"><ImageIcon className="mb-2" /><span>アルバム</span><input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e)} /></label>
            <label className="bg-blue-50 border-2 border-blue-200 rounded-[2rem] p-6 flex flex-col items-center text-blue-600 cursor-pointer active:scale-95"><Maximize className="mb-2" /><span>わくで囲む</span><input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e, true)} /></label>
          </div>
          <button onClick={navigateToOnboarding} className="w-full flex justify-center items-center gap-2 text-gray-400 font-bold"><HelpCircle size={18} /><span>使いかたガイド</span></button>
        </div>
      </main>
      {showLimitReachedModal && <LimitReachedModal onConfirm={() => { setShowLimitReachedModal(false); setCurrentScreen(AppScreen.PAYWALL); }} onCancel={() => setShowLimitReachedModal(false)} />}
    </div>
  );

  const renderLoading = () => (
    <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-white rounded-[2rem] shadow-2xl mb-10 p-4 border-4 border-white max-w-[80vw]">
        {croppedImage && <img src={croppedImage} className="rounded-xl w-auto h-auto max-h-[40vh]" alt="cropped" />}
      </div>
      <AITeacher mood="THINKING" className="scale-125 mb-6" />
      <h2 className="text-2xl font-black text-gray-800 mb-2">スパッキー先生が考え中...</h2>
    </div>
  );

  const renderProblemSelect = () => {
    if (!analysisResult) return null;
    return (
      <div className="min-h-screen bg-blue-50 flex flex-col">
        <Header title="どの問題を解く？" leftIcon={<X />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
        <main className="flex-1 flex flex-col p-6 items-center justify-center">
          <AITeacher mood="HAPPY" className="mb-4" />
          <div className="w-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-6 px-4 pb-8">
            {analysisResult.problems.map((p, idx) => (
              <div key={idx} className="snap-center shrink-0 w-[85vw] max-w-sm bg-white rounded-[2.5rem] shadow-xl p-8 flex flex-col border-b-8 border-blue-400">
                <div className="bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold mb-4">{idx + 1}</div>
                <div className="flex-1 overflow-y-auto mb-8 bg-gray-50 p-6 rounded-3xl border border-dashed border-gray-200"><p className="text-gray-700 font-black">{p.problem_text}</p></div>
                <button onClick={() => selectProblem(idx)} className="w-full bg-blue-500 text-white py-5 rounded-2xl font-black text-lg active:scale-95">この問題を解く！</button>
              </div>
            ))}
          </div>
        </main>
      </div>
    );
  };

  const renderResult = () => {
    if (!analysisResult?.problems[currentProblemIndex]) return null;
    const problem = analysisResult.problems[currentProblemIndex];
    const isFinishedSteps = currentStepIndex === problem.steps.length;
    
    if (isFinishedSteps) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Header title="おめでとう！" leftIcon={<X />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
          <main className="flex-1 flex flex-col p-6 items-center justify-center">
            <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-xl p-8 flex flex-col items-center border-b-8 border-yellow-400">
              {!showFinalAnswer ? (
                <>
                  <AITeacher mood="PRAISING" className="scale-125 mb-6" />
                  <h3 className="text-2xl font-black text-gray-800 mb-4">最後まで考えられたね！</h3>
                  <button onClick={() => setShowFinalAnswer(true)} className="w-full bg-blue-500 text-white py-5 rounded-2xl font-black text-lg active:scale-95 mb-3">答えを見る！</button>
                  <button onClick={() => setCurrentStepIndex(problem.steps.length - 1)} className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black active:scale-95">解説にもどる</button>
                </>
              ) : (
                <div className="w-full text-center">
                  <AITeacher mood="PRAISING" className="scale-125 mb-6" />
                  <h3 className="text-xl font-black text-gray-400 mb-2">さいごの答え</h3>
                  <div className="bg-green-50 p-6 rounded-[2rem] border-4 border-green-200 mb-8"><p className="text-3xl font-black text-green-700">{problem.final_answer}</p></div>
                  <button onClick={startDrills} disabled={isLoadingDrills} className="w-full bg-indigo-500 text-white py-5 rounded-2xl font-black text-lg active:scale-95 mb-3">{isLoadingDrills ? <RefreshCw className="animate-spin m-auto" /> : "類題をやってみる！"}</button>
                  <button onClick={() => setCurrentScreen(AppScreen.HOME)} className="w-full text-gray-400 font-black">ホームにもどる</button>
                </div>
              )}
            </div>
          </main>
        </div>
      );
    }

    const currentStep = problem.steps[currentStepIndex];
    const prevStep = currentStepIndex > 0 ? problem.steps[currentStepIndex - 1] : null;
    const isLastStep = currentStepIndex === problem.steps.length - 1;

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header title="スパッキーのガイド" leftIcon={<X />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
        <main className="flex-1 flex flex-col p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4"><p className="text-[10px] font-black text-gray-400 mb-1">問題</p><p className="text-sm font-bold">{problem.problem_text}</p></div>
          <div className="flex-1 flex flex-col justify-center items-center">
            <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-xl p-8 flex flex-col border-b-8 border-blue-400">
              <div onClick={() => setShowFullImage(true)} className="relative h-28 w-full bg-gray-100 rounded-2xl overflow-hidden mb-4"><img src={croppedImage || ""} className="h-full w-full object-contain" alt="figure" /><Maximize className="absolute bottom-2 right-2" size={12} /></div>
              {prevStep && <div className="mb-6 bg-blue-50 rounded-2xl p-4 border border-blue-100"><p className="text-[10px] font-black text-blue-400">前のステップ</p><p className="text-sm font-black text-blue-700">{prevStep.solution}</p></div>}
              <div className="flex items-center justify-between mb-4"><span className="px-5 py-1 rounded-full text-sm font-black bg-blue-500 text-white">ステップ {currentStepIndex + 1}</span><AITeacher mood="SUPPORTIVE" className="scale-75" /></div>
              <div className="flex-1 bg-white p-6 rounded-[2rem] border-2 border-dashed border-blue-100 flex items-center justify-center text-center"><p className="text-xl font-black text-gray-800">{currentStep.hint}</p></div>
              <div className="mt-8 flex gap-3">
                <button onClick={() => currentStepIndex > 0 ? setCurrentStepIndex(currentStepIndex - 1) : setCurrentScreen(AppScreen.HOME)} className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black">もどる</button>
                <button onClick={() => setCurrentStepIndex(currentStepIndex + 1)} className="flex-[2] bg-blue-500 text-white py-4 rounded-2xl font-black shadow-lg">{isLastStep ? "答え合わせ！" : "次へ！"}</button>
              </div>
            </div>
          </div>
        </main>
        {showFullImage && <div className="fixed inset-0 z-[150] bg-black/95 flex flex-col p-4"><button onClick={() => setShowFullImage(false)} className="self-end text-white p-3"><X /></button><img src={croppedImage || ""} className="flex-1 object-contain" alt="full" /></div>}
      </div>
    );
  };

  const renderDrill = () => {
    if (!drillResult) return null;
    const drill = drillResult.problems[currentDrillIndex];
    return (
      <div className="min-h-screen bg-indigo-50 flex flex-col">
        <Header title="特訓" leftIcon={<X />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
        <main className="flex-1 p-6 flex flex-col items-center">
          <div className="w-full max-w-md bg-white rounded-[2.5rem] shadow-xl p-8 flex flex-col border-b-8 border-indigo-400">
            <p className="bg-indigo-500 text-white px-3 py-1 rounded-full text-xs font-black self-start mb-4">チャレンジ {currentDrillIndex + 1}</p>
            <p className="text-xl font-black text-gray-800 text-center mb-6">{drill.question}</p>
            {showDrillAnswer ? (
              <div className="space-y-4">
                <div className="bg-green-50 p-6 rounded-2xl border-4 border-green-200 text-center"><p className="text-2xl font-black text-green-700">{drill.answer}</p></div>
                <div className="bg-blue-50 p-6 rounded-2xl text-sm font-bold border border-blue-100"><p>{drill.explanation}</p></div>
                <button onClick={() => currentDrillIndex < 2 ? (setCurrentDrillIndex(currentDrillIndex + 1), setShowDrillAnswer(false)) : setCurrentScreen(AppScreen.HOME)} className="w-full bg-green-500 text-white py-5 rounded-2xl font-black">{currentDrillIndex < 2 ? "次へ！" : "終わり"}</button>
              </div>
            ) : <button onClick={() => setShowDrillAnswer(true)} className="w-full bg-indigo-500 text-white py-5 rounded-2xl font-black">答えあわせ</button>}
          </div>
        </main>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header title="これまでのきろく" leftIcon={<ChevronLeft />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
      <main className="p-4 space-y-4 flex-1 overflow-y-auto">
        {history.length === 0 ? <p className="text-center text-gray-400 pt-20">まだきろくがないよ</p> : history.map(item => (
          <button key={item.id} onClick={() => { setAnalysisResult(item.result); setCroppedImage(item.image); setCurrentProblemIndex(0); setCurrentStepIndex(0); setCurrentScreen(AppScreen.RESULT); }} className="w-full bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm text-left">
            <img src={item.image} className="h-16 w-16 object-contain bg-gray-50 rounded-xl" alt="history" />
            <div className="flex-1 min-w-0"><p className="text-[10px] text-gray-400">{new Date(item.timestamp).toLocaleDateString()}</p><p className="text-sm font-black truncate">{item.result.problems[0]?.problem_text}</p></div>
            <ChevronLeft className="rotate-180 text-gray-300" />
          </button>
        ))}
      </main>
    </div>
  );

  const renderSettings = () => (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header title="せってい" leftIcon={<ChevronLeft />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
      <main className="p-6 space-y-4">
        <button onClick={() => setCurrentScreen(AppScreen.PAYWALL)} className="w-full bg-white p-6 rounded-3xl flex items-center justify-between shadow-sm"><div className="flex items-center gap-4"><CreditCard className="text-yellow-500" /><div><p className="font-black">プラン確認</p></div></div><ChevronLeft className="rotate-180 text-gray-300" /></button>
        <button onClick={() => navigateToOnboarding()} className="w-full bg-white p-6 rounded-3xl flex items-center justify-between shadow-sm"><div className="flex items-center gap-4"><HelpCircle className="text-blue-500" /><div><p className="font-black">使いかたガイド</p></div></div><ChevronLeft className="rotate-180 text-gray-300" /></button>
      </main>
    </div>
  );

  const renderPaywall = () => (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="bg-blue-500 text-white p-8 text-center"><AITeacher mood="HAPPY" className="mb-4" /><h2 className="text-2xl font-black">Proプラン</h2><p>算数をもっとたのしく！</p></div>
      <main className="p-8 flex-1 flex flex-col justify-between">
        <div className="space-y-4"><div className="flex items-center gap-4 bg-blue-50 p-4 rounded-2xl"><Check className="text-blue-500" /><p className="font-black">制限なしで使い放題</p></div><div className="flex items-center gap-4 bg-blue-50 p-4 rounded-2xl"><Check className="text-blue-500" /><p className="font-black">類題ドリルで特訓</p></div></div>
        <button onClick={() => { setIsPro(true); setCurrentScreen(AppScreen.HOME); }} className="w-full bg-blue-500 text-white py-5 rounded-2xl text-xl font-black">¥480 / 月 で登録</button>
      </main>
    </div>
  );

  switch (currentScreen) {
    case AppScreen.SPLASH: return <SplashScreen />;
    case AppScreen.ONBOARDING: return renderOnboarding();
    case AppScreen.HOME: return renderHome();
    case AppScreen.CROP: return tempImage ? <ProblemCropScreen image={tempImage} onCancel={() => setCurrentScreen(AppScreen.HOME)} onComplete={startAnalysis} /> : null;
    case AppScreen.LOADING: return renderLoading();
    case AppScreen.PROBLEM_SELECT: return renderProblemSelect();
    case AppScreen.RESULT: return renderResult();
    case AppScreen.DRILL: return renderDrill();
    case AppScreen.HISTORY: return renderHistory();
    case AppScreen.SETTINGS: return renderSettings();
    case AppScreen.PAYWALL: return renderPaywall();
    default: return renderHome();
  }
};

export default App;
