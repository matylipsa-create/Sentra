# SENTRA v2.0 - Adaptive Reactive System 🛡️
> *PWA de Respuesta de Emergencia de Élite y Pipeline Cognitivo en la Nube*
> Proyecto postulado para la Competencia de Innovación Santander X (2026).

SENTRA v2.0 es una aplicación de comando táctico de nivel industrial diseñada para entornos de despacho de emergencias de alta criticidad. Optimizado específicamente para su despliegue móvil en hardware Android/ZTE, el sistema conecta biometría en el borde (edge), flujos de video computacional en tiempo real y filtrado cognitivo de IA en la nube mediante una arquitectura descentralizada de alta disponibilidad.

---

## ⚡ Pilares Centrales y Ventajas Competitivas

* *Telemetría Biométrica en el Borde:* Monitoreo continuo en segundo plano que mapea la frecuencia cardíaca (BPM) en tiempo real y las constantes vitales críticas para el perfilamiento del operador en terreno.
* *Resiliencia de Doble Canal (Failsafe sin Cuenta):* Enrutamiento multi-nivel integrado. Si la infraestructura principal en la nube sufre saturación o caídas de conexión, el motor de estado del cliente inicia una redirección directa de contingencia hacia la API de Telegram mediante peticiones HTTP POST crudas.
* *Ventana de Bloqueo Seguro (Safe-Lock contra Pánico):* Un búfer táctico de cuenta regresiva de 3 segundos en los activadores manuales, lo que permite la cancelación inmediata para eliminar falsos positivos en entornos operativos caóticos.
* *Limitación de Ráfagas Determinista (Throttling):* Ventanas de bloqueo contextual de 10 segundos tanto en el servidor como en el cliente (control_flow) que mitigan ráfagas de datos, duplicaciones o activaciones accidentales repetidas.

---

## 🌐 Arquitectura del Sistema y Flujo del Pipeline

El ecosistema de SENTRA desacopla la recolección de datos en campo del enriquecimiento semántico y geográfico profundo:

1. *El Músculo (Aplicación Cliente ZTE):* Captura coordenadas nativas de alta precisión mediante la API de Geolocalización, activa los búferes de la cámara del dispositivo y procesa las variables biométricas en vivo.
2. *El Enrutador (Núcleo Pipedream):* Gestiona la ingesta asincrónica, ejecuta comprobaciones de límite de ráfagas mediante entornos de ejecución personalizados en Node.js y coordina las rutas de respaldo secundarias.
3. *El Cerebro (Modelo de Fusión Cognitiva):* Envía la telemetría y las imágenes capturadas a través de un pipeline de IA (Motor Gemini) para obtener evaluaciones situacionales perimetrales instantáneas.
4. *Resolución Geográfica (OpenStreetMap):* Una codificación geográfica inversa traduce los datos crudos de latitud y longitud en direcciones postales estructuradas y legibles en tiempo real.
5. *Estandarizador y Persistencia de Datos:* Formatea los payloads volátiles en vectores JSON limpios antes de registrarlos en libros estructurados (registros_sentra) y en el panel operativo de Telegram.

---

## 🛠️ Stack Tecnológico y Métricas de Producción

* *Frontend:* Vite, React, Tailwind CSS, Lucide Icons, APIs de Sensores HTML5 (Cámara / Geolocalización).
* *Backend y Orquestación:* Flujo de trabajo Serverless en Pipedream, Node.js 20.x, Cliente HTTP Axios.
* *Integración de IA:* Modelo Cognitivo Google Gemini.
* *Capa de Resiliencia:* Enrutamiento de Telemetría Dual-Channel (Webhook Principal + API de Telegram Directa).
* *Optimización de Compilación:* Tamaño de distribución ultra ligero (~114.76 KB gzipped) con seguridad estricta en TypeScript y 0 advertencias de ESLint.

---

## 📦 Configuración Local y Despliegue

### Compilación del Cliente
Para instalar y previsualizar la versión optimizada para producción de forma local:

```bash
# Clonar el repositorio
git clone [https://github.com/](https://github.com/)[tu-usuario]/[tu-repositorio].git

# Navegar al directorio del proyecto
cd sentra-v2-core

# Instalar dependencias
npm install

# Ejecutar el entorno de desarrollo
npm run dev

# Compilar la versión de producción lista para APK
npm run build
