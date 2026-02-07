'use client';

import React, { useState, useEffect, useRef } from 'react';
import { AppScreen, AnalysisResult, HistoryItem, DrillProblem, DrillResult, MathProblem, ReadResult } from './types';
import { readMathProblem, solveMathProblem, generateDrillProblems } from './services/geminiService';
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

const isQuotaExceededError = (error: unknown): boolean => {
  if (typeof error === 'object' && error !== null) {
    if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
      return /Quota/.test(error.name);
    }
    const errName = (error as { name?: string }).name;
    return typeof errName === 'string' && /quota/i.test(errName);
  }
  return false;
};

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name;
  return name === 'AbortError';
};

const STORAGE_KEY = 'math_history';
const MAX_ITEMS = 3;
const MAX_BYTES = 1_500_000;
const MAX_TEXT_CHARS = 180;
const FALLBACK_SPACKY = 'まず情報を整理して、同じ基準で比べられる形を考えてみよう。';

const getByteSize = (value: string) => {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
};

const truncateText = (value: string | undefined, maxChars: number) => {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars)}…` : text;
};

// HistoryItem shape (source):
// { id, timestamp, image(base64), result:{ status, problems:[{problem_text, spacky_thinking, steps, final_answer}], meta, _debug } }
const toStorable = (item: HistoryItem, fallbackId: string): HistoryItem => {
  const problem = item?.result?.problems?.[0];
  const storableProblem = {
    id: problem?.id ?? 'p1',
    problem_text: truncateText(problem?.problem_text, MAX_TEXT_CHARS),
    spacky_thinking: truncateText(problem?.spacky_thinking, MAX_TEXT_CHARS) || FALLBACK_SPACKY,
    steps: [],
    final_answer: truncateText(problem?.final_answer, MAX_TEXT_CHARS),
  };

  return {
    id: item?.id ?? fallbackId,
    timestamp: typeof item?.timestamp === 'number' ? item.timestamp : Date.now(),
    image: '',
    result: {
      status: item?.result?.status ?? 'success',
      problems: [storableProblem],
      meta: item?.result?.meta,
    },
    allProblems: item.allProblems,
  };
};

const needsMigration = (item: HistoryItem): boolean => {
  if (typeof item?.image === 'string' && item.image.startsWith('data:')) return true;
  if (item?.result?._debug) return true;
  const problems = item?.result?.problems;
  if (Array.isArray(problems) && problems.length > 1) return true;
  if (Array.isArray(problems) && problems.some((p) => (p?.steps?.length ?? 0) > 0)) return true;
  return false;
};

const trimToLimits = (items: HistoryItem[]) => {
  let trimmed = items.slice(0, MAX_ITEMS);
  while (trimmed.length > 0 && getByteSize(JSON.stringify(trimmed)) > MAX_BYTES) {
    trimmed = trimmed.slice(0, trimmed.length - 1);
  }
  return trimmed;
};

const saveHistoryLocal = (items: HistoryItem[]): HistoryItem[] => {
  if (items.length === 0) {
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }

  const storable = items.map((item, index) => toStorable(item, `h_${Date.now()}_${index}`));
  const limits = [MAX_ITEMS, 2, 1];
  for (const limit of limits) {
    const candidate = trimToLimits(storable.slice(0, limit));
    if (candidate.length === 0) continue;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(candidate));
      return candidate;
    } catch (error) {
      console.error(`Failed to persist math_history (limit ${limit})`, error);
      if (!isQuotaExceededError(error)) {
        return candidate;
      }
    }
  }

  localStorage.removeItem(STORAGE_KEY);
  return [];
};

const loadHistoryLocal = (): HistoryItem[] => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    let migrated = false;
    const normalized = parsed.map((item, index) => {
      const typed = item as HistoryItem;
      if (needsMigration(typed)) migrated = true;
      return toStorable(typed, `h_${Date.now()}_${index}`);
    });
    if (migrated) {
      return saveHistoryLocal(normalized);
    }
    return normalized;
  } catch (error) {
    console.error('Failed to parse saved math_history', error);
    localStorage.removeItem(STORAGE_KEY);
    return [];
  }
};

const saveHistory = (items: HistoryItem[]): HistoryItem[] => {
  // TODO: swap to DB for Pro plan
  return saveHistoryLocal(items);
};

const loadHistory = (): HistoryItem[] => {
  // TODO: swap to DB for Pro plan
  return loadHistoryLocal();
};


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
      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .animate-bounce-slow {
          animation: bounce-slow 3s ease-in-out infinite;
        }
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow {
          animation: spin-slow 8s linear infinite;
        }
      `}</style>
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

// --- Components ---

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
  <div className="fixed inset-0 bg-blue-500 flex flex-col items-center justify-center text-white p-6 text-center animate-in fade-in duration-700">
    <div className="mb-6 shadow-xl">
      <AITeacher mood="HAPPY" className="scale-150" />
    </div>
    <h1 className="text-3xl font-bold mb-2 text-white">算数「考え方」ガイド</h1>
    <p className="text-blue-100 font-bold">AI先生スパッキーが「なぜ？」を教えるよ！</p>
  </div>
);

const LimitReachedModal = ({ onConfirm, onCancel }: { onConfirm: () => void, onCancel: () => void }) => (
  <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-white rounded-[2.5rem] w-full max-sm:max-w-xs p-8 flex flex-col items-center text-center shadow-2xl animate-in zoom-in-95 duration-300">
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
        <button
          onClick={onConfirm}
          className="w-full bg-blue-500 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-blue-100 active:scale-95 transition-all"
        >
          Proプランについて見る
        </button>
        <button
          onClick={onCancel}
          className="w-full text-gray-400 py-2 text-sm font-medium hover:text-gray-600 transition-colors"
        >
          またこんどにする
        </button>
      </div>
    </div>
  </div>
);

// --- Crop Component ---
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
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

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

  // Calculate visual constraints to maintain aspect ratio perfectly
  const isRotated90 = rotation === 90 || rotation === 270;
  const originalW = naturalSize.w || 300;
  const originalH = naturalSize.h || 400;

  // Actual visual dimensions as they appear on the screen
  const visualW = isRotated90 ? originalH : originalW;
  const visualH = isRotated90 ? originalW : originalH;

  const maxDisplayW = window.innerWidth * 0.92;
  const maxDisplayH = window.innerHeight * 0.65;

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
        <div
          className="relative shadow-2xl transition-all duration-300 ease-out flex items-center justify-center bg-white/5"
          style={{ width: displayW, height: displayH }}
        >
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
          {/* Interaction layer overlaying the visual representation */}
          <div className="absolute inset-0 pointer-events-none" style={{
            clipPath: `polygon(0% 0%, 0% 100%, ${box.x}% 100%, ${box.x}% ${box.y}%, ${box.x + box.w}% ${box.y}%, ${box.x + box.w}% ${box.y + box.h}%, ${box.x}% ${box.y + box.h}%, ${box.x}% 100%, 100% 100%, 100% 0%)`,
            backgroundColor: 'rgba(0,0,0,0.7)'
          }}></div>
          <div
            className="absolute border-[4px] border-blue-400 shadow-[0_0_0_2px_rgba(255,255,255,0.4)] cursor-move pointer-events-auto"
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.w}%`,
              height: `${box.h}%`,
              boxShadow: isDragging ? '0 0 60px rgba(59, 130, 246, 0.9)' : 'none'
            }}
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
        <button
          onClick={processCrop}
          className="bg-blue-500 text-white px-20 py-4 rounded-full text-xl font-black shadow-[0_10px_30px_rgba(59,130,246,0.3)] active:scale-95 transition-all flex items-center gap-3"
        >
          <Sparkles size={24} /> この問題を解く！
        </button>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [currentScreen, setCurrentScreen] = useState<AppScreen>(AppScreen.SPLASH);
  const [prevScreen, setPrevScreen] = useState<AppScreen | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [analysisPhase, setAnalysisPhase] = useState<"idle" | "reading" | "read_done" | "solving" | "done" | "error">("idle");
  const [readProblemText, setReadProblemText] = useState<string | null>(null);
  const [readProblems, setReadProblems] = useState<ReadResult["problems"] | null>(null);
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
  const [showPrevCalc, setShowPrevCalc] = useState(false);
  const requestIdRef = useRef(0);
  const readAbortRef = useRef<AbortController | null>(null);
  const solveAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setShowPrevCalc(false);
  }, [currentStepIndex]);


  useEffect(() => {
    const timer = setTimeout(() => {
      const isFirstTime = !localStorage.getItem('onboarded');
      if (isFirstTime) {
        setCurrentScreen(AppScreen.ONBOARDING);
      } else {
        setCurrentScreen(AppScreen.HOME);
      }
    }, 2000);

    const historyFromStorage = loadHistory();
    setHistory(historyFromStorage);

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
    try {
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('URLを開けませんでした:', error);
      alert('ページを開くことができませんでした。');
    }
  };

  const appendHistoryItem = (item: HistoryItem) => {
    setHistory((prev) => {
      const combined = [item, ...prev];
      return saveHistory(combined);
    });
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
    setAnalysisResult(null);
    setReadProblemText(null);
    setReadProblems(null);
    setAnalysisPhase("reading");

    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    readAbortRef.current?.abort();
    solveAbortRef.current?.abort();

    try {
      const readController = new AbortController();
      readAbortRef.current = readController;
      const readResult = await readMathProblem(img, readController.signal);
      if (requestIdRef.current !== requestId) return;

      const extractedProblems = Array.isArray(readResult.problems) ? readResult.problems : [];
      if (extractedProblems.length === 0) {
        throw new Error("問題が見つかりませんでした。もっと明るい場所で、問題を大きく撮ってみてね。");
      }

      setReadProblemText(extractedProblems[0]?.problem_text ?? null);
      setReadProblems(extractedProblems);
      setAnalysisPhase("read_done");
      setCurrentScreen(AppScreen.PROBLEM_SELECT);
    } catch (err: any) {
      if (isAbortError(err)) {
        return;
      }
      setAnalysisPhase("error");
      alert(err.message || "エラーがおきました。もういちど試してね。");
      setCurrentScreen(AppScreen.HOME);
    }
  };

  const selectProblem = async (index: number) => {
    const selectableProblems =
      readProblems ?? (analysisResult ? analysisResult.problems : []);
    const selected = selectableProblems[index];
    if (!selected) return;

    // もし抽出された問題リストがある場合（スキャン直後や完了画面から戻った場合）
    if (readProblems) {
      const currentSolvedText = analysisResult?.problems?.[0]?.problem_text;
      const needsSolve = !analysisResult || currentSolvedText !== selected.problem_text;

      if (needsSolve) {
        setReadProblemText(selected.problem_text);
        setAnalysisPhase("solving");
        setCurrentScreen(AppScreen.LOADING);

        const solveController = new AbortController();
        solveAbortRef.current = solveController;

        try {
          const result = await solveMathProblem(selected.problem_text, undefined, solveController.signal);
          console.log("[debug] before setAnalysisResult method_hint", result?.problems?.[0]?.method_hint);
          setAnalysisResult(result);
          setCurrentProblemIndex(0); // solveResultは常に1件
          setCurrentStepIndex(0);
          setAnalysisPhase("done");
          setCurrentScreen(AppScreen.RESULT);

          const historyItem: HistoryItem = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            image: croppedImage ?? "",
            result: result,
            allProblems: readProblems ?? []
          };
          console.log("[debug] before save history method_hint", historyItem?.result?.problems?.[0]?.method_hint);
          appendHistoryItem(historyItem);
          decreaseTries();
        } catch (err: any) {
          if (isAbortError(err)) {
            return;
          }
          setAnalysisPhase("error");
          alert(err.message || "エラーがおきました。もういちど試してね。");
          setCurrentScreen(AppScreen.HOME);
        }
        return;
      } else {
        // すでに解かれている問題ならそのまま表示
        setCurrentProblemIndex(0);
      }
    } else {
      // 履歴から直接開く場合など
      setCurrentProblemIndex(index);
    }

    setCurrentStepIndex(0);
    setShowFinalAnswer(false);
    setCurrentScreen(AppScreen.RESULT);
  };

  const startDrills = async () => {
    if (!isPro) {
      setCurrentScreen(AppScreen.PAYWALL);
      return;
    }
    if (!analysisResult || !analysisResult.problems[currentProblemIndex]) return;

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

  function ThoughtBlockYellow({
    title,
    text,
  }: {
    title: string;
    text: string;
  }) {
    return (
      <div className="rounded-[1.6rem] border-2 border-amber-200 bg-amber-50 shadow-[0_12px_30px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="p-5 relative">
          {/* watermark */}
          <div className="absolute top-3 right-4 opacity-15 text-amber-500">
            <Lightbulb className="w-16 h-16" />
          </div>

          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-sm">
              <Lightbulb className="w-5 h-5" />
            </div>
            <p className="text-sm font-black text-amber-800">{title}</p>
          </div>

          <p className="text-[15px] font-black leading-relaxed text-amber-900">
            {text}
          </p>
        </div>
      </div>
    );
  }


  const renderOnboarding = () => (
    <div className="min-h-screen bg-white flex flex-col items-center p-8 text-center animate-in fade-in duration-500">
      <div className="flex-1 flex flex-col items-center justify-center space-y-8">
        <div className="w-48 h-48 bg-blue-50 rounded-full flex items-center justify-center mb-4">
          <AITeacher mood="SUPPORTIVE" className="scale-150" />
        </div>
        <h2 className="text-3xl font-black text-gray-800">スパッキー先生の使い方</h2>
        <ul className="text-left space-y-4 text-gray-600 max-w-sm">
          <li className="flex items-start gap-4">
            <span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-sm">1</span>
            <p className="font-bold">算数の問題をカメラで撮ります。スパッキーが自動で読み取るよ！</p>
          </li>
          <li className="flex items-start gap-4">
            <span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-sm">2</span>
            <p className="font-bold">問題がたくさん写ったら、解きたい問題をえらんでね。</p>
          </li>
          <li className="flex items-start gap-4">
            <span className="bg-blue-500 text-white w-7 h-7 rounded-full flex items-center justify-center shrink-0 font-bold text-sm">3</span>
            <p className="font-bold">「なぜ？」という考え方を一歩ずつ教えてくれるよ！</p>
          </li>
        </ul>
      </div>
      <button onClick={() => {
        localStorage.setItem('onboarded', 'true');
        setCurrentScreen(prevScreen || AppScreen.HOME);
        setPrevScreen(null);
      }} className="w-full max-w-sm bg-blue-500 text-white py-4 rounded-2xl text-xl font-black shadow-lg shadow-blue-200 hover:bg-blue-600 active:scale-95 transition-all">
        いっしょにがんばろう！
      </button>
    </div>
  );

  const renderHome = () => (
    <div className="min-h-screen flex flex-col bg-blue-50/20">
      <Header title="AI算数ガイド" leftIcon={<History />} rightIcon={<Settings />} onLeftClick={() => setCurrentScreen(AppScreen.HISTORY)} onRightClick={() => setCurrentScreen(AppScreen.SETTINGS)} />
      <main className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="min-h-full flex flex-col items-center justify-center p-6 lg:p-12">
          <div className="w-full max-w-lg flex flex-col space-y-8">
            <div className="flex flex-col items-center mb-2">
              <AITeacher mood="HAPPY" className="mb-4" />
              <div className="relative">
                <div className="bg-white border-2 border-blue-100 rounded-2xl px-6 py-3 shadow-sm relative z-10">
                  <p className="text-blue-600 font-black text-base">こんにちは！ぼくはスパッキーだよ。いっしょに算数をたのしくやろう！</p>
                </div>
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 w-4 h-4 bg-white border-l-2 border-t-2 border-blue-100 rotate-45 z-0"></div>
              </div>
            </div>

            <div className="bg-white rounded-3xl p-6 shadow-sm border border-blue-50 flex items-center justify-between relative overflow-hidden">
              <div className="flex items-center gap-4">
                <div className="bg-blue-100 p-3 rounded-2xl shrink-0"><Lightbulb className="text-blue-500" /></div>
                <div>
                  <p className="text-[10px] text-gray-400 font-black uppercase tracking-wider">今日ののこり</p>
                  <p className="text-lg font-black text-gray-800">{isPro ? "無制限だよ！" : `あと ${remainingTries} 回`}</p>
                </div>
              </div>
              {!isPro && (
                <button
                  onClick={() => setCurrentScreen(AppScreen.PAYWALL)}
                  className="bg-yellow-400 text-yellow-900 px-5 py-2 rounded-full text-xs font-black shadow-sm shadow-yellow-100 hover:bg-yellow-500 transition-colors active:scale-95"
                >
                  Proプランへ
                </button>
              )}
            </div>

            <div className="flex flex-col space-y-6">
              <div className="text-center space-y-1">
                <p className="text-gray-400 font-black text-xs tracking-widest uppercase">AI先生にみせる</p>
                <h2 className="text-2xl font-black text-gray-800">問題をカメラで撮ろう！</h2>
              </div>

              <label className="group bg-blue-500 hover:bg-blue-600 transition-all rounded-[2.5rem] p-10 lg:p-16 flex flex-col items-center justify-center text-white shadow-xl shadow-blue-200 cursor-pointer active:scale-95 relative overflow-hidden">
                <Camera className="w-16 h-16 lg:w-24 lg:h-24 mb-4 group-hover:scale-110 transition-transform relative z-10" />
                <span className="text-3xl lg:text-4xl font-black relative z-10">自動スキャン</span>
                <p className="text-blue-100 text-sm mt-2 relative z-10 font-bold">1問ならそのまま解説へ！</p>
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e)} />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="group bg-white border-2 border-blue-100 hover:border-blue-400 transition-all rounded-[2rem] p-6 lg:p-8 flex flex-col items-center justify-center text-blue-500 cursor-pointer active:scale-95">
                  <ImageIcon className="w-8 h-8 lg:w-10 lg:h-10 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm lg:text-base font-black">アルバムから</span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e)} />
                </label>
                <label className="group bg-blue-50 border-2 border-blue-200 hover:border-blue-400 transition-all rounded-[2rem] p-6 lg:p-8 flex flex-col items-center justify-center text-blue-600 cursor-pointer active:scale-95">
                  <Maximize className="w-8 h-8 lg:w-10 lg:h-10 mb-2 group-hover:scale-110 transition-transform" />
                  <span className="text-sm lg:text-base font-black">わくで囲む</span>
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleImageUpload(e, true)} />
                </label>
              </div>

              <div className="pt-2 flex justify-center">
                <button
                  onClick={navigateToOnboarding}
                  className="flex items-center gap-2 px-6 py-3 text-gray-400 hover:text-blue-500 transition-colors group"
                >
                  <HelpCircle size={18} className="group-hover:animate-bounce" />
                  <span className="text-sm font-bold border-b border-transparent group-hover:border-blue-200">使いかたガイドをみる</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {showLimitReachedModal && (
        <LimitReachedModal
          onConfirm={() => {
            setShowLimitReachedModal(false);
            setCurrentScreen(AppScreen.PAYWALL);
          }}
          onCancel={() => setShowLimitReachedModal(false)}
        />
      )}
    </div>
  );

  const renderLoading = () => (
    <div className="min-h-screen bg-blue-50 flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-white rounded-[2rem] shadow-2xl mb-10 p-4 border-4 border-white inline-flex items-center justify-center max-w-[80vw]">
        {croppedImage && (
          <img
            src={croppedImage}
            className="rounded-xl w-auto h-auto max-w-full max-h-[40vh] block shadow-inner"
            alt="cropped"
          />
        )}
      </div>
      <div className="mb-6">
        <AITeacher mood="THINKING" className="scale-125" />
      </div>
      <h2 className="text-2xl font-black text-gray-800 mb-2">スパッキー先生が考え中...</h2>
      <p className="text-gray-500 font-bold">問題をじっくり見ているよ。ちょっとまってね！</p>

      <div className="mt-8 w-full max-w-md space-y-4">
        <div className="bg-white rounded-2xl border border-blue-100 shadow-sm px-5 py-4 text-left">
          <div className="flex items-center gap-2 mb-1">
            {analysisPhase === "reading" ? (
              <RefreshCw className="text-blue-500 animate-spin" size={16} />
            ) : (
              <Check className="text-green-500" size={16} />
            )}
            <p className="text-sm font-black text-gray-700">読み取り</p>
          </div>
          <p className="text-xs font-bold text-gray-400">
            {analysisPhase === "reading" ? "いま文字をよみとっているよ" : "読み取りができたよ"}
          </p>
        </div>

        {readProblemText && (
          <div className="bg-white rounded-3xl border-2 border-blue-100 shadow-sm px-6 py-5 text-left">
            <p className="text-[10px] text-blue-400 font-black uppercase tracking-widest mb-2">問題文</p>
            <p className="text-sm font-black text-gray-700 leading-relaxed">
              {readProblemText}
            </p>
          </div>
        )}

        {analysisPhase === "solving" && (
          <div className="bg-white rounded-2xl border border-blue-100 shadow-sm px-5 py-4 text-left space-y-3">
            <div className="flex items-center gap-2">
              <RefreshCw className="text-indigo-500 animate-spin" size={16} />
              <p className="text-sm font-black text-gray-700">解き方を作っているよ</p>
            </div>
            {[0, 1, 2].map((idx) => (
              <div key={idx} className="bg-blue-50/70 rounded-2xl px-4 py-3">
                <div className="h-3 w-24 bg-blue-200/70 rounded-full mb-2 animate-pulse"></div>
                <div className="h-3 w-full bg-blue-100 rounded-full animate-pulse"></div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const renderProblemSelect = () => {
    const selectableProblems =
      readProblems ?? (analysisResult ? analysisResult.problems : []);
    if (!selectableProblems.length) return null;
    return (
      <div className="min-h-screen bg-blue-50 flex flex-col">
        <Header title="どの問題を解く？" leftIcon={<X />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
        <main className="flex-1 flex flex-col p-6 items-center justify-center">
          <div className="mb-6 flex flex-col items-center">
            <AITeacher mood="HAPPY" />
            <p className="text-blue-600 font-black mt-2 flex items-center gap-2">
              <LayoutList size={20} /> {selectableProblems.length}個の問題が見つかったよ！
            </p>
          </div>

          <div className="w-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-6 px-4 pb-8">
            {selectableProblems.map((p, idx) => (
              <div
                key={p.id || idx}
                className="snap-center shrink-0 w-[85vw] max-w-sm bg-white rounded-[2.5rem] shadow-xl p-8 flex flex-col border-b-8 border-blue-400 border-r border-l border-t border-gray-100"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold">
                    {idx + 1}
                  </div>
                  <span className="text-sm font-black text-gray-400">もんだい</span>
                </div>

                <div className="flex-1 overflow-y-auto mb-8 bg-gray-50 p-6 rounded-3xl border border-dashed border-gray-200">
                  <p className="text-gray-700 leading-relaxed font-black">
                    {p.problem_text}
                  </p>
                </div>

                <button
                  onClick={() => selectProblem(idx)}
                  className="w-full bg-blue-500 text-white py-5 rounded-2xl font-black text-lg shadow-lg shadow-blue-100 flex items-center justify-center gap-2 active:scale-95 transition-all"
                >
                  <Sparkles size={20} /> この問題を解く！
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            {selectableProblems.map((_, idx) => (
              <div key={idx} className={`w-2 h-2 rounded-full bg-blue-200`} />
            ))}
          </div>
          <p className="mt-6 text-xs text-gray-400 font-black">横にスワイプしてえらんでね</p>
        </main>
      </div>
    );
  };

  const renderResult = () => {
    if (!analysisResult || !analysisResult.problems[currentProblemIndex]) return null;
    const problem = analysisResult.problems[currentProblemIndex];
    const hasMultipleProblems =
      (readProblems?.length ?? analysisResult.problems.length ?? 0) > 1;
    const totalSteps = problem.steps.length + 1;
    const isFinishedSteps = currentStepIndex === totalSteps;

    if (isFinishedSteps) {
      return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
          <Header title="おめでとう！" leftIcon={<X />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
          <main className="flex-1 flex flex-col p-6 items-center justify-center">
            <div className={`w-full max-w-md bg-white rounded-[2.5rem] shadow-xl p-8 flex flex-col items-center text-center border-b-8 border-yellow-400 animate-in zoom-in duration-300`}>
              {!showFinalAnswer ? (
                <>
                  <div className="mb-6">
                    <AITeacher mood="PRAISING" className="scale-125" />
                  </div>
                  <h3 className="text-2xl font-black text-gray-800 mb-4">最後まで考えられたね！</h3>
                  <div className="bg-yellow-50 rounded-2xl px-6 py-4 mb-8 border border-yellow-100">
                    <p className="text-yellow-700 font-black leading-relaxed">
                      すごいよ！きみの努力は最高だ！<br />
                      さいごに、答えをみてスッキリしよう！
                    </p>
                  </div>
                  <div className="w-full space-y-3">
                    <button
                      onClick={() => setShowFinalAnswer(true)}
                      className="w-full bg-blue-500 text-white py-5 rounded-2xl font-black text-lg shadow-lg shadow-blue-100 flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                      <Eye size={20} /> 答えを見る！
                    </button>
                    <button
                      onClick={() => setCurrentStepIndex(totalSteps - 1)}
                      className="w-full bg-gray-100 text-gray-500 py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                      <Undo2 size={18} /> 解説にもどる
                    </button>
                    <button
                      onClick={() => setCurrentScreen(AppScreen.HOME)}
                      className="w-full bg-white text-gray-400 py-2 text-xs font-black active:scale-95 transition-all"
                    >
                      答えは見ずに次へいく
                    </button>
                  </div>
                </>
              ) : (
                <div className="animate-in fade-in duration-500 w-full text-center">
                  <div className="mb-6">
                    <AITeacher mood="PRAISING" className="scale-125" />
                  </div>
                  <h3 className="text-xl font-black text-gray-400 mb-2 uppercase">さいごの答え</h3>

                  <div className="bg-green-50 p-6 rounded-[2rem] border-4 border-green-200 mb-8 relative">
                    <Trophy className="absolute -top-6 -right-6 text-yellow-400 rotate-12" size={48} />

                    {(() => {
                      const raw = (problem.final_answer ?? "").trim();

                      // 1) まず「答え：」を抽出（あれば）
                      const answerMatch = raw.match(/^答え：\s*(.*?)(?:\n|$)/);
                      const answerLine = answerMatch ? answerMatch[1].trim() : "";

                      // 2) 「【理由】」以降を抽出（あれば）
                      const reasonSplit = raw.split("【理由】");
                      const reasonText = reasonSplit.length >= 2 ? reasonSplit.slice(1).join("【理由】").trim() : "";

                      // 3) どちらも取れないケースはそのまま段落化
                      const fallbackLines = raw
                        .replace(/^答え：\s*/g, "")
                        .split(/\n+/)
                        .map((s) => s.trim())
                        .filter(Boolean);

                      return (
                        <div className="space-y-4">
                          {/* タイトル（答え） */}
                          <div className="flex items-center gap-3">
                            <span className="inline-flex items-center px-3 py-1 rounded-full bg-green-200 text-green-800 text-xs font-black">
                              さいごの答え
                            </span>
                            <p className="text-2xl sm:text-3xl font-black text-green-800">
                              {answerLine ? `答え：${answerLine}` : "答え"}
                            </p>
                          </div>

                          {/* 理由（段落表示） */}
                          {reasonText ? (
                            <div className="bg-white/60 rounded-2xl p-4 border border-green-200">
                              <p className="text-sm font-black text-green-700 mb-2">理由</p>
                              <p className="text-[15px] sm:text-base font-bold text-green-900 leading-7 whitespace-pre-wrap">
                                {reasonText}
                              </p>
                            </div>
                          ) : (
                            <div className="bg-white/60 rounded-2xl p-4 border border-green-200">
                              <p className="text-[15px] sm:text-base font-bold text-green-900 leading-7 whitespace-pre-wrap">
                                {fallbackLines.join("\n\n")}
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="w-full space-y-3">
                    <button
                      onClick={startDrills}
                      disabled={isLoadingDrills}
                      className="w-full bg-gradient-to-r from-indigo-500 to-blue-600 text-white py-5 rounded-2xl font-black text-lg shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isLoadingDrills ? (
                        <RefreshCw className="animate-spin" />
                      ) : (
                        <>
                          <BookOpen size={20} />
                          {isPro ? "にた問題をやってみる！" : "にた問題をやってみる！ (Pro)"}
                          {!isPro && <Crown size={16} className="text-yellow-300" />}
                        </>
                      )}
                    </button>

                    <button
                      onClick={() => {
                        setShowFinalAnswer(false);
                        setCurrentStepIndex(totalSteps - 1);
                      }}
                      className="w-full bg-blue-50 border-2 border-blue-200 text-blue-600 py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
                    >
                      <Undo2 size={20} /> 解説にもどる
                    </button>

                    <button
                      onClick={() => setCurrentScreen(AppScreen.PROBLEM_SELECT)}
                      className="w-full bg-blue-50 border-2 border-blue-200 text-blue-600 py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
                    >
                      <LayoutList size={20} /> 同じ写真のほかの問題を解く
                    </button>

                    <button
                      onClick={() => setCurrentScreen(AppScreen.HOME)}
                      className="w-full bg-white text-gray-400 py-2 text-xs font-black flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                      ホームにもどる
                    </button>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      );
    }

    const isSpackyThinking = currentStepIndex === 0;
    const stepIndex = currentStepIndex - 1;
    const currentStep = isSpackyThinking ? null : problem.steps[stepIndex];
    const prevStep = currentStepIndex > 1 ? problem.steps[stepIndex - 1] : null;
    const isLastStep = currentStepIndex === totalSteps - 1;
    const thoughtText =
      typeof problem.spacky_thinking === "string" && problem.spacky_thinking.trim().length > 0
        ? problem.spacky_thinking.trim()
        : "まず情報を整理して、同じ基準で比べられる形を考えてみよう。";

    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Header
          title="スパッキーのガイド"
          leftIcon={hasMultipleProblems ? <LayoutList /> : <X />}
          onLeftClick={() => hasMultipleProblems ? setCurrentScreen(AppScreen.PROBLEM_SELECT) : setCurrentScreen(AppScreen.HOME)}
        />
        <main className="flex-1 flex flex-col p-4 overflow-y-auto scrollbar-hide">
          <div className="bg-white rounded-2xl p-5 shadow-sm mb-4 border border-gray-100 shrink-0">
            <p className="text-[10px] font-black text-gray-400 mb-1 uppercase tracking-widest">よみとった問題</p>
            <p className="text-sm text-gray-700 leading-relaxed font-bold">{problem.problem_text}</p>
          </div>

          <div className="flex-1 relative flex items-center justify-center py-4">
            <div className={`w-full max-w-md bg-white rounded-[2.5rem] shadow-xl p-8 flex flex-col min-h-[520px] border-b-8 border-blue-400 animate-in slide-in-from-right duration-300 relative`}>

              <div className="mb-4">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-2">図・イラスト</p>
                <div
                  onClick={() => setShowFullImage(true)}
                  className="relative h-28 w-full bg-gray-100 rounded-2xl overflow-hidden border border-gray-200 cursor-pointer group active:scale-95 transition-all"
                >
                  {croppedImage && (
                    <img
                      src={croppedImage}
                      className="h-full w-full object-contain"
                      alt="figure"
                    />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 flex items-center justify-center transition-colors">
                    <ZoomIn className="text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black/40 text-white p-1 rounded-md">
                    <Maximize size={12} />
                  </div>
                </div>
              </div>

              {prevStep && (
                <div className="mb-6 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="bg-blue-50/50 rounded-2xl p-4 border border-blue-100 relative">
                    <p className="text-[10px] font-black text-blue-400 uppercase mb-1">
                      まえのステップのふりかえり
                    </p>

                    {/* 会話の説明（常時表示） */}
                    <p className="text-sm font-black text-blue-700 leading-relaxed">
                      {prevStep.solution}
                    </p>

                    {/* 途中計算（任意表示） */}
                    {(() => {
                      const calc = prevStep.calculation;
                      const expr =
                        typeof calc?.expression === "string" ? calc.expression.trim() : "";

                      const hasValidCalc =
                        !!calc &&
                        expr !== "" &&
                        expr.toUpperCase() !== "NULL" &&
                        typeof calc.result === "number" &&
                        !Number.isNaN(calc.result);

                      if (!hasValidCalc) return null;

                      return (
                        <div className="mt-3">
                          <button
                            type="button"
                            onClick={() => setShowPrevCalc(v => !v)}
                            className="text-xs font-black text-blue-700 underline underline-offset-2 active:scale-95"
                          >
                            {showPrevCalc ? "計算をとじる" : "計算をみる"}
                          </button>

                          {showPrevCalc && (
                            <div className="mt-2 bg-white/80 rounded-2xl p-3 border border-blue-100">
                              <p className="text-[10px] font-black text-blue-400 uppercase mb-1">
                                途中の計算
                              </p>
                              <p className="text-sm font-black text-blue-800">
                                式 {calc.expression}
                              </p>
                              <p className="text-sm font-black text-blue-800 mt-1">
                                結果 {calc.result}
                                {calc.unit ? ` ${calc.unit}` : ""}
                              </p>
                              {calc.note && (
                                <p className="text-xs font-black text-blue-600 mt-2">
                                  {calc.note}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white rounded-full p-1 border border-gray-100 shadow-sm">
                      <ArrowDown size={14} className="text-blue-400" />
                    </div>
                  </div>
                </div>
              )}


              <div className="flex items-center justify-between mb-4">
                <span className={`px-5 py-1 rounded-full text-sm font-black bg-blue-500 text-white shadow-sm shadow-blue-100`}>
                  {isSpackyThinking ? "スパッキーの考え方" : `ステップ ${stepIndex + 1}`}
                </span>
                <AITeacher mood="SUPPORTIVE" className="scale-75 -mr-4" />
              </div>

              <div className="flex-1 flex flex-col justify-center items-center text-center">
                {isSpackyThinking ? (
                  <ThoughtBlockYellow
                    title="スパッキーの考え方"
                    text={thoughtText}
                  />
                ) : (
                  <>
                    <div className="bg-white p-6 rounded-[2rem] border-2 border-dashed border-blue-100 w-full min-h-[160px] flex flex-col items-center justify-center relative">
                      <p className="text-xl font-black text-gray-800 leading-relaxed">
                        {currentStep?.hint}
                      </p>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <Heart className="text-red-400 fill-red-400" size={16} />
                      <p className="text-xs text-gray-500 font-black">
                        "だいじょうぶ、きみならできるよ！"
                      </p>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-8 flex gap-3">
                <button
                  onClick={() => {
                    if (currentStepIndex > 0) {
                      setCurrentStepIndex(currentStepIndex - 1);
                    } else if (analysisResult.problems.length > 1) {
                      setCurrentScreen(AppScreen.PROBLEM_SELECT);
                    } else {
                      setCurrentScreen(AppScreen.HOME);
                    }
                  }}
                  className="flex-1 bg-gray-100 text-gray-500 py-4 rounded-2xl font-black transition-colors hover:bg-gray-200 active:scale-95 flex items-center justify-center gap-1"
                >
                  <Undo2 size={18} /> もどる
                </button>
                <button
                  onClick={() => {
                    setCurrentStepIndex(currentStepIndex + 1);
                  }}
                  className={`flex-[2] py-4 rounded-2xl font-black text-white shadow-lg transition-all active:scale-95 ${isLastStep ? 'bg-indigo-600 shadow-indigo-200 hover:bg-indigo-700' : 'bg-blue-500 shadow-blue-200 hover:bg-blue-600'}`}
                >
                  {isLastStep ? "最後まで考えた！" : "考えたよ！（つぎへ）"}
                </button>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-2 py-8">
            {Array.from({ length: totalSteps + 1 }).map((_, idx) => (
              <div key={idx} className={`h-2.5 rounded-full transition-all ${idx === currentStepIndex ? 'w-10 bg-blue-500' : 'w-2.5 bg-gray-300'}`} />
            ))}
          </div>
        </main>

        {showFullImage && (
          <div className="fixed inset-0 z-[150] bg-black/95 flex flex-col animate-in fade-in duration-300">
            <div className="h-16 flex justify-end items-center px-4">
              <button
                onClick={() => setShowFullImage(false)}
                className="p-3 bg-white/20 rounded-full text-white hover:bg-white/30"
              >
                <X />
              </button>
            </div>
            <div className="flex-1 flex items-center justify-center p-4">
              {croppedImage && (
                <img
                  src={croppedImage}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                  alt="full figure"
                />
              )}
            </div>
            <div className="p-10 text-center">
              <p className="text-white text-lg font-black">図をじっくり見て、数字を探してみよう！</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderDrill = () => {
    if (!drillResult) return null;
    const currentDrill = drillResult.problems[currentDrillIndex];
    const isLast = currentDrillIndex === drillResult.problems.length - 1;

    return (
      <div className="min-h-screen bg-indigo-50 flex flex-col">
        <Header title="スパッキーの特訓" leftIcon={<X />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
        <main className="flex-1 flex flex-col p-6 items-center">
          <div className="w-full max-w-md mb-6">
            <div className="flex justify-between items-center mb-2 px-2">
              <span className="text-indigo-600 font-black">チャレンジ {currentDrillIndex + 1} / {drillResult.problems.length}</span>
              <div className="flex gap-1">
                {drillResult.problems.map((_, i) => (
                  <div key={i} className={`h-2 w-7 rounded-full ${i <= currentDrillIndex ? 'bg-indigo-500' : 'bg-indigo-200'}`} />
                ))}
              </div>
            </div>
          </div>

          <div className="flex-1 w-full max-w-md relative">
            <div className="bg-white rounded-[2.5rem] shadow-xl p-8 flex flex-col min-h-[480px] border-b-8 border-indigo-400 animate-in slide-in-from-bottom-8 duration-500">
              <div className="flex-1 flex flex-col">
                <div className="bg-indigo-50/50 p-6 rounded-[2rem] mb-6 border-2 border-indigo-100 flex-1 flex items-center justify-center relative">
                  <div className="absolute -top-3 left-6 bg-indigo-500 text-white px-3 py-0.5 rounded-full text-[10px] font-black">問題</div>
                  <p className="text-xl font-black text-gray-800 leading-relaxed text-center">
                    {currentDrill.question}
                  </p>
                </div>

                {showDrillAnswer ? (
                  <div className="animate-in zoom-in-95 duration-300 space-y-4">
                    <div className="bg-green-50 p-6 rounded-2xl border-4 border-green-200 text-center flex flex-col items-center">
                      <AITeacher mood="PRAISING" className="mb-2 scale-75" />
                      <p className="text-xs text-green-500 font-black mb-1 uppercase tracking-widest">正解！</p>
                      <p className="text-2xl font-black text-green-700">{currentDrill.answer}</p>
                    </div>
                    <div className="bg-blue-50 p-6 rounded-2xl text-sm text-blue-800 leading-relaxed border border-blue-100">
                      <p className="font-black mb-2 flex items-center gap-1"><Lightbulb size={14} className="text-blue-500" /> スパッキー先生の解説</p>
                      <p className="font-bold">{currentDrill.explanation}</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-10 text-gray-400 space-y-4">
                    <AITeacher mood="NORMAL" className="opacity-50" />
                    <div className="relative">
                      <div className="bg-gray-100 rounded-2xl px-6 py-3 border-2 border-gray-200">
                        <p className="font-black">ノートにかいて、考えてみてね！</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-8">
                {!showDrillAnswer ? (
                  <button
                    onClick={() => setShowDrillAnswer(true)}
                    className="w-full bg-indigo-500 text-white py-5 rounded-2xl font-black text-lg shadow-lg shadow-indigo-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    <Eye size={20} /> 答えあわせをする！
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (isLast) {
                        setCurrentScreen(AppScreen.HOME);
                      } else {
                        setCurrentDrillIndex(currentDrillIndex + 1);
                        setShowDrillAnswer(false);
                      }
                    }}
                    className="w-full bg-green-500 text-white py-5 rounded-2xl font-black text-lg shadow-lg shadow-green-100 active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {isLast ? "おわってホームへ" : "つぎへ進む！"} <ArrowRight size={20} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header
        title="これまでのきろく"
        leftIcon={<ChevronLeft />}
        onLeftClick={() => setCurrentScreen(AppScreen.HOME)}
      />
      <main className="p-4 space-y-4 flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-gray-400">
            <AITeacher mood="THINKING" className="opacity-30 mb-6" />
            <p className="font-black">まだきろくがないよ</p>
          </div>
        ) : (
          history.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setAnalysisResult(item.result);
                setCroppedImage(item.image);
                setReadProblems(item.allProblems ?? null);
                setCurrentProblemIndex(0);
                setCurrentStepIndex(0);
                setCurrentScreen(
                  (item.allProblems?.length ?? 0) > 1
                    ? AppScreen.PROBLEM_SELECT
                    : AppScreen.RESULT
                );
              }}
              className="w-full bg-white p-4 rounded-3xl flex items-center gap-4 shadow-sm text-left"
            >
              {item.image ? (
                <img
                  src={item.image}
                  className="h-16 w-16 object-contain bg-gray-50 rounded-xl shrink-0"
                  alt="history"
                />
              ) : (
                <div className="h-16 w-16 bg-gray-50 rounded-xl shrink-0 flex items-center justify-center text-gray-300">
                  <ImageIcon size={20} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400">
                  {new Date(item.timestamp).toLocaleDateString('ja-JP')}
                </p>
                <p className="text-sm font-black truncate">
                  {item.result.problems[0]?.problem_text}
                </p>
              </div>
              <ChevronLeft className="rotate-180 text-gray-300 shrink-0" />
            </button>
          ))
        )}
      </main>
    </div>
  );
  const renderSettings = () => (
    <div className="min-h-screen bg-gray-50">
      <Header title="せってい" leftIcon={<ChevronLeft />} onLeftClick={() => setCurrentScreen(AppScreen.HOME)} />
      <main className="p-6 space-y-6">
        <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-gray-100">
          <button
            onClick={() => setCurrentScreen(isPro ? AppScreen.PRO_MANAGEMENT : AppScreen.PAYWALL)}
            className="w-full p-6 flex items-center justify-between border-b border-gray-50 hover:bg-gray-50 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${isPro ? 'bg-indigo-100' : 'bg-yellow-100'}`}>
                {isPro ? <Crown className="text-indigo-600" /> : <CreditCard className="text-yellow-600" />}
              </div>
              <div>
                <p className="font-black text-gray-800">Proプランの管理</p>
                <p className="text-xs text-gray-400 font-bold">{isPro ? "スパッキーのフルサポート中！" : "プランを確認する"}</p>
              </div>
            </div>
            <ChevronLeft className="rotate-180 text-gray-300" />
          </button>

          <button onClick={navigateToOnboarding} className="w-full p-6 flex items-center justify-between border-b border-gray-50 hover:bg-gray-50 transition-colors text-left">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-2xl"><HelpCircle className="text-blue-600" /></div>
              <div>
                <p className="font-black text-gray-800">使いかたガイド</p>
                <p className="text-xs text-gray-400 font-bold">アプリの動かし方をみる</p>
              </div>
            </div>
            <ChevronLeft className="rotate-180 text-gray-300" />
          </button>

          <button onClick={() => launchWebPage('https://example.com/terms')} className="w-full p-6 flex items-center justify-between border-b border-gray-50 hover:bg-gray-50 transition-colors text-left">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-2xl"><FileText className="text-blue-500" /></div>
              <div><p className="font-black text-gray-800">利用規約</p></div>
            </div>
            <ExternalLink className="text-gray-300" size={18} />
          </button>

          <button onClick={() => launchWebPage('https://example.com/privacy')} className="w-full p-6 flex items-center justify-between hover:bg-gray-50 transition-colors text-left">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 rounded-2xl"><ShieldCheck className="text-blue-500" /></div>
              <div><p className="font-black text-gray-800">プライバシーポリシー</p></div>
            </div>
            <ExternalLink className="text-gray-300" size={18} />
          </button>
        </div>

        <p className="text-center text-gray-300 text-xs mt-10 font-bold">Version 1.8.0 - 振り返り機能の強化</p>
      </main>
    </div>
  );

  const renderProManagement = () => (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header title="Proプランの管理" leftIcon={<ChevronLeft />} onLeftClick={() => setCurrentScreen(AppScreen.SETTINGS)} />
      <main className="flex-1 p-6 space-y-6">
        <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-[2.5rem] p-8 shadow-xl relative overflow-hidden">
          <Crown className="absolute -top-4 -right-4 w-32 h-32 opacity-10 rotate-12" />
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <span className="bg-white/20 text-white px-3 py-1 rounded-full text-xs font-black">
                サブスクリプション
              </span>
              <Heart size={14} className="fill-red-400 text-red-400" />
            </div>

            <h2 className="text-3xl font-black mb-6 text-gray-900">Proプラン登録中</h2>

            <div className="space-y-4">
              <div className="bg-white rounded-2xl p-4 border border-gray-200">
                <p className="text-gray-500 text-xs uppercase font-black tracking-widest mb-1">
                  現在のプラン
                </p>
                <p className="text-lg font-black text-gray-900">月額プラン (¥480/月)</p>
              </div>
            </div>
          </div>

        </div>

        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
          <h3 className="font-black text-gray-800 mb-4 px-2">スパッキーの特別特典</h3>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="bg-green-100 p-2 rounded-full"><Check className="text-green-600" size={18} /></div>
              <p className="text-gray-700 font-black">1日あたりの回数制限なし</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-green-100 p-2 rounded-full"><Check className="text-green-600" size={18} /></div>
              <p className="text-gray-700 font-black">AIによる詳しい「考え方」解説</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-green-100 p-2 rounded-full"><Check className="text-green-600" size={18} /></div>
              <p className="text-gray-700 font-black">類題ドリル生成機能</p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => alert('購入情報を確認しました。最新の状態に更新されました。')}
            className="w-full bg-white border-2 border-gray-100 text-gray-600 py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <RefreshCw size={18} /> 購入の復元
          </button>

          <button
            onClick={() => {
              if (window.confirm('解約手続きのため、ストアの管理画面へ移動しますか？')) {
                launchWebPage('https://apps.apple.com/account/subscriptions');
              }
            }}
            className="w-full bg-white border-2 border-gray-100 text-red-500 py-4 rounded-2xl font-black flex items-center justify-center gap-2 active:scale-95 transition-all shadow-sm"
          >
            <LogOut size={18} /> 定期購読を解約する
          </button>
        </div>
      </main>
    </div>
  );

  const renderPaywall = () => (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="h-72 bg-gradient-to-br from-blue-500 to-indigo-600 flex flex-col items-center justify-center text-white relative p-6 text-center">
        <button onClick={() => setCurrentScreen(AppScreen.HOME)} className="absolute top-6 left-6 p-2 bg-white/20 rounded-full hover:bg-white/40 transition-colors"><X /></button>
        <AITeacher mood="HAPPY" className="mb-4 scale-125" />
        <h2 className="text-3xl font-black text-white">Proプラン</h2>
        <p className="text-blue-100 font-black mt-2">算数の「なぜ？」をもっとたくさん知ろう！</p>
      </div>
      <main className="flex-1 p-8 flex flex-col justify-between text-center">
        <div className="space-y-4 py-8">
          <div className="flex items-center gap-4 bg-blue-50 p-5 rounded-3xl text-left border-2 border-blue-100">
            <div className="bg-blue-500 text-white p-2 rounded-full shrink-0 shadow-sm"><Check size={20} /></div>
            <p className="font-black text-gray-700">類題ドリルで特訓できる！</p>
          </div>
          <div className="flex items-center gap-4 bg-blue-50 p-5 rounded-3xl text-left border-2 border-blue-100">
            <div className="bg-blue-500 text-white p-2 rounded-full shrink-0 shadow-sm"><Check size={20} /></div>
            <p className="font-black text-gray-700">1日あたりの回数制限なし！</p>
          </div>
          <div className="flex items-center gap-4 bg-blue-50 p-5 rounded-3xl text-left border-2 border-blue-100">
            <div className="bg-blue-500 text-white p-2 rounded-full shrink-0 shadow-sm"><Check size={20} /></div>
            <p className="font-black text-gray-700">スパッキー先生がいつでも解説！</p>
          </div>
        </div>

        <div className="space-y-6">
          <button
            onClick={() => { setIsPro(true); setCurrentScreen(AppScreen.HOME); }}
            className="w-full bg-blue-500 text-white py-5 rounded-2xl text-xl font-black shadow-xl shadow-blue-100 hover:bg-blue-600 transition-all active:scale-95 flex items-center justify-center gap-3"
          >
            <Crown className="w-6 h-6" />
            ¥480 / 月 で登録
          </button>

          <button
            onClick={() => setCurrentScreen(AppScreen.HOME)}
            className="w-full bg-white text-gray-500 py-4 rounded-2xl text-base font-black border-2 border-gray-100 hover:border-blue-200 hover:text-blue-500 transition-all active:scale-95"
          >
            いまはやめておく
          </button>

          <div className="flex flex-col items-center gap-4">
            <div className="flex items-center justify-center gap-3 text-[11px] text-gray-400 font-bold">
              <button onClick={() => launchWebPage('https://example.com/terms')} className="hover:text-blue-500 underline">利用規約</button>
              <span>|</span>
              <button onClick={() => launchWebPage('https://example.com/privacy')} className="hover:text-blue-500 underline">プライバシーポリシー</button>
              <span>|</span>
              <button onClick={() => alert('購入情報を確認しています...')} className="hover:text-blue-500 underline flex items-center gap-1">
                <RefreshCw size={10} /> 購入の復元
              </button>
            </div>
            <p className="text-[10px] text-gray-300 text-center leading-relaxed font-bold">
              解約はいつでも可能です。登録前にかならず利用規約をよんでね。
            </p>
          </div>
        </div>
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
    case AppScreen.PRO_MANAGEMENT: return renderProManagement();
    default: return renderHome();
  }
};

export default App;
