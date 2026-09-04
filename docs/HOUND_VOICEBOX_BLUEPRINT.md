# Blueprint de Integración: Hound MCP, Voicebox, OpenHuman & n8n para YZAI

Este documento establece la arquitectura y pasos para habilitar las nuevas capacidades de búsqueda web gratuita, clonación de voz local (Voicebox), orquestación de agentes personales (OpenHuman) y automatización con n8n en el servidor **YZAI** (Minisforum X1 Pro AI — AMD Ryzen AI 9 HX 370 / Radeon 890M).

---

## 1. Hound MCP: Navegación & Búsqueda Web 100% Gratuita (Keyless)

### ¿Qué aporta a YZAI?
- **Sustituye:** Tavily ($20/mes), Firecrawl ($16–50/mes) y pipelines frágiles de SearXNG.
- **Herramientas MCP nativas:**
  1. `web_fetch`: Extracción limpia a Markdown con bypass antibot, OCR automático para PDFs y recuperación automática desde Archive.org si el sitio está caído.
  2. `web_search`: Búsqueda paralela en 10 motores (DuckDuckGo, Brave, Mojeek, Yandex, Google) con reordenamiento neuronal local.
  3. `web_crawl`: Recorrido inteligente por dominio (hasta 100 páginas) o modo sitemap.
  4. `web_screenshot`: Capturas de pantalla resistentes a antibot para modelos multimodales.

### Instalación en YZAI (Host o Docker Sidecar)
Conéctate por SSH a YZAI (`ssh yzai`):

```bash
# 1. Crear entorno virtual dedicado para MCP servers
python3 -m venv ~/mcp-servers/hound-venv
source ~/mcp-servers/hound-venv/bin/activate

# 2. Instalar Hound con soporte completo (ONNX Runtime + OCR)
pip install --upgrade "hound-mcp[all]"

# 3. Verificar instalación
hound --version
```

### Configuración en MCP Client / Open-WebUI
Para vincular Hound a los agentes o a Open-WebUI como servidor stdio o SSE:
```json
{
  "mcpServers": {
    "hound": {
      "command": "/home/yepzhi/mcp-servers/hound-venv/bin/hound",
      "args": ["serve"]
    }
  }
}
```

---

## 2. Voicebox (`jamiepine/voicebox`): Estudio de Voz Local & Clonación Zero-Shot

### ¿Qué aporta a YZAI?
- **Sustituye:** ElevenLabs ($20–100/mes) y cuotas de caracteres en la nube.
- **Capacidades:**
  - Clonación de voz de alta fidelidad con solo 3 segundos de muestra de audio de referencia.
  - Generación local ultrarrápida usando **Kokoro** o **Qwen3-TTS**.
  - **Servidor MCP nativo + REST API**: Permite a cualquier agente de YZAI generar notas de voz o responder usando tu propia voz clonada.
  - Aceleración PyTorch / ROCm en la iGPU Radeon 890M de YZAI o MLX en Mac.

### Despliegue en YZAI
```bash
# 1. Clonar el repositorio oficial
git clone https://github.com/jamiepine/voicebox.git ~/voicebox
cd ~/voicebox

# 2. Configurar backend FastAPI
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 3. Iniciar el servicio con la API expuesta
uvicorn main:app --host 0.0.0.0 --port 8010
```

### Integración con el `docker-compose.yml` de YZAI
Puedes apuntar el motor `AUDIO_TTS_OPENAI_API_BASE_URL` de Open-WebUI o tus agentes a `http://host.docker.internal:8010/v1` para generar audios usando las voces clonadas.

---

## 3. OpenHuman (`tinyhumansai/openhuman`): Asistente Personal & Memoria Local

### ¿Qué es y qué resuelve?
- Sistema de asistente personal local en **Rust** enfocado en privacidad y memoria a largo plazo ("Memory Tree" / Wiki).
- Cuenta con 118+ integraciones (Gmail, Notion, GitHub, Slack, Linear, Jira).
- **Rol en YZAI:** Excelente para agentes autónomos que necesitan consultar contexto acumulado de múltiples herramientas sin depender de servicios de embedding en la nube.

---

## 4. Awesome n8n Templates (`enescingoz/awesome-n8n-templates`)

### Plantillas recomendadas para JóvenesSTEM & YZAI:
1. **Emisión y Envío de Diplomas por Webhook:**
   - Webhook recibe evento de acreditación de JóvenesSTEM (`cert.js` / Open Badges 3.0).
   - Genera PDF con firma digital y envía correo institucional al alumno.
2. **Distribuidor de Microaprendizajes STEM en Redes:**
   - Consume periódicamente un módulo de JóvenesSTEM de la base de 225 módulos.
   - Pide a Ollama (en YZAI) que genere una síntesis atractiva para LinkedIn/X y la programa automáticamente.
3. **Agente de Investigación Autónomo con Hound:**
   - Trigger programado en n8n -> Ejecuta búsqueda profunda con Hound MCP -> Sintetiza con LLM local -> Guarda reporte en Notion o base de datos.
