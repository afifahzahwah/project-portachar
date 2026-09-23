# PortaChar - Portable Biochar Water Filtration & Device Health Dashboard
### Pure Limitless Bootstrap 5 Implementation

An authentic real-time, IoT-ready monitoring and performance analytics dashboard for the **PortaChar** portable activated biochar water purification unit, built **exclusively using the ThemeForest Limitless Bootstrap 5 Application Kit** and powered by **Apache ECharts**.

---

## 1. Design & Component Architecture

This dashboard strictly adheres to the official Limitless design system and layout components without any custom external CSS:

* **Authentic Limitless Layout:**
  - Dark Collapsible Main Sidebar (`sidebar-dark sidebar-main`) with navigation sections, badge counters, and Phosphor icons.
  - Top Navbar with real-time stream status, battery health indicator, emergency valve indicator, search bar, and operator profile.
  - Page Header with interactive breadcrumbs, live stream toggle switch (`form-check form-switch`), and stream polling frequency dropdown (`1.0s Boost`, `1.5s Standard`, `3.0s Eco Saver`).
* **PortaChar Device Health & Hardware Diagnostics:**
  - **Smart Li-Ion Power Hub:** 4S2P Li-Ion battery pack (68.4 Wh), State of Health (SOH 98.4%), battery pack charge bar, voltage/current draw (15.24V / 385mA), solar MPPT input (+18.4W), pack temperature (26.8°C), and power mode switcher (Standard / Eco / Boost).
  - **Sensor Array Calibration & Diagnostics:** Individual real-time health and calibration metrics for all probes:
    - *Turbidity Sensor:* Optical nephelometric lens cleanliness (99.2%) & IR LED stability.
    - *pH Combination Electrode:* Ag/AgCl glass bulb slope efficiency (98.6%, 58.4 mV/pH) & reference impedance.
    - *Conductivity / TDS Cell:* Platinum dual-electrode cleanliness (98.1%) & cell constant k=1.004 cm⁻¹.
    - *DS18B20 Temp Probe & ATC:* 1-Wire bus CRC integrity (100%) & automatic temperature compensation.
    - *Solenoid Valve & Flow Impeller:* 38ms response latency & cycle counter.
  - **PortaChar Biochar Bed & Embedded IoT Gateway:**
    - Activated biochar microporous adsorption bed capacity remaining (88.6%) & Delta-P pressure differential.
    - ESP32-S3 Dual-Core MCU telemetry, core temperature (36.4°C), and LoRaWAN/LTE-M RSSI signal strength (-68 dBm).
  - **Interactive Hardware Self-Test:** One-click automated probe and battery diagnostics verification with real-time audit trail output.
* **Limitless Quick Stats Widgets:**
  - Filtration Efficiency (`bg-teal text-white`)
  - Water Potability Verdict (`bg-primary text-white` / `bg-danger text-white`)
  - Cumulative Flow & Flow Rate (`bg-indigo text-white`)
  - PortaChar Biochar Adsorption Life (`bg-pink text-white`)
* **Interactive Scenario Stress-Testing:**
  - Built-in Limitless button group (`btn-group`) allowing instantaneous toggling between:
    1. `Normal Potable` (Safe < 1.0 NTU, pH ~7.4)
    2. `Raw Storm Surge` (60–85 NTU inflow, differential pressure rise)
    3. `Membrane Rupture` (> 5.0 NTU critical breach, auto-closing solenoid valve)
    4. `Acid Inflow Shock` (pH < 5.0 chemical shock)
* **4-Sensor Array Comparative Matrix:**
  - Limitless cards with styled color-coded top borders (`border-top-width-3`):
    - **Turbidity (NTU):** Inflow vs Effluent with `< 5.0 NTU` target progress bar.
    - **pH Balance:** Inflow vs Effluent with `6.5 – 8.5` safe zone indicator.
    - **Conductivity (µS/cm):** Inflow vs Effluent with `ppm TDS` calculation and ion rejection %.
    - **Temperature (°C):** Inflow vs Effluent with Automatic Temperature Compensation (ATC @ 25°C).
* **High-Performance ECharts:**
  - Native `.chart-container` elements with responsive resizing.
  - Dual line series with threshold marklines (5.0 NTU) and shaded safe zone ribbons (6.5 – 8.5 pH).
  - Tabbed secondary stream (toggle between Conductivity and Temperature).
* **Live Telemetry Audit Trail:**
  - Native Limitless `.table-hover.text-nowrap` continuously logging threshold breaches, self-tests, and valve actions.

---

## 2. Directory Structure

```
D:\project\bootstrape/
├── index.html                           # Authentic Limitless BS5 Dashboard
├── README.md                            # Documentation & hardware guide
└── assets/
    ├── css/
    │   └── all.min.css                  # Limitless BS5 complete CSS bundle
    ├── fonts/
    │   └── inter/                       # Inter font family
    ├── icons/
    │   └── phosphor/                    # Phosphor icon font library
    ├── images/                          # Limitless branding, logos & avatars
    └── js/
        ├── bootstrap/
        │   └── bootstrap.bundle.min.js  # Bootstrap 5 JS
        ├── vendor/visualization/
        │   └── echarts/echarts.min.js   # Apache ECharts 5 visualization
        ├── app.js                       # Limitless layout core
        └── water-filtration-engine.js   # Live telemetry, threshold checks & ECharts
```

---

## 3. How to Launch & Serve

The dashboard is served via local HTTP server to ensure all web fonts and ECharts modules load without browser file-protocol (`file:///`) security restrictions:

### Option A: One-Click Launcher (Windows)
Double-click **`start-server.bat`** in the project directory. It launches the ngrok tunnel, detects Node.js automatically, and opens `http://localhost:8080/login.html`.

### Option B: Node.js Server (Zero Dependencies)
Uses native `node:sqlite` and `crypto` modules built into Node.js 22+:
```bash
node server.js
```
Open [http://localhost:8080/login.html](http://localhost:8080/login.html) in your browser.
