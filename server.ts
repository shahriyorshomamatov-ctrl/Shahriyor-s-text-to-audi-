import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Enable large JSON bodies for requests
app.use(express.json({ limit: '10mb' }));

// Lazy init/helper to ensure robust API key validation
const getAIClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    throw new Error("GEMINI_API_KEY is not configured. Iltimos, AI Studio-da Secrets bo'limida GEMINI_API_KEY ni sozlang.");
  }
  return new GoogleGenAI({
    apiKey: apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
};

// Log warning if key is missing on start, but don't crash
const checkApiKeyConfigured = () => {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key === "MY_GEMINI_API_KEY") {
    console.warn("⚠️ [O'zbek Ovoz] DIQQAT: GEMINI_API_KEY muhit o'zgaruvchisi topilmadi. TTS va imlo tuzatish ishlamasligi mumkin.");
  } else {
    console.log("✅ [O'zbek Ovoz] GEMINI_API_KEY muvaffaqiyatli yuklandi.");
  }
};

// 1. Text-To-Speech Synthesis API Route
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voiceName, style, speed } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: "Sintez qilish uchun matn kiritilmagan." });
    }

    if (text.length > 1200) {
      return res.status(400).json({ error: "Matn uzunligi 1200 belgidan oshmasligi kerak." });
    }

    // Voice mapping: Convert Uzbek voice names to prebuilt system voices
    // Dilnoza -> Zephyr
    // Madina -> Kore
    // Sardor -> Puck
    // Jasur -> Charon
    // Farrux -> Fenrir
    const voiceMapping: Record<string, string> = {
      "Dilnoza": "Zephyr",
      "Madina": "Kore",
      "Sardor": "Puck",
      "Jasur": "Charon",
      "Farrux": "Fenrir"
    };

    const resolvedSystemVoice = voiceMapping[voiceName] || "Zephyr";

    // Style descriptor to guide TTS generation with correct emotion/style
    // Available styles: Tabiiy / Oddiy, Xushchaqchaq, Sokin va muloyim, Jiddiy / Rasmiy, Hayajonli / Dramatik
    const styleDescription: Record<string, string> = {
      "Tabiiy / Oddiy": "natural and balanced tone",
      "Xushchaqchaq": "cheerful, happy and energetic tone",
      "Sokin va muloyim": "calm, soft and gentle voice tone",
      "Jiddiy / Rasmiy": "serious, professional and formal lecture tone",
      "Hayajonli / Dramatik": "excited, emotional and dramatic speech style"
    };

    const resolvedStyle = styleDescription[style] || "natural and balanced tone";
    
    // Construct instructions/emotion guidance within the prompt
    // gemini-3.1-flash-tts-preview responds well to style modifiers in text prompt
    const userPrompt = `Say in a ${resolvedStyle} (playback speed factor ${speed || 1.0}): "${text}"`;

    const ai = getAIClient();

    console.log(`[O'zbek Ovoz API] TTS request received. Voice: ${resolvedSystemVoice} (${voiceName}), Style: ${resolvedStyle}, Length: ${text.length}`);

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: userPrompt }] }],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: resolvedSystemVoice },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

    if (!base64Audio) {
      throw new Error("Gemini API audio ma'lumotlarini qaytarmadi. Iltimos, qaytadan urinib ko'ring.");
    }

    // Return the base64 raw PCM bytes (24000Hz, mono, 16bit LE)
    res.json({
      success: true,
      audioBase64: base64Audio,
      metadata: {
        text,
        voiceName,
        resolvedSystemVoice,
        style,
        speed,
        sampleRate: 24000,
        channels: 1,
        bitsPerSample: 16
      }
    });

  } catch (error: any) {
    console.error("[O'zbek Ovoz API ERROR - TTS]:", error);
    res.status(500).json({ error: error.message || "Tizimda xatolik yuz berdi." });
  }
});

// 2. Intelligent Text Orthography Enhancer API Route
app.post("/api/enhance-text", async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: "Tahrirlash uchun matn kiritilmagan." });
    }

    if (text.length > 1200) {
      return res.status(400).json({ error: "Matn uzunligi 1200 belgidan oshmasligi kerak." });
    }

    const ai = getAIClient();

    // Emphatically instruct the model to return nothing else besides corrected text
    const systemInstruction = `Siz o'zbek tili tahrirchisisiz (Editor). Sizga matn yuboriladi. Vazifangiz:
1. Matn imlosini, tinish belgilarini va grammatikasini to'g'rilang.
2. O'zbek tilidagi o' (o‘ yoki o') va g' (g‘ yoki g') harflariga va tutuq belgilariga (’) alohida e'tibor bering. Standartlashtiring va xatolarni tuzating.
3. FAQAT tuzatilgan matnni qaytaring. Hech qanday tushuntirish, izoh yoki markdown (masalan, \`\`\`) formatlarini qo'shmang. Matn qanday bo'lsa, faqat to'g'rilangan variantini to'g'ridan-to'g'ri qaytaring.`;

    console.log(`[O'zbek Ovoz API] Text enhancement request received. Length: ${text.length}`);

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: text,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.1, // Low temperature for deterministic corrections
      },
    });

    const correctedText = response.text?.trim() || text;

    res.json({
      success: true,
      originalText: text,
      enhancedText: correctedText
    });

  } catch (error: any) {
    console.error("[O'zbek Ovoz API ERROR - ENHANCE]:", error);
    res.status(500).json({ error: error.message || "Tahrirlashda xatolik yuz berdi." });
  }
});

// Setup development and production pipelines
async function startServer() {
  checkApiKeyConfigured();

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("🚀 [O'zbek Ovoz] Vite dev server middleware mounted.");
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("🚀 [O'zbek Ovoz] Serving production static files.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌟 [O'zbek Ovoz] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
