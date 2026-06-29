import React, { useState, useEffect, useRef } from "react";
import {
  Volume2,
  Sparkles,
  Download,
  Play,
  Pause,
  RefreshCw,
  Clock,
  Trash2,
  Sliders,
  Disc,
  Info,
  Check,
  AlertCircle
} from "lucide-react";

// Standard prebuilt voice mapping interface
interface VoiceConfig {
  name: string;
  gender: string;
  description: string;
  systemVoice: string;
}

const VOICES: VoiceConfig[] = [
  { name: "Dilnoza", gender: "Ayol", description: "Mayin va ifodali ovoz (Tavsiya etiladi!)", systemVoice: "Zephyr" },
  { name: "Madina", gender: "Ayol", description: "Aniq va ravon ma'ruzachi ovozi.", systemVoice: "Kore" },
  { name: "Sardor", gender: "Erkak", description: "Yoqimli, samimiy va do'stona ovoz.", systemVoice: "Puck" },
  { name: "Jasur", gender: "Erkak", description: "Shiddatli, chuqur va vazmin ovoz.", systemVoice: "Charon" },
  { name: "Farrux", gender: "Erkak", description: "Muloyim va iliq nutq ohangi.", systemVoice: "Fenrir" }
];

const STYLES = [
  "Tabiiy / Oddiy",
  "Xushchaqchaq",
  "Sokin va muloyim",
  "Jiddiy / Rasmiy",
  "Hayajonli / Dramatik"
];

const PRESETS = [
  {
    label: "💬 Salomlashish",
    text: "Assalomu alaykum! O'zbek ovoz sun'iy intellekt xizmatiga xush kelibsiz. Bizning tizim matnlarni tabiiy va ravon ovozga aylantiradi. Bugun sizga qanday yordam bera olaman?"
  },
  {
    label: "📰 Yangiliklar",
    text: "Xayrli kun, hurmatli tinglovchilar! Bugun poytaxtimizda eng so'nggi texnologiyalar va sun'iy intellekt sohasidagi yutuqlar muhokama qilinmoqda."
  },
  {
    label: "✨ She'riyat",
    text: "O'zbekiston, ey ona vatan, sening tuprog'ing muqaddas, tiling esa olamga doston. Har bir so'zingda sehrli ohang bor."
  },
  {
    label: "🔬 Ilmiy ma'ruzalar",
    text: "Inson miyasi neyronlari faoliyati va ularning matematik modellari sun'iy intellekt algoritmlarini yaratishda muhim asos bo'lib xizmat qiladi."
  }
];

interface HistoryItem {
  id: string;
  text: string;
  voiceName: string;
  style: string;
  speed: number;
  timestamp: string;
  audioBase64: string; // Saved Base64 raw PCM to restore if clicked
}

// 44-byte WAV header generator helper for raw PCM 24000Hz, Mono, 16-bit
function generateWavBlob(pcmBytes: Uint8Array): Blob {
  const buffer = new ArrayBuffer(44 + pcmBytes.byteLength);
  const view = new DataView(buffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + pcmBytes.byteLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true);  // Mono
  view.setUint32(24, 24000, true); // Sample rate 24kHz
  view.setUint32(28, 24000 * 2, true); // Byte rate (24000 * 1 channel * 2 bytes/sample)
  view.setUint16(32, 2, true);  // Block align (1 channel * 2 bytes/sample)
  view.setUint16(34, 16, true); // 16 bits per sample
  writeString(36, 'data');
  view.setUint32(40, pcmBytes.byteLength, true);

  // Copy raw PCM bytes
  new Uint8Array(buffer, 44).set(pcmBytes);

  return new Blob([buffer], { type: 'audio/wav' });
}

// Client-side MP3 conversion with LameJS from raw PCM (Int16Array format)
function encodePcmToMp3(pcmBytes: Uint8Array, kbps = 128): Blob | null {
  // @ts-ignore
  if (typeof lamejs === 'undefined') {
    console.error("LameJS is not loaded on the window object.");
    return null;
  }

  try {
    // 16-bit PCM little endian interpretation
    const len = pcmBytes.length / 2;
    const int16Samples = new Int16Array(len);
    const dataView = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
    for (let i = 0; i < len; i++) {
      int16Samples[i] = dataView.getInt16(i * 2, true);
    }

    // @ts-ignore
    const mp3encoder = new lamejs.Mp3Encoder(1, 24000, kbps);
    const mp3Data: any[] = [];
    const sampleBlockSize = 1152;

    for (let i = 0; i < int16Samples.length; i += sampleBlockSize) {
      const sampleChunk = int16Samples.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }
    }

    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }

    return new Blob(mp3Data, { type: 'audio/mp3' });
  } catch (error) {
    console.error("Error encoding to MP3:", error);
    return null;
  }
}

// Waveform generator based on real audio metrics
function generateWaveformPoints(pcmBytes: Uint8Array, count = 40): number[] {
  const len = pcmBytes.length / 2;
  if (len === 0) return Array(count).fill(12);

  const int16Samples = new Int16Array(len);
  const dataView = new DataView(pcmBytes.buffer, pcmBytes.byteOffset, pcmBytes.byteLength);
  for (let i = 0; i < len; i++) {
    int16Samples[i] = dataView.getInt16(i * 2, true);
  }

  const step = Math.max(1, Math.floor(int16Samples.length / count));
  const points: number[] = [];

  for (let i = 0; i < count; i++) {
    const start = i * step;
    const end = Math.min(start + step, int16Samples.length);
    let sum = 0;
    for (let j = start; j < end; j++) {
      sum += Math.abs(int16Samples[j]);
    }
    const avg = sum / (end - start || 1);
    // Map average amplitude to comfortable display bar heights (4px to 48px)
    const scaled = Math.min(48, Math.max(4, Math.round((avg / 12000) * 48)));
    points.push(scaled);
  }

  return points;
}

export default function App() {
  // Input and settings state
  const [text, setText] = useState<string>(PRESETS[0].text);
  const [voiceName, setVoiceName] = useState<string>("Dilnoza");
  const [style, setStyle] = useState<string>("Tabiiy / Oddiy");
  const [speed, setSpeed] = useState<number>(1.0);

  // Status state
  const [loadingTts, setLoadingTts] = useState<boolean>(false);
  const [loadingEnhance, setLoadingEnhance] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active audio player details
  const [activeVoiceName, setActiveVoiceName] = useState<string>("Dilnoza");
  const [activeStyle, setActiveStyle] = useState<string>("Tabiiy / Oddiy");
  const [activeSpeed, setActiveSpeed] = useState<number>(1.0);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [activeMp3Blob, setActiveMp3Blob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [waveform, setWaveform] = useState<number[]>([]);

  // History tracks
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Audio Context & refs for real-time spectral visualizers
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Initialize and load history from LocalStorage
  useEffect(() => {
    try {
      const cached = localStorage.getItem("ozbek_ovoz_history");
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setHistory(parsed);
        }
      }
    } catch (e) {
      console.error("Error reading cache history:", e);
    }
  }, []);

  // Update speed of currently playing audio node instantly
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
      setActiveSpeed(speed);
    }
  }, [speed]);

  // Handle cleanup of Audio URLs to prevent leaks
  useEffect(() => {
    return () => {
      if (activeAudioUrl) {
        URL.revokeObjectURL(activeAudioUrl);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [activeAudioUrl]);

  // Clean success alert after delay
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);

  // Save history to cache helper
  const saveHistory = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    localStorage.setItem("ozbek_ovoz_history", JSON.stringify(newHistory));
  };

  // Convert binary raw base64 PCM string to wav, calculate waveform, encode to MP3 and load
  const loadAudioFromBase64 = (base64Data: string, itemText: string, vName: string, stStyle: string, spSpeed: number) => {
    try {
      // 1. Decode base64 bytes
      const binaryString = window.atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // 2. Wrap as valid 44-byte WAV
      const wavBlob = generateWavBlob(bytes);
      const audioUrl = URL.createObjectURL(wavBlob);

      // 3. Compress/encode to MP3 client-side
      const mp3Blob = encodePcmToMp3(bytes);

      // 4. Generate SoundCloud styled Waveform points
      const points = generateWaveformPoints(bytes, 45);

      // 5. Update active playback states
      if (activeAudioUrl) {
        URL.revokeObjectURL(activeAudioUrl);
      }
      setActiveAudioUrl(audioUrl);
      setActiveMp3Blob(mp3Blob);
      setWaveform(points);
      setActiveVoiceName(vName);
      setActiveStyle(stStyle);
      setActiveSpeed(spSpeed);
      setCurrentTime(0);
      setIsPlaying(false);

      // Instantly load audio source
      if (audioRef.current) {
        audioRef.current.src = audioUrl;
        audioRef.current.load();
        audioRef.current.playbackRate = spSpeed;
      }

    } catch (err: any) {
      console.error("PCM Processing Error:", err);
      setErrorMsg("Ovoz ma'lumotlarini o'qishda xatolik yuz berdi: " + err.message);
    }
  };

  // Main Speech Synthesis API call
  const handleSynthesize = async () => {
    if (!text.trim()) {
      setErrorMsg("Iltimos, avval sintez qilish uchun biror matn kiriting.");
      return;
    }

    if (text.length > 1200) {
      setErrorMsg("Matn ruxsat etilgan maksimal miqdordan (1200 belgidan) oshib ketdi.");
      return;
    }

    setLoadingTts(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          voiceName,
          style,
          speed
        })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Ovoz sintez qilishda xatolik yuz berdi.");
      }

      // Load into audio engine
      loadAudioFromBase64(data.audioBase64, text.trim(), voiceName, style, speed);
      setSuccessMsg("Matn muvaffaqiyatli ovozga aylantirildi!");

      // Append to local history list (max 6 items)
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        text: text.trim(),
        voiceName,
        style,
        speed,
        timestamp: new Date().toLocaleTimeString("uz-UZ", { hour: '2-digit', minute: '2-digit' }),
        audioBase64: data.audioBase64
      };

      const updatedHistory = [newItem, ...history.filter(h => h.text !== text.trim())].slice(0, 6);
      saveHistory(updatedHistory);

    } catch (err: any) {
      console.error("Synthesis trigger fail:", err);
      setErrorMsg(err.message || "Ulanishda xatolik yuz berdi. Server sozlamalari yoki API kalitni tekshiring.");
    } finally {
      setLoadingTts(false);
    }
  };

  // Orthography & grammar check with standard Gemini model
  const handleEnhanceText = async () => {
    if (!text.trim()) {
      setErrorMsg("Tahrirlash uchun matn topilmadi.");
      return;
    }

    setLoadingEnhance(true);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/enhance-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Matnni tahlil qilishda xatolik yuz berdi.");
      }

      setText(data.enhancedText);
      setSuccessMsg("Imlo va tinish belgilari muvaffaqiyatli to'g'rilandi!");
    } catch (err: any) {
      console.error("Text orthography correction error:", err);
      setErrorMsg(err.message || "Tahrirlash xizmatida muammo chiqdi. Iltimos, qaytadan urinib ko'ring.");
    } finally {
      setLoadingEnhance(false);
    }
  };

  // Playback utilities
  const togglePlay = () => {
    if (!activeAudioUrl || !audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play()
        .then(() => {
          setIsPlaying(true);
          setupVisualizer();
        })
        .catch(err => {
          console.error("Playback interrupted:", err);
        });
    }
  };

  const handleSeek = (percentage: number) => {
    if (!audioRef.current || !duration) return;
    const targetTime = duration * percentage;
    audioRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  // Render real-time spectral bars loop on Canvas
  const setupVisualizer = () => {
    const audioElement = audioRef.current;
    if (!audioElement || !canvasRef.current) return;

    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      
      const ctx = new AudioCtx();
      audioContextRef.current = ctx;
      
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64; // nice wide spectral bands
      analyserRef.current = analyser;

      try {
        const source = ctx.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        sourceRef.current = source;
      } catch (err) {
        console.warn("Visualizer routing notice:", err);
      }
    }

    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const analyser = analyserRef.current;

    if (!ctx || !analyser) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      if (!canvasRef.current || !analyserRef.current || !audioRef.current) return;
      
      analyserRef.current.getByteFrequencyData(dataArray);
      
      const width = canvas.width;
      const height = canvas.height;
      ctx.clearRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 1.6;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const percent = dataArray[i] / 255;
        const barHeight = percent * height * 0.9;

        // Custom Teal-to-Cyan glow bar gradient
        const grad = ctx.createLinearGradient(0, height, 0, height - barHeight);
        grad.addColorStop(0, '#0d9488'); // teal-600
        grad.addColorStop(0.5, '#14b8a6'); // teal-500
        grad.addColorStop(1, '#06b6d4'); // cyan-500

        ctx.fillStyle = grad;
        // Rounded bars logic
        ctx.fillRect(x, height - barHeight, barWidth - 3, barHeight);
        x += barWidth;
      }

      animationFrameRef.current = requestAnimationFrame(draw);
    };

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    draw();
  };

  // Convert and trigger automated MP3 download
  const handleDownloadMp3 = () => {
    if (!activeMp3Blob) {
      setErrorMsg("Yuklab olish uchun MP3 fayl mavjud emas. Avval matnni sintez qiling.");
      return;
    }

    const cleanFilename = `Ozbek_Ovoz_AI_${activeVoiceName.toLowerCase()}_${Date.now()}.mp3`;
    const downloadUrl = URL.createObjectURL(activeMp3Blob);
    
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = cleanFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  };

  // Load old track block from local history item back to active
  const handleLoadHistoryItem = (item: HistoryItem) => {
    setErrorMsg(null);
    setText(item.text);
    setVoiceName(item.voiceName);
    setStyle(item.style);
    setSpeed(item.speed);
    loadAudioFromBase64(item.audioBase64, item.text, item.voiceName, item.style, item.speed);
    setSuccessMsg(`${item.voiceName} ovozi muvaffaqiyatli yuklandi.`);
  };

  // Delete individual history item
  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const filtered = history.filter(item => item.id !== id);
    saveHistory(filtered);
  };

  // Reset/Clear entire history cache
  const handleClearHistory = () => {
    saveHistory([]);
    setSuccessMsg("Sintez tarixi butunlay tozalandi.");
  };

  // Formatting time display (seconds -> MM:SS)
  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds === Infinity) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div id="ozbek_ovoz_app" className="min-h-screen bg-slate-50 font-sans flex flex-col selection:bg-teal-100 selection:text-teal-900">
      
      {/* Hidden Native Audio Node */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentTime(0);
          if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
          }
        }}
      />

      {/* Header Bar */}
      <header id="app_header" className="h-16 bg-white border-b border-slate-200 px-6 lg:px-8 flex items-center justify-between shrink-0 shadow-xs z-10">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 bg-gradient-to-tr from-teal-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-teal-500/20">
            <Volume2 className="h-5 w-5 text-white animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display font-bold text-lg tracking-tight text-slate-900">
                O'zbek Ovoz <span className="text-teal-600">AI</span>
              </h1>
              <span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-[10px] font-bold rounded-full border border-teal-100 uppercase tracking-wider">
                AI Speech
              </span>
            </div>
            <p className="text-xs text-slate-400 font-medium">Eng ilg'or ovoz sintezlovchi platformasi</p>
          </div>
        </div>
        
        <div className="hidden sm:flex items-center gap-4">
          <div className="flex flex-col items-end">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest">Model Holati</span>
            <span className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 absolute"></span>
              gemini-3.1-flash-tts-preview
            </span>
          </div>
        </div>
      </header>

      {/* Main Grid Workspace */}
      <main id="app_workspace" className="flex-1 max-w-7xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 overflow-hidden gap-0">
        
        {/* Left Side Panel: Editor & Controls */}
        <section id="left_editor" className="lg:col-span-7 p-4 lg:p-6 overflow-y-auto space-y-6 no-scrollbar">
          
          {/* Notification Banners */}
          {errorMsg && (
            <div id="error_banner" className="bg-red-50 border border-red-100 rounded-xl p-4 flex items-start gap-3 text-red-800 animate-fadeIn">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
              <div className="flex-1">
                <h4 className="text-sm font-semibold">Xatolik yuz berdi</h4>
                <p className="text-xs mt-1 text-red-700 font-medium">{errorMsg}</p>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-xs font-semibold text-red-500 hover:text-red-700 transition-colors">Yopish</button>
            </div>
          )}

          {successMsg && (
            <div id="success_banner" className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-start gap-3 text-emerald-800 animate-fadeIn">
              <Check className="h-5 w-5 shrink-0 text-emerald-500 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs font-semibold text-emerald-700">{successMsg}</p>
              </div>
              <button onClick={() => setSuccessMsg(null)} className="text-xs font-semibold text-emerald-500 hover:text-emerald-700 transition-colors">Yopish</button>
            </div>
          )}

          {/* Matn Kiritish Card */}
          <div id="text_input_card" className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <Sparkles className="h-5 w-5 text-teal-500" />
                <span className="font-display">O'zbekcha matn kiritish</span>
              </div>
              <span className={`text-xs font-mono px-2 py-1 rounded-sm ${text.length > 1200 ? 'bg-red-50 text-red-600' : 'bg-slate-50 text-slate-400'}`}>
                {text.length} / 1200 belgi
              </span>
            </div>

            <textarea
              id="speech_text_input"
              className="w-full h-44 bg-slate-50 rounded-xl p-4 border border-slate-100 focus:border-teal-500 focus:outline-hidden text-slate-700 leading-relaxed resize-none transition-all placeholder:text-slate-400 text-sm font-sans"
              placeholder="O'zbek tilidagi matningizni kiriting. O'zbek tili tovushlarini mukammal chiqarish uchun o' va g' harflarini, tutuq belgilarini (’) va tinish belgilarini to'g'ri kiritishingiz tavsiya etiladi..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={1200}
            />
            
            {/* Preset Chips */}
            <div id="preset_chips" className="space-y-1.5">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Tezkor andozalar (Andozani yuklash uchun bosing):</p>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    id={`preset_chip_${idx}`}
                    type="button"
                    onClick={() => {
                      setText(p.text);
                      setSuccessMsg(`${p.label} andozasi muvaffaqiyatli yuklandi.`);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-xs font-medium transition-all hover:scale-[1.01] active:scale-[0.98] cursor-pointer"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* AI Text Enhancement Button */}
            <div id="enhance_section" className="pt-2 border-t border-slate-100 space-y-2">
              <button
                id="btn_enhance_text"
                type="button"
                disabled={loadingEnhance}
                onClick={handleEnhanceText}
                className="w-full py-3 bg-white border border-teal-200 text-teal-700 hover:text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-teal-600 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {loadingEnhance ? (
                  <RefreshCw className="h-4 w-4 animate-spin text-teal-500" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Tahrirlash va Imlo to‘g‘rilash (Gemini 3.5-Flash)
              </button>
              <p className="text-[10px] text-slate-400 text-center uppercase tracking-widest font-mono">
                Imlo to'g'rilash o' va g' harflarini, tinish belgilarini chiroyli tekshiradi.
              </p>
            </div>
          </div>

          {/* Sozlamalar Card */}
          <div id="voice_settings_card" className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-6">
            <div className="flex items-center gap-2 text-slate-800 font-semibold border-b border-slate-100 pb-3">
              <Sliders className="h-5 w-5 text-teal-500" />
              <span className="font-display">Ovoz sozlamalari va Uslublar</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Voice selectors */}
              <div id="voice_picker_group" className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Ovozli obraz (Suhbatdosh)</label>
                <select
                  id="voice_select"
                  className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-medium focus:border-teal-500 focus:outline-hidden text-slate-800 cursor-pointer"
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                >
                  {VOICES.map((v) => (
                    <option key={v.name} value={v.name}>
                      {v.name} ({v.gender}) - {v.name === 'Dilnoza' ? 'Tavsiya etiladi' : 'Standard'}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 italic">
                  {VOICES.find(v => v.name === voiceName)?.description}
                </p>
              </div>

              {/* Playback speed rate with standard input range binding directly */}
              <div id="speed_picker_group" className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Nutq tezligi (Tempo)</label>
                  <span className="text-xs font-mono font-bold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-sm">{speed.toFixed(1)}x</span>
                </div>
                <div className="flex items-center gap-3 mt-2.5 px-1">
                  <span className="text-[10px] font-bold text-slate-400">Sekin (0.5x)</span>
                  <input
                    id="speed_range_slider"
                    type="range"
                    min="0.5"
                    max="2.0"
                    step="0.1"
                    value={speed}
                    onChange={(e) => setSpeed(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-teal-500"
                  />
                  <span className="text-[10px] font-bold text-slate-400">Tez (2.0x)</span>
                </div>
              </div>
            </div>

            {/* Emotional Style chips block */}
            <div id="style_picker_group" className="space-y-2.5">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Emotsional uslub</label>
              <div className="flex flex-wrap gap-2">
                {STYLES.map((st) => (
                  <button
                    key={st}
                    id={`style_btn_${st.replace(/[^a-zA-Z0-9]/g, '_')}`}
                    type="button"
                    onClick={() => setStyle(st)}
                    className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      style === st
                        ? "border-teal-500 bg-teal-50 text-teal-700 shadow-sm"
                        : "border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {/* Main TTS synthesis submit trigger */}
            <button
              id="btn_synthesize"
              type="button"
              disabled={loadingTts}
              onClick={handleSynthesize}
              className="w-full py-4 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white rounded-2xl font-bold shadow-xl shadow-teal-500/25 flex items-center justify-center gap-3 hover:scale-[1.01] active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
            >
              {loadingTts ? (
                <>
                  <RefreshCw className="h-5 w-5 animate-spin" />
                  SAY-HARAKAT BILAN SINTEZ QILINMOQDA...
                </>
              ) : (
                <>
                  <Play className="h-5 w-5 fill-current" />
                  MATNNI OVOZGA SINTEZ QILISH
                </>
              )}
            </button>
          </div>
        </section>

        {/* Right Side Panel: Active Audio Preview & History (Immersive Dark Sidebar) */}
        <section id="right_player" className="lg:col-span-5 bg-slate-900 flex flex-col border-t lg:border-t-0 lg:border-l border-slate-800 text-slate-200">
          
          <div className="flex-1 p-6 space-y-6 flex flex-col no-scrollbar overflow-y-auto">
            
            {/* Main Player Module */}
            <div id="active_audio_capsule" className="relative bg-slate-800/40 rounded-3xl p-5 border border-slate-800 overflow-hidden shadow-2xl">
              {/* Aesthetic Backdrop subtle glows */}
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-teal-500/10 blur-[80px] rounded-full"></div>
              
              <div className="relative flex flex-col items-center space-y-6">
                
                {/* Visual Status Indicator & Profile */}
                <div className="flex flex-col items-center">
                  <div className="w-28 h-28 rounded-full bg-slate-950 border-4 border-slate-800/80 flex items-center justify-center shadow-2xl relative">
                    <Disc className={`h-14 w-14 text-teal-500/20 ${isPlaying ? 'animate-spin-slow' : ''}`} />
                    
                    {/* Pulsating live active core */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className={`w-3.5 h-3.5 bg-teal-500 rounded-full shadow-[0_0_15px_rgba(20,184,166,0.9)] ${isPlaying ? 'animate-pulse' : ''}`}></div>
                    </div>
                  </div>

                  <div className="mt-4 text-center">
                    <h2 className="text-white font-bold text-base tracking-wide">
                      {activeAudioUrl ? `${activeVoiceName} ovozi` : "KUTISH REJIMI"}
                    </h2>
                    <p className="text-teal-400 text-xs font-mono mt-0.5">
                      {activeAudioUrl ? `Tayyor • ${activeStyle} • ${activeSpeed.toFixed(1)}x` : "Mono 24kHz • MP3 128kbps"}
                    </p>
                  </div>
                </div>

                {/* Empty State / Wait view */}
                {!activeAudioUrl ? (
                  <div id="empty_player_view" className="text-center py-4 px-3 space-y-2">
                    <Info className="h-5 w-5 text-slate-500 mx-auto animate-bounce" />
                    <p className="text-xs text-slate-400 leading-relaxed">
                      Hozircha hech qanday ovoz sintez qilinmadi. Sintez qilish tugmasini bosing yoki tayyor andozalardan birini tanlab ovoz hosil qiling.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Interactive SoundCloud Styled Waveform Scrubber */}
                    <div id="waveform_scrubber" className="w-full space-y-2">
                      <div className="w-full h-14 flex items-end justify-between gap-1 px-1">
                        {waveform.map((ptHeight, idx) => {
                          const barProgress = idx / waveform.length;
                          const currentProgress = duration ? (currentTime / duration) : 0;
                          const isActive = barProgress <= currentProgress;
                          
                          return (
                            <div
                              key={idx}
                              onClick={() => handleSeek(barProgress)}
                              className={`waveform-bar flex-1 rounded-sm cursor-pointer hover:scale-y-110 transition-all ${
                                isActive ? 'bg-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.5)]' : 'bg-slate-700 hover:bg-slate-600'
                              }`}
                              style={{ height: `${ptHeight}px` }}
                              title={`Sekund: ${formatTime(duration * barProgress)}`}
                            />
                          );
                        })}
                      </div>

                      {/* Timeline clock and seeker indicators */}
                      <div className="flex justify-between items-center text-[10px] font-mono text-slate-400 px-1">
                        <span>{formatTime(currentTime)}</span>
                        <span className="font-semibold text-slate-500">O'tkazish uchun bosing</span>
                        <span>{formatTime(duration)}</span>
                      </div>
                    </div>

                    {/* Active Play Controls */}
                    <div id="player_action_controls" className="flex items-center gap-5 justify-center py-2">
                      <button
                        type="button"
                        onClick={togglePlay}
                        id="btn_toggle_play"
                        className="w-14 h-14 bg-teal-500 text-slate-950 rounded-full flex items-center justify-center shadow-lg shadow-teal-500/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        title={isPlaying ? "Musiqani to'xtatish" : "Tinglash"}
                      >
                        {isPlaying ? (
                          <Pause className="h-6 w-6 text-slate-950 fill-current" />
                        ) : (
                          <Play className="h-6 w-6 text-slate-950 fill-current ml-1" />
                        )}
                      </button>
                    </div>

                    {/* Web Audio spectrum frequency bars canvas viz */}
                    <div id="frequency_visualizer_box" className="w-full bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80">
                      <p className="text-[8px] font-bold font-mono tracking-widest text-slate-500 uppercase mb-1 px-1 text-center">
                        REAL-TIME CHASTOTA ANALIZATORI (SPEKTRUM)
                      </p>
                      <canvas
                        ref={canvasRef}
                        width={300}
                        height={36}
                        className="w-full h-9 bg-transparent block"
                      />
                    </div>
                  </>
                )}

              </div>
            </div>

            {/* MP3 Export Section */}
            {activeAudioUrl && activeMp3Blob && (
              <div id="export_card" className="bg-slate-800/30 rounded-2xl p-4 border border-slate-800/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-teal-500/10 flex items-center justify-center">
                    <Download className="h-5 w-5 text-teal-400" />
                  </div>
                  <div>
                    <p className="text-white text-xs font-semibold">MP3 Audio (HD 128kbps)</p>
                    <p className="text-[10px] text-slate-500">LameJS yordamida tezkor MP3 o'tkazish yakunlandi.</p>
                  </div>
                </div>
                <button
                  type="button"
                  id="btn_download_mp3"
                  onClick={handleDownloadMp3}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-750 text-teal-400 text-[10px] font-bold rounded-lg border border-teal-500/30 hover:border-teal-400 transition-colors uppercase tracking-wider shrink-0 cursor-pointer"
                >
                  TAYYOR MP3 YUKLASH
                </button>
              </div>
            )}

            {/* History Block */}
            <div id="history_block" className="flex-1 flex flex-col space-y-3 min-h-[220px]">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  Oxirgi sintez qilingan ovozlar
                </h3>
                {history.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearHistory}
                    className="text-[10px] text-slate-500 hover:text-red-400 font-medium transition-colors cursor-pointer"
                  >
                    Tarixni tozalash
                  </button>
                )}
              </div>

              {history.length === 0 ? (
                <div id="empty_history" className="flex-1 flex flex-col items-center justify-center text-center p-4 rounded-xl border border-dashed border-slate-800/60 text-slate-500">
                  <p className="text-xs font-semibold">Hali ovozlar sintez qilinmadi</p>
                  <p className="text-[10px] text-slate-600 mt-1">Siz yaratgan ovozlar shu yerda saqlanadi.</p>
                </div>
              ) : (
                <div id="history_list" className="space-y-2 overflow-y-auto max-h-56 pr-1 custom-scrollbar">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleLoadHistoryItem(item)}
                      className="bg-slate-850/40 hover:bg-slate-800/60 border border-slate-800/50 rounded-xl p-3 flex items-center justify-between group cursor-pointer transition-all"
                      title="Qayta yuklash uchun bosing"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-teal-400 group-hover:bg-teal-500/20 group-hover:text-teal-300 transition-colors shrink-0">
                          <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs text-slate-200 font-medium truncate pr-2">{item.text}</p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {item.voiceName} • {item.style} • {item.speed.toFixed(1)}x • {item.timestamp}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-600 hover:text-red-400 hover:bg-slate-800/80 rounded-lg transition-all shrink-0 cursor-pointer"
                        title="Tarixdan o'chirish"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Footer Copyright details */}
          <footer id="app_footer" className="p-4 bg-slate-950 border-t border-slate-800/80 text-center space-y-1">
            <p className="text-[10px] text-slate-500">
              © 2026 O'zbek Ovoz AI. Barcha huquqlar himoyalangan.
            </p>
            <p className="text-[10px] text-slate-600 font-medium italic">
              Sintez va audio vizualizatsiya to'liq browserda va serverda xavfsiz boshqariladi.
            </p>
          </footer>

        </section>

      </main>
    </div>
  );
}
