# 🏆 CONFIGURACIÓN GOLDEN: Arquitectura de Inteligencia Artificial (MiniPC 24/7)

Este documento representa la **Configuración Dorada (Golden Standard)** para el servidor de Inteligencia Artificial dedicado en la Mini PC (con GPU AMD Radeon 890M - Strix Point) para **YZAI** y el ecosistema educativo **JóvenesSTEM / STEMBot**.

---

## 1. 🛑 Diagnóstico de Averías y Análisis de Causa Raíz (Root Cause Analysis)

Durante las pruebas de alta demanda y concurrencia (picos de uso e invocación de modelos), se detectó una falla crítica de infraestructura:
* **El Síntoma**: Al enviar una petición de chat en la interfaz web, la GPU caía a **5% de uso**, la latencia superaba los **40 segundos** sin devolver respuesta (*"generando..."*), el disco duro SSD NVMe se saturaba al **100% de lecturas**, y la memoria VRAM de la GPU **caía de 15.5 GB a 0 GB en dos ocasiones**.
* **El Diagnóstico Mecánico**:
  1. **Conflicto y Desalojo de Memoria (Eviction por Parámetros Discrepantes)**:
     * El servicio de arranque cargaba en VRAM el modelo `qwen36-yzai:latest` con la ventana de contexto por defecto del *Modelfile* (`num_ctx = 16384`).
     * Cuando el cliente web o STEMBot enviaba una consulta, solicitaba explícitamente `options: { num_ctx: 8192 }`.
     * Al detectar que el tamaño de ventana de contexto en memoria era incompatible (`8192 ≠ 16384`), **Ollama desalojaba (evict) inmediatamente el modelo de 14.2 GB de la VRAM cayendo a 0 GB** para reiniciar la carga desde cero con el nuevo parámetro.
  2. **Cuello de Botella I/O por Bloqueo de Memoria Mapeada (`use_mmap: false`)**:
     * Tanto en el *Modelfile* como en las variables del sistema existía la directiva de desactivación de memoria mapeada (`PARAMETER use_mmap false` / `OLLAMA_NO_MMAP=1`).
     * En Linux, al prohibir el uso de `mmap`, se anula la capacidad del sistema operativo de realizar un mapeo instantáneo de memoria virtual en la arquitectura de memoria unificada (RAM/VRAM) del procesador AMD Ryzen/Radeon 890M.
     * Esto obligaba a Llama.cpp a abrir el archivo GGUF de **14.2 GB en el SSD** y copiarlo byte por byte hacia la RAM/VRAM con lecturas secuenciales. Esto consumía el **100% del ancho de banda del SSD durante ~37 segundos**, mientras la GPU permanecía en espera inactiva.

---

## 2. ⚡ Parámetros Golden: Sistema, Motor y Modelo

Para garantizar la inmutabilidad de la memoria VRAM, eliminar operaciones en SSD tras el arranque y mantener el modelo **caliente al 100% las 24 horas del día**, los siguientes ajustes son de estricto cumplimiento:

### A. Especificaciones en el Modelfile (`qwen36-yzai:latest`)
El modelo debe construirse eximiendo restricciones de `mmap` y fijando la ventana de 8,192 como estándar nativo:

```dockerfile
FROM /usr/share/ollama/.ollama/models/blobs/sha256-d4651d9b24f6a59511867decc49aa745c9d48c23ee552b059b0cadf05db723d9
TEMPLATE "{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}<|im_start|>user
{{ .Prompt }} /no_think<|im_end|>
<|im_start|>assistant
"
PARAMETER num_ctx 8192
PARAMETER num_gpu 99
PARAMETER num_keep -1
PARAMETER num_predict -1
PARAMETER repeat_penalty 1
PARAMETER temperature 1
# NOTA KRÍTICA: ¡JAMÁS AGREGAR "PARAMETER use_mmap false"! Permitir mmap para carga instantánea en RAM/VRAM unificada.
```

---

### B. Servicio Systemd (`/etc/systemd/system/ollama.service.d/override.conf`)
En el servidor local de la Mini PC (`yzai-local`), el archivo de reemplazo del servicio debe contener únicamente los siguientes entornos para aceleración AMD ROCm/Vulkan:

```ini
[Service]
Environment="OLLAMA_ORIGINS=*"
Environment="OLLAMA_HOST=0.0.0.0:11434"
Environment="OLLAMA_KEEP_ALIVE=-1"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_CONTEXT_LENGTH=8192"
Environment="HSA_OVERRIDE_GFX_VERSION=11.0.3"
# NOTA: Prohibido colocar OLLAMA_NO_MMAP=1 o limitar los hilos en conflicto.
```

---

## 3. 🔥 Servicios Watchdog para VRAM 24/7 "Siempre Caliente"

Para que la Mini PC cumpla con su función única y exclusiva (servir IA en caliente con 0 milisegundos de retraso inicial), se instalaron dos scripts de control soberano en `/usr/local/bin/`:

### 1. Script de Precarga Inteligente en Arranque (`/usr/local/bin/preload-ollama.sh`)
Se ejecuta de forma asíncrona tras el inicio de `ollama.service` (`ExecStartPost`). Realiza un sondeo (polling de hasta 30 segundos) esperando a que los drivers Vulkan/AMD estén listos y el puerto HTTP 11434 responda en un encendido en frío, inyectando inmediatamente el modelo en VRAM al confirmar conectividad:
```bash
#!/bin/bash
(
  for i in {1..30}; do
    if curl -s http://127.0.0.1:11434/ > /dev/null 2>&1; then
      break
    fi
    sleep 1
  done
  curl -s -X POST http://127.0.0.1:11434/api/generate \
    -H "Content-Type: application/json" \
    -d '{"model": "qwen36-yzai:latest", "keep_alive": -1, "options": {"num_ctx": 8192}}' > /dev/null 2>&1
) &
```

### 2. Daemon Watchdog Permanente (`/usr/local/bin/ollama-watchdog.sh`)
Supervisado por el temporizador del sistema `ollama-watchdog.timer` cada 2 minutos. Verifica si el modelo está montado en VRAM; en caso de caída o reinicio manual del servidor, inyecta los tensores nuevamente sin alteración de parámetros:
```bash
#!/bin/bash
LOADED=$(curl -s http://127.0.0.1:11434/api/ps | grep -o "qwen36-yzai:latest")
if [ -z "$LOADED" ]; then
    echo "$(date): Modelo qwen36-yzai:latest no detectado en VRAM. Cargando en caliente..."
    curl -s -X POST http://127.0.0.1:11434/api/generate \
      -H "Content-Type: application/json" \
      -d '{"model": "qwen36-yzai:latest", "keep_alive": -1, "options": {"num_ctx": 8192}}' \
      > /dev/null 2>&1 &
fi
```

---

## 4. 🤖 Integración con Clientes Web y STEMBot

Para preservar la armonía de la infraestructura:
1. **STEMBot (`JSweb/_src/tutor.js`)**:
   * Invoca al modelo local exigiendo los mismos parámetros dorados: `num_ctx: 8192`, `think: false` y `keep_alive: -1`.
   * **Fast Failover (6 Segundos)**: Como la IA está 100% en caliente en VRAM, su tiempo normal de respuesta es $<2$ segundos. Si la MiniPC no contesta en $\le 6$ segundos, STEMBot corta la solicitud con un `AbortController` y redirige el flujo hacia Google Gemini (vía Cloudflare Workers) sin frustrar la experiencia del alumno.
2. **Interfaz Web YZAI (`yzai/index.html`)**:
   * Eliminada cualquier alerta de "recarga en curso tras inactividad", pues el servidor garantiza resiliencia 24/7 en memoria.
   * **Efecto Typewriter Normalizado Ultrarrápido**: Reemplazado el algoritmo de vaciado de bloques de texto. Ahora avanza mediante un paso proporcional suave (entre 2 y 6 caracteres a 60 FPS), absorbiendo velocidades de generación extremas (~30+ t/s) con una estética fluida sin saltos ni bloqueos.

---

## 5. 📈 Rendimiento de Referencia (Benchmarks Verificados)

Tras la implementación de la **Configuración Golden**, las métricas de respuesta verificadas son:

| Métrica de Sistema | Estado Pre-Golden | Estado Golden Standard |
| :--- | :--- | :--- |
| **Tiempo de "Carga" en Memoria (`load_duration`)** | **36.72 segundos** (con Swap de SSD) | **172 milisegundos (0.17s)** (VRAM intacta) |
| **Estrés en Disco Duro (SSD NVMe IOPS)** | **100% al tope en cada desalojo** | **0% durante la inferencia** |
| **Latencia de Respuesta Completa (`think: false`)** | **>40 segundos / Caída por Timeout** | **0.94 segundos** (Respuesta inmediata) |
| **Estabilidad VRAM (Radeon 890M)** | Caída periódica a 0 GB | **Permanencia 24/7 (15.1 GB activados)** |
