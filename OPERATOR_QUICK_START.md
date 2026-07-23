# SENTRA v2.0 — Operator Quick Start Guide

## 🚀 Getting Started (Matías)

Welcome to SENTRA v2.0 Emergency Response System. This guide covers the essential operations.

---

## Initial Setup (First Time)

1. **Open App**
   - SENTRA PWA loads on your ZTE Android device
   - Browser shows "Install" prompt → tap to add to home screen

2. **Grant Permissions** (appears once)
   - **Camera Access:** Select "ALLOW" → back camera activates
   - **Location Access:** Select "ALLOW (precise)" → GPS locks position

3. **Dashboard Appears**
   - Left side: Live camera feed + your BPM with pulsing heart icon
   - Right side: Coordinates map + ACTION button + status indicator
   - Bottom: Live tactical event log

---

## Operating the System

### Normal Operations (SECURE State)

**Dashboard Status:** 🟢 **SYSTEM STATUS: SECURE** (green border)

1. **Monitor Your Biometrics**
   - Watch your **BPM** on left side (updates every 1 second)
   - Color indicates stress:
     - 🟢 Green (Low): 75-80 BPM
     - 🟠 Amber (Moderate): 80-90 BPM
     - 🔴 Red (High): 90-105 BPM
     - 🔴 Dark Red (Critical): >105 BPM

2. **Monitor Camera Feed**
   - Back camera stream displays in real-time
   - Badge shows **ACTIVA** (green) or **INACTIVA** (gray)
   - If "INACTIVA": Device has no camera or permission denied

3. **Check Your Position**
   - Coordinates display in "Tactical Map" box (right side)
   - **LAT / LON:** Your exact GPS location (6 decimals)
   - **ACC:** GPS accuracy in meters (lower is better)
   - **SECTOR:** Always "GLOBAL" for this version

4. **Review Event Log**
   - Bottom pane shows system activity
   - Examples:
     - "[00:00:01] Cámara inicializada correctamente" 🟢
     - "[00:00:02] Geolocalización activa..." 🟢
     - "[00:15:30] [Your action]" 🟠

---

## EMERGENCY DISPATCH PROTOCOL

### Triggering an Emergency

**Scenario:** You need to dispatch an emergency alert (fire, injury, security threat, etc.)

#### Step 1: Press ACTION Button
- Large red button on right side
- Text: **"ACTION"**
- Button becomes **DISABLED** during cooldown

#### Step 2: Safe-Lock Modal Appears (3-Second Window)
- **Red countdown circle** appears (center screen)
- Shows: 3... 2... 1...
- Modal displays:
  - ⚠️ "SAFE-LOCK ACTIVO"
  - "Confirma la emergencia. Presiona CANCELAR dentro de 3 segundos para abortar."
  - Two buttons: **CANCELAR** (green) | **CONFIRMADO** (red, disabled)

#### Step 3: Choose Action Within 3 Seconds

**Option A: Cancel (Operator Changed Mind)**
- Press **CANCELAR** button (green)
- Emergency dispatch **ABORTED**
- System returns to SECURE
- Log shows: "[TIME] Emergencia cancelada por operador" 🟢

**Option B: Let Countdown Expire**
- Do nothing → countdown reaches 0
- System automatically sends emergency payload
- Dispatch shows: "[TIME] Dispatch ejecutándose..." 🟠

#### Step 4: Dispatch Confirmation
- If Pipedream succeeds:
  - Log: "[TIME] Dispatch exitoso vía PIPEDREAM" 🟢
  - Status bar shows: **SYSTEM STATUS: COOLDOWN**
  - Timer: "10s LOCKOUT"

- If Pipedream fails (network down):
  - Log: "[TIME] Activando fallback Telegram..." 🟠
  - Status bar shows: **SYSTEM STATUS: FALLBACK**
  - System uses backup Telegram channel
  - Log: "[TIME] Dispatch exitoso vía TELEGRAM" 🟢

#### Step 5: Cooldown Period (10 Seconds)
- ACTION button **DISABLED** (grayed out)
- Status bar: "10s LOCKOUT" → "9s LOCKOUT" → ... → "0s LOCKOUT"
- Prevents accidental multiple triggers
- After 10s: button re-enables, status returns to **SECURE**

---

## ⚠️ Critical Safety Notes

### Safe-Lock: Your Abort Window
- **Only 3 seconds** to press CANCEL
- If you press ACTION by mistake → **immediately press CANCEL**
- System will **abort dispatch** (no data sent)

### Cooldown: Prevent Spam
- After each dispatch (successful or failed)
- **10-second lockout** prevents accidental duplicate sends
- This is **intentional** (matches server throttling)
- Wait for green button before next action

### What Gets Sent
When you dispatch, the system sends:
```
📍 Your live GPS coordinates
📸 Camera active status (video feed)
❤️ Your current BPM (heart rate)
⏰ Timestamp of dispatch
🆔 Sector: "global"
👤 Operator: "Matías"
```

---

## 🔧 Troubleshooting

### Camera Shows "INACTIVA"
**Problem:** Camera feed is gray, badge shows "INACTIVA"
- Check: App has camera permission?
  - Android Settings → Apps → SENTRA → Permissions → Camera → Allow
- Check: Is another app using the camera?
  - Close other video apps
- Restart app

### GPS Shows "Adquiriendo posición..."
**Problem:** Location not acquired
- Move to open area (away from buildings)
- GPS takes 10-30 seconds to lock
- Check: Location permission enabled?
  - Android Settings → Apps → SENTRA → Permissions → Location → Allow (precise)
- Give app 30 seconds, then try again

### ACTION Button Stays Disabled (Not 10s Cooldown)
**Problem:** Button remains gray after cooldown should end
- Check system status bar (top)
- If shows "SAFE_LOCK": 3-second modal may still be active
  - Press CANCEL to dismiss
- If shows "DEPLOYED": Last dispatch still processing
  - Wait 30 seconds, then refresh browser (F5)

### No Internet Connection
**Problem:** Network is down, Pipedream fails
- **Good news:** SENTRA doesn't fail!
- System automatically uses **Telegram fallback**
- Your emergency still reaches the team
- Log shows: "[TIME] Dispatch exitoso vía TELEGRAM" 🟢
- You can continue operating offline

---

## 📊 Understanding the Dashboard

```
┌─────────────────────────────────────────────────┐
│ 🟢 SYSTEM STATUS: SECURE      TACTICAL HUD v2.0 │
└─────────────────────────────────────────────────┘

┌──────────────────────┬──────────────────────────┐
│                      │                          │
│  📹 CAMERA FEED      │  MAP & MAP WIDGET        │
│  (Live Video)        │  LAT: 4.735500          │
│  ACTIVA 🟢           │  LON: -74.031200        │
│                      │  ACC: 8.5m              │
│  [Coordinates]       │  SECTOR: GLOBAL         │
│                      │                          │
├──────────────────────┤                          │
│  Matías              │  ┌──────────────────┐   │
│  87 BPM 🔴 HIGH      │  │    ACTION        │   │
│  Trending: ↑         │  │  [Large Red]     │   │
│  ❤️ Pulsing Anim     │  └──────────────────┘   │
│                      │                          │
│                      │  ┌──────────────────┐   │
│                      │  │  LOGS:           │   │
│                      │  │ 🟢 [00:00:01]... │   │
│                      │  │ 🟠 [00:00:45]... │   │
│                      │  └──────────────────┘   │
└──────────────────────┴──────────────────────────┘
```

---

## 🎯 Best Practices

1. **Check Permissions Early**
   - Don't wait for emergency to grant camera/location
   - Allow both on first app load

2. **Know Your Surroundings**
   - Familiarize yourself with the dashboard
   - Practice a "dry run" (press ACTION → CANCEL)

3. **Monitor Your Stress Level**
   - BPM is your real-time indicator
   - High BPM = system in high-alert mode
   - Normal BPM = system stable

4. **Keep Device Accessible**
   - Place on desk/armband for quick access
   - Ensure battery at >50% for emergency scenarios

5. **Test Monthly**
   - Once a month: Press ACTION → CANCEL to verify system
   - Check that coordinates update correctly
   - Verify both camera feed and event log work

---

## 🚨 Emergency Dispatch Flowchart

```
┌─ SYSTEM SECURE ─────────────────────────────────┐
│ You press ACTION button                         │
└────┬─────────────────────────────────────────────┘
     ↓
┌─ SAFE_LOCK ACTIVE ──────────────────────────────┐
│ 3-second countdown displayed                    │
│ CANCEL button available                         │
└────┬────────────────────────┬───────────────────┘
     │                        │
  [CANCEL]               [Wait 3s]
     ↓                        ↓
┌─ SECURE ──────────────┬─ DEPLOYED ──────────────┐
│ Return to normal      │ Sending payload         │
│ No dispatch sent      └────┬───────────────────┘
└───────────────────────     │
                 ┌───────────┼───────────┐
                 ↓           ↓           ↓
          [Pipedream] [Pipedream] [Telegram]
             OK         FAIL      Fallback
             ↓           ↓           ↓
        ┌────────────────┴───────────┘
        ↓
┌─ COOLDOWN ──────────────────────────────────────┐
│ 10 seconds: ACTION button DISABLED              │
│ Status: "10s LOCKOUT" → "0s LOCKOUT"            │
│ After: Return to SECURE                         │
└─────────────────────────────────────────────────┘
```

---

## 📞 Support Contact

If you experience issues:
1. Check this guide first (troubleshooting section)
2. Review tactical events log (bottom pane)
3. Look for error messages in red (🔴)
4. Restart the app (refresh browser / close app)
5. If persists: Contact your SENTRA administrator

---

**SENTRA v2.0 — Stay Alert. Stay Safe. Stay Ready.**

*Last Updated: 2026-05-18*
*Operator: Matías*
