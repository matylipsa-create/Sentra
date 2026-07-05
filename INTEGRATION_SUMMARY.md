# SENTRA — Dashboard Táctico Integrado

## Resumen de Integración

Se ha integrado exitosamente el **Dashboard Táctico Interactivo** como la interfaz principal del sistema SENTRA, mantiendo la lógica híbrida de control táctil (SENTRA-Touch) y conectividad Bluetooth.

---

## Arquitectura Técnica

### 1. Capa Bluetooth (`src/lib/bluetooth.ts`)
- **BluetoothManager**: Gestor de conexiones y dispositivos
- Escaneo de dispositivos (sensores, wearables, cámaras)
- Simulación de datos biométricos cuando no hay Bluetooth real
- Interfaz unificada para múltiples fuentes de datos

**Dispositivos soportados:**
- SENTRA HR-01 (sensor de frecuencia cardiaca)
- Smartwatch Zephyr (wearable multisensor)
- SENTRA Camera-A (cámara de seguridad)

### 2. Sistema de Reconocimiento de Gestos (`src/lib/gestures.ts`)
- **GestureRecognizer**: Detección táctil en tiempo real
- Gestos soportados:
  - `tap`: Toque simple — activación de controles
  - `double-tap`: Doble toque — modo fullscreen
  - `long-press`: Presión larga — opciones del card
  - `swipe-up`: Desliz arriba → Modo STABILIZE
  - `swipe-down`: Desliz abajo → Modo OBSERVE
  - `pinch-zoom`: Pellizco → Cambio de layout (2 → 3 columnas)
  - `circular-swipe`: Gesto circular → Modo ASSIST

**Propiedades de Gesto:**
```typescript
{
  type: 'tap' | 'swipe-up' | 'pinch-zoom' | ...
  startX, startY, endX, endY: número
  duration: ms
  intensity: 0-1
  pressure: 0-1 (con Force Touch)
}
```

### 3. Pipeline de Agregación de Sensores (`src/lib/sensorPipeline.ts`)
- **SensorPipeline**: Procesamiento y análisis de datos biométricos
- Mantiene buffer circular de 300 lecturas (5 minutos a 1Hz)
- Cálculo de métricas agregadas cada 60 segundos

**Métricas Computadas:**
```typescript
{
  heartRateAvg: número BPM
  heartRateVariability: variabilidad en ms
  respirationPattern: 'steady' | 'normal' | 'rapid' | 'irregular'
  stressLevel: 0-100%
  coherence: 0-1 (correlación HR-respiración)
  timestamp: Date
}
```

**Procesamiento Automático:**
- Detección de alertas biométricas (HR alto, baja O2, respiración rápida)
- Persistencia en Supabase (`security_logs`)
- Cambio automático de modo según nivel de estrés

### 4. Dashboard Táctico (`src/components/TacticalDashboard.tsx`)
- Grid responsivo 2x3 o 3x3 (controlado por pellizco)
- 6 cards biométricas:
  - Frecuencia Cardiaca (BPM, color rojo)
  - Respiración (RPM, color azul)
  - Conductancia de Piel (µS, color verde)
  - Temperatura (°C, color naranja)
  - Variabilidad HR (ms, color púrpura)
  - Saturación O2 (%, color cian)

- Sección de Dispositivos (3 cards con estado de conexión)
- Indicador de modo con alertas visuales
- Gestión de fullscreen por doble toque

### 5. Hook de Integración (`src/hooks/useTacticalDashboard.ts`)
- **useTacticalDashboard()**: Orquestación completa
- Suscripción a datos Bluetooth
- Integración con pipeline de sensores
- Cambio automático de modo basado en umbrales de estrés
- Control de alertas visuales

---

## Flujo de Datos

```
Bluetooth/Sensores
      ↓
BluetoothManager (simula si no hay device real)
      ↓
SensorPipeline (procesa, calcula métricas)
      ↓
useTacticalDashboard (hook centralizado)
      ↓
TacticalDashboard (renderiza UI)
      ↓
AppContext (persiste modo, umbrales)
      ↓
Supabase (logs de alertas)
```

---

## Control Híbrido (SENTRA-Touch + Bluetooth)

### Entrada Táctil (SENTRA-Touch)
1. **Desliza arriba** → Cambiar a modo STABILIZE (regulación)
2. **Desliza abajo** → Cambiar a modo OBSERVE (monitoreo pasivo)
3. **Gesto circular** → Cambiar a modo ASSIST (asistencia activa)
4. **Pellizca afuera** → Expandir grid a 3 columnas
5. **Pellizca adentro** → Reducir a 2 columnas
6. **Doble toque** → Fullscreen del card de biometría
7. **Presión larga** → Menú de opciones (implementar según necesidad)

### Datos Bluetooth (Dispositivos Reales o Simulados)
- **HR Sensor**: Frecuencia cardiaca en tiempo real
- **Wearable**: Múltiples métricas (HR, respiración, temperatura, etc.)
- **Cámara**: Datos de seguridad (futuro: análisis de movimiento)

### Cambio Automático de Modo
```javascript
if (stressLevel > stressThreshold) {
  setMode('STABILIZE')  // Protocolo de regulación
  setStatus('alert')
} else if (stressLevel < calmThreshold && wasAlert) {
  setMode('ASSIST')     // Volver a modo normal
  setStatus('calm')
}
```

---

## Estados Visuales de Biometría

| Métrica | Normal | Warning | Critical |
|---------|--------|---------|----------|
| HR | 60-80 BPM | 80-120 | <40 o >120 |
| O2 | >96% | 94-96% | <94% |
| Resp | 12-18 RPM | 18-25 | >25 |
| Temp | 36.5-37.5°C | 37.5-38.5 | >38.5 |
| SC | <4µS | 4-8µS | >8µS |

---

## Persistencia y Sincronización

### LocalStorage (Estado Local)
- `sentra_mode`: Modo actual (ASSIST/STABILIZE/OBSERVE)
- `sentra_status`: Estado del Daemon (calm/alert/active)
- `sentra_agents`: Activación de agentes
- `sentra_biometric`: Configuración de sensores y umbrales

### Supabase (Persistencia en Nube)
- Tabla `security_logs`: Alertas biométricas críticas
- Tabla `chat_messages`: Interacciones con regulación
- Tabla `agent_states`: Estado de los agentes

---

## Configuración de Umbrales

Disponible en la página **Settings**:
- **Umbral de Estrés**: 70% (por defecto)
- **Umbral de Calma**: 40% (por defecto)
- **Velocidad de Voz**: 0.85x
- **Tono de Voz**: 1.0
- **Volumen**: 100%

---

## Próximas Mejoras Opcionales

1. **Predicción de Crises**: ML para anticipar cambios
2. **Grabación de Sesiones**: Persistencia de todos los datos biométricos
3. **Compartir Datos**: Enviar reportes a profesionales de salud
4. **Análisis de Patrones**: Gráficos históricos de coherencia
5. **Integración con Wearables Reales**: Apple Watch, Fitbit, etc.
6. **Geolocalización**: Registrar ubicación de eventos críticos
7. **Notificaciones Push**: Alertas en tiempo real al teléfono

---

## Uso del Sistema

### 1. Dashboard Principal
- Abre la app → Dashboard muestra grid táctico
- Observa datos biométricos en tiempo real
- Dispositivos Bluetooth conectados abajo

### 2. Interactuar
- Desliza para cambiar modos
- Pellizca para cambiar layout
- Toca un card para más detalles

### 3. Regulación
- Si el estrés sube → Sistema cambia a STABILIZE automáticamente
- Ve a **Regulación** para chat de resonancia
- Usa **Web Speech API** para síntesis de voz en español

### 4. Operaciones & Cámaras
- Monitorea logs de seguridad
- Ve feeds de cámara Bluetooth

### 5. Configuración
- Ajusta umbrales de estrés/calma
- Configura sensores
- Personaliza voz

---

## Notas de Implementación

- **Bajo Latencia**: Todos los cálculos se hacen localmente (< 500ms)
- **Offline-First**: App funciona sin conexión (modo simulación)
- **Progressive Enhancement**: Bluetooth es opcional, funciona sin él
- **Accesibilidad**: Tamaños de touch > 44px, colores con suficiente contraste
- **Rendimiento**: Máx 300 lecturas en memoria, las antiguas se descartan

---

## Versión
**SENTRA v1.0 — $150 USD**

Producto comercial unificado de STAR OPS (Seguridad Operacional) y EVOLIS Core (Regulación Cognitiva y Ética).
