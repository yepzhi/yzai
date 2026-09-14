import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec, spawn } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

const PORT = 8010;
const OUTPUT_DIR = "/home/yepzhi/voicebox/output";
const PROFILES_DIR = "/home/yepzhi/voicebox/profiles";
const OPENEDAI_URL = "http://127.0.0.1:8000/v1/audio/speech";

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(PROFILES_DIR, { recursive: true });

const PRESET_VOICES = [
  { id: "echo", name: "Echo (Voz Profunda y Clara)", type: "neural", gender: "male", lang: "es/en" },
  { id: "alloy", name: "Alloy (Voz Neutral y Precisa)", type: "neural", gender: "neutral", lang: "es/en" },
  { id: "nova", name: "Nova (Voz Cálida y Expresiva)", type: "neural", gender: "female", lang: "es/en" },
  { id: "onyx", name: "Onyx (Voz Autoritaria y Firme)", type: "neural", gender: "male", lang: "es/en" },
  { id: "fable", name: "Fable (Voz Dinámica y Narrativa)", type: "neural", gender: "male", lang: "es/en" },
  { id: "shimmer", name: "Shimmer (Voz Suave y Elegante)", type: "neural", gender: "female", lang: "es/en" }
];

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
}

function sendJson(res, data, status = 200) {
  setCors(res);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 50 * 1024 * 1024) { // 50MB limit
        req.destroy();
        reject(new Error("Payload too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  console.log(`[Voice Studio] ${req.method} ${pathname}`);

  // 1. Health check
  if (req.method === "GET" && (pathname === "/api/voice/health" || pathname === "/health")) {
    return sendJson(res, {
      status: "online",
      engine: "Voicebox & OpenedAI XTTS Neural",
      hardware: "AMD Ryzen AI 9 HX 370 / Radeon 890M",
      outputDir: OUTPUT_DIR,
      timestamp: Date.now()
    });
  }

  // 2. List Profiles
  if (req.method === "GET" && pathname === "/api/voice/profiles") {
    try {
      const files = fs.readdirSync(PROFILES_DIR);
      const cloned = [];
      for (const f of files) {
        if (f.endsWith(".json")) {
          try {
            const raw = fs.readFileSync(path.join(PROFILES_DIR, f), "utf8");
            cloned.push(JSON.parse(raw));
          } catch {}
        }
      }
      return sendJson(res, {
        cloned,
        presets: PRESET_VOICES
      });
    } catch (err) {
      return sendJson(res, { error: err.message }, 500);
    }
  }

  // 3. Clone Voice (Save Audio Sample & Register)
  if (req.method === "POST" && pathname === "/api/voice/clone") {
    try {
      const body = await parseJsonBody(req);
      const { name, audioBase64, format = "webm", lang = "es" } = body;

      if (!audioBase64 || audioBase64.length < 100) {
        return sendJson(res, { error: "Los datos de audio son obligatorios y no deben estar vacíos." }, 400);
      }

      const cleanName = (name || "Mi_Voz")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .substring(0, 32) || "cloned_voice";

      const voiceId = `${cleanName}_${Date.now().toString(36)}`;

      // Robust base64 extraction: handle data:audio/...;base64, or data:video/...;base64, or plain base64
      let cleanBase64 = audioBase64;
      let detectedFormat = format || "webm";

      if (typeof cleanBase64 === "string" && cleanBase64.startsWith("data:")) {
        const commaIdx = cleanBase64.indexOf(",");
        if (commaIdx !== -1) {
          const header = cleanBase64.substring(0, commaIdx).toLowerCase();
          cleanBase64 = cleanBase64.substring(commaIdx + 1);

          if (header.includes("mp4") || header.includes("m4a") || header.includes("aac")) {
            detectedFormat = "m4a";
          } else if (header.includes("webm")) {
            detectedFormat = "webm";
          } else if (header.includes("wav")) {
            detectedFormat = "wav";
          } else if (header.includes("ogg")) {
            detectedFormat = "ogg";
          } else if (header.includes("mp3") || header.includes("mpeg")) {
            detectedFormat = "mp3";
          }
        }
      } else if (typeof cleanBase64 === "string" && cleanBase64.includes(",")) {
        cleanBase64 = cleanBase64.split(",")[1];
      }

      // Remove any leftover whitespace or newlines
      cleanBase64 = cleanBase64.replace(/\s+/g, "");

      const buffer = Buffer.from(cleanBase64, "base64");
      if (!buffer || buffer.length < 500) {
        return sendJson(res, { error: "La muestra de audio enviada es demasiado corta o no contiene datos válidos." }, 400);
      }

      const tmpInput = `/tmp/raw_${voiceId}.${detectedFormat}`;
      const finalWav = path.join(OUTPUT_DIR, `${voiceId}.wav`);

      fs.writeFileSync(tmpInput, buffer);

      // Convert using ffmpeg to 22050Hz 16-bit PCM Mono WAV (Standard format for XTTS / neural voice cloning)
      try {
        await execAsync(`ffmpeg -y -i "${tmpInput}" -ar 22050 -ac 1 -c:a pcm_s16le "${finalWav}"`);
      } catch (err) {
        console.warn("FFmpeg standard conversion failed, attempting format auto fallback:", err.message);
        try {
          const forceFormat = detectedFormat === "m4a" ? "mp4" : (detectedFormat === "webm" ? "matroska" : "auto");
          if (forceFormat !== "auto") {
            await execAsync(`ffmpeg -y -f ${forceFormat} -i "${tmpInput}" -ar 22050 -ac 1 -c:a pcm_s16le "${finalWav}"`);
          } else {
            throw err;
          }
        } catch (err2) {
          console.error("FFmpeg fatal conversion error:", err2);
          throw new Error("No se pudo procesar la muestra de audio con FFmpeg. Asegúrate de que el micrófono grabó correctamente.");
        }
      } finally {
        try { fs.unlinkSync(tmpInput); } catch {}
      }

      // Verify the generated WAV has valid size (> 1000 bytes)
      const wavStat = fs.statSync(finalWav);
      if (wavStat.size < 1000) {
        throw new Error("El archivo WAV generado es demasiado pequeño o está corrupto.");
      }

      // Calculate audio duration if ffprobe is available
      let durationText = "Voz grabada";
      try {
        const { stdout } = await execAsync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalWav}"`);
        const dur = parseFloat(stdout.trim());
        if (!isNaN(dur)) durationText = `${Math.round(dur)}s`;
      } catch {}

      // Copy to docker openedai-speech voices directory
      try {
        await execAsync(`sudo cp "${finalWav}" /var/lib/docker/volumes/voices/_data/${voiceId}.wav`);
        await execAsync(`sudo chmod 644 /var/lib/docker/volumes/voices/_data/${voiceId}.wav`);
        // Register in openedai-speech container
        await execAsync(`docker exec openedai-speech /app/add_voice.py "voices/${voiceId}.wav" -n "${voiceId}" -l "${lang}" || true`);
      } catch (dockerErr) {
        console.warn("Docker voice registration notice:", dockerErr.message);
      }

      const profile = {
        id: voiceId,
        name: name || "Mi Voz Clonada",
        type: "cloned",
        wavFile: `${voiceId}.wav`,
        date: new Date().toISOString(),
        duration: durationText,
        status: "ready"
      };

      fs.writeFileSync(path.join(PROFILES_DIR, `${voiceId}.json`), JSON.stringify(profile, null, 2));

      return sendJson(res, {
        success: true,
        message: "Voz clonada exitosamente con Voicebox & Radeon 890M",
        profile
      });
    } catch (err) {
      console.error("Clone error:", err);
      return sendJson(res, { error: err.message }, 500);
    }
  }

  // 4. Synthesize Speech
  if (req.method === "POST" && pathname === "/api/voice/synthesize") {
    try {
      const body = await parseJsonBody(req);
      const { text, voice = "echo", speed = 1.0, format = "mp3" } = body;

      if (!text || !text.trim()) {
        return sendJson(res, { error: "El texto es obligatorio" }, 400);
      }

      // Check if voice is cloned or preset
      let targetVoice = voice;
      const cleanText = text.trim().substring(0, 4000);

      // Call OpenedAI-Speech
      const ttsPayload = JSON.stringify({
        input: cleanText,
        voice: targetVoice,
        model: "tts-1-hd",
        speed: Number(speed) || 1.0
      });

      const proxyReq = http.request(OPENEDAI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(ttsPayload)
        }
      }, proxyRes => {
        if (proxyRes.statusCode !== 200) {
          return sendJson(res, { error: `TTS backend returned status ${proxyRes.statusCode}` }, 502);
        }

        const chunks = [];
        proxyRes.on("data", chunk => chunks.push(chunk));
        proxyRes.on("end", async () => {
          const mp3Buffer = Buffer.concat(chunks);

          // Save generated audio to output dir
          const genFilename = `gen_${Date.now()}_${targetVoice}.mp3`;
          try {
            fs.writeFileSync(path.join(OUTPUT_DIR, genFilename), mp3Buffer);
          } catch {}

          if (format === "wav") {
            const tmpMp3 = `/tmp/in_${Date.now()}.mp3`;
            const tmpWav = `/tmp/out_${Date.now()}.wav`;
            try {
              fs.writeFileSync(tmpMp3, mp3Buffer);
              await execAsync(`ffmpeg -y -i "${tmpMp3}" "${tmpWav}"`);
              const wavBuffer = fs.readFileSync(tmpWav);
              res.writeHead(200, {
                "Content-Type": "audio/wav",
                "Content-Length": wavBuffer.length,
                "Content-Disposition": `attachment; filename="yzai_voice_${targetVoice}.wav"`
              });
              res.end(wavBuffer);
              return;
            } catch (convErr) {
              console.warn("WAV conversion error, falling back to MP3:", convErr);
            } finally {
              try { fs.unlinkSync(tmpMp3); fs.unlinkSync(tmpWav); } catch {}
            }
          }

          res.writeHead(200, {
            "Content-Type": "audio/mpeg",
            "Content-Length": mp3Buffer.length,
            "Content-Disposition": `attachment; filename="yzai_voice_${targetVoice}.mp3"`
          });
          res.end(mp3Buffer);
        });
      });

      proxyReq.on("error", err => {
        console.error("Proxy error to TTS:", err);
        sendJson(res, { error: "No se pudo conectar al motor TTS local" }, 502);
      });

      proxyReq.write(ttsPayload);
      proxyReq.end();
      return;
    } catch (err) {
      console.error("Synthesize error:", err);
      return sendJson(res, { error: err.message }, 500);
    }
  }

  // 5. Download / Stream Sample or Generated File
  if (req.method === "GET" && pathname.startsWith("/api/voice/file/")) {
    const filename = path.basename(pathname.replace("/api/voice/file/", ""));
    const filePath = path.join(OUTPUT_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return sendJson(res, { error: "Archivo no encontrado" }, 404);
    }

    const stat = fs.statSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const contentType = ext === ".wav" ? "audio/wav" : (ext === ".mp3" ? "audio/mpeg" : "application/octet-stream");

    res.writeHead(200, {
      "Content-Type": contentType,
      "Content-Length": stat.size,
      "Content-Disposition": `inline; filename="${filename}"`
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  // 6. Delete profile
  if (req.method === "DELETE" && pathname.startsWith("/api/voice/profiles/")) {
    const id = path.basename(pathname.replace("/api/voice/profiles/", ""));
    try {
      const profilePath = path.join(PROFILES_DIR, `${id}.json`);
      const wavPath = path.join(OUTPUT_DIR, `${id}.wav`);
      if (fs.existsSync(profilePath)) fs.unlinkSync(profilePath);
      if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
      return sendJson(res, { success: true, deleted: id });
    } catch (err) {
      return sendJson(res, { error: err.message }, 500);
    }
  }

  sendJson(res, { error: "Not found" }, 404);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[YZAI Voice Studio] Service running on http://0.0.0.0:${PORT}`);
});
