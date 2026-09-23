/**
 * PortaChar Portable Biochar Water Filtration Real-Time Monitoring Engine
 * Pure ThemeForest Limitless BS5 Integration - No external/custom CSS dependencies
 * Drives 8-channel Pre vs Post filtration telemetry, synchronized ECharts,
 * device & battery health diagnostics, safety threshold monitoring, and scenario stress testing.
 */

(function () {
  'use strict';

  // Regulatory safe thresholds
  const THRESHOLDS = {
    turbidity: { maxSafe: 5.0, warning: 3.5, ideal: 1.0, unit: 'NTU' },
    ph: { minSafe: 6.5, maxSafe: 8.5, neutral: 7.0, unit: 'pH' },
    conductivity: { maxSafe: 500, warning: 800, unit: 'µS/cm' },
    temperature: { minSafe: 15.0, maxSafe: 25.0, unit: '°C' }
  };

  const BUFFER_SIZE = 20;

  // Application State
  const state = {
    isRunning: true,
    intervalMs: 1500,
    timerId: null,
    scenario: 'normal', // 'normal' | 'turbidity_spike' | 'membrane_breach' | 'acid_shock'
    valveOpen: true,
    valveAutoTripped: false,
    cumulativeLiters: 14820.4,
    flowRateLpm: 12.4,
    filterHealthPct: 88.6,
    activeTab: 'conductivity', // 'conductivity' | 'temperature'

    // PortaChar Device Health & Hardware Diagnostics State
    deviceHealth: {
      batteryPct: 87.4,
      voltage: 15.24,
      currentMa: 385,
      tempC: 26.8,
      sohPct: 98.4,
      cycles: 128,
      isCharging: true,
      solarPowerW: 18.4,
      solarVoltage: 18.2,
      powerMode: 'standard', // 'standard' | 'eco' | 'boost'
      runtimeHours: 13.8,
      turbHealth: 99.2,
      turbDrift: 0.01,
      phSlope: 98.6,
      phImpedance: 142,
      ecHealth: 98.1,
      ecFouling: 0.2,
      tempCrcErrors: 0,
      valveHealth: 96.5,
      valveCycles: 1482,
      biocharDeltaPsi: 2.1,
      mcuTempC: 36.4,
      rssiDbm: -68,
      selfTestRunning: false
    },

    // Current live readings
    current: {
      preTurb: 24.50,
      postTurb: 0.45,
      prePh: 7.12,
      postPh: 7.42,
      preEc: 430.0,
      postEc: 78.0,
      preTemp: 22.4,
      postTemp: 22.1
    },

    // Circular buffers for real-time streaming charts
    history: {
      timestamps: [],
      preTurb: [],
      postTurb: [],
      prePh: [],
      postPh: [],
      preEc: [],
      postEc: [],
      preTemp: [],
      postTemp: []
    }
  };

  // ECharts instances
  let chartTurbidity = null;
  let chartPh = null;
  let chartSecondary = null;

  function randomBetween(min, max) {
    return Math.random() * (max - min) + min;
  }

  function formatTime(d) {
    return d.toLocaleTimeString('en-GB', { hour12: false });
  }

  function calcEfficiency(pre, post) {
    if (pre <= 0) return 0;
    return Math.max(0, Math.min(100, ((pre - post) / pre) * 100));
  }

  // Automatic Temperature Compensation (ATC) @ 25°C baseline
  function calcAtcEc(ec, temp) {
    return ec / (1 + 0.02 * (temp - 25.0));
  }

  // Composite Water Quality Index (0–100)
  function calcWQI(turb, ph, ec) {
    let score = 100;
    if (turb >= THRESHOLDS.turbidity.maxSafe) {
      score -= 50;
    } else if (turb > THRESHOLDS.turbidity.warning) {
      score -= 20;
    } else if (turb > THRESHOLDS.turbidity.ideal) {
      score -= 8;
    }

    if (ph < THRESHOLDS.ph.minSafe || ph > THRESHOLDS.ph.maxSafe) {
      score -= 40;
    } else {
      score -= Math.abs(ph - THRESHOLDS.ph.neutral) * 5;
    }

    if (ec > THRESHOLDS.conductivity.warning) {
      score -= 20;
    } else if (ec > THRESHOLDS.conductivity.maxSafe) {
      score -= 10;
    }

    return Math.max(12, Math.min(100, Math.round(score)));
  }

  // Seed history buffer
  function initHistory() {
    const now = new Date();
    for (let i = BUFFER_SIZE; i >= 0; i--) {
      const t = new Date(now.getTime() - i * state.intervalMs);
      state.history.timestamps.push(formatTime(t));

      const preT = 22.0 + Math.sin(i * 0.3) * 3 + randomBetween(-0.4, 0.4);
      const postT = 0.38 + Math.sin(i * 0.2) * 0.06 + randomBetween(-0.02, 0.02);
      const preP = 7.10 + Math.sin(i * 0.2) * 0.12;
      const postP = 7.40 + Math.sin(i * 0.2) * 0.06;
      const preE = 425 + Math.sin(i * 0.2) * 12;
      const postE = 76 + Math.sin(i * 0.2) * 4;
      const preTm = 22.3 + Math.sin(i * 0.1) * 0.2;
      const postTm = 22.0 + Math.sin(i * 0.1) * 0.15;

      state.history.preTurb.push(parseFloat(preT.toFixed(2)));
      state.history.postTurb.push(parseFloat(postT.toFixed(2)));
      state.history.prePh.push(parseFloat(preP.toFixed(2)));
      state.history.postPh.push(parseFloat(postP.toFixed(2)));
      state.history.preEc.push(parseFloat(preE.toFixed(1)));
      state.history.postEc.push(parseFloat(postE.toFixed(1)));
      state.history.preTemp.push(parseFloat(preTm.toFixed(1)));
      state.history.postTemp.push(parseFloat(postTm.toFixed(1)));
    }

    // Latest readings
    state.current.preTurb = state.history.preTurb.slice(-1)[0];
    state.current.postTurb = state.history.postTurb.slice(-1)[0];
    state.current.prePh = state.history.prePh.slice(-1)[0];
    state.current.postPh = state.history.postPh.slice(-1)[0];
    state.current.preEc = state.history.preEc.slice(-1)[0];
    state.current.postEc = state.history.postEc.slice(-1)[0];
    state.current.preTemp = state.history.preTemp.slice(-1)[0];
    state.current.postTemp = state.history.postTemp.slice(-1)[0];
  }

  // Telemetry generator for scenarios
  function generateTick() {
    let pt, ost, pp, osp, pe, ose, ptm, ostm;

    switch (state.scenario) {
      case 'turbidity_spike': // Storm runoff surge
        pt = randomBetween(62.0, 88.0);
        ost = randomBetween(1.6, 2.8); // Resilient filter maintains < 5.0 NTU
        pp = randomBetween(6.8, 7.3);
        osp = randomBetween(7.2, 7.5);
        pe = randomBetween(480, 560);
        ose = randomBetween(88, 125);
        ptm = randomBetween(21.7, 22.5);
        ostm = ptm - 0.3;
        break;

      case 'membrane_breach': // Membrane rupture (> 5.0 NTU hazardous breach)
        pt = randomBetween(28.0, 42.0);
        ost = randomBetween(5.6, 7.9); // CRITICAL BREACH
        pp = randomBetween(7.0, 7.4);
        osp = randomBetween(7.1, 7.3);
        pe = randomBetween(420, 470);
        ose = randomBetween(280, 350);
        ptm = randomBetween(22.0, 22.6);
        ostm = ptm - 0.2;
        break;

      case 'acid_shock': // Inflow chemical/acidic contamination
        pt = randomBetween(20.0, 30.0);
        ost = randomBetween(0.4, 0.8);
        pp = randomBetween(4.2, 5.1); // Acidic raw water
        osp = randomBetween(6.1, 6.45); // Filter buffers but output is sub-6.5
        pe = randomBetween(530, 640);
        ose = randomBetween(110, 160);
        ptm = randomBetween(22.0, 22.7);
        ostm = ptm - 0.2;
        break;

      case 'normal':
      default:
        pt = randomBetween(19.0, 28.5);
        ost = randomBetween(0.28, 0.62); // High clarity < 1.0 NTU
        pp = randomBetween(7.05, 7.25);
        osp = randomBetween(7.35, 7.55); // Ideal neutral potability
        pe = randomBetween(410, 465);
        ose = randomBetween(66, 88);
        ptm = randomBetween(22.0, 22.6);
        ostm = ptm - 0.25;
        break;
    }

    pt = parseFloat(pt.toFixed(2));
    ost = parseFloat(ost.toFixed(2));
    pp = parseFloat(pp.toFixed(2));
    osp = parseFloat(osp.toFixed(2));
    pe = parseFloat(pe.toFixed(1));
    ose = parseFloat(ose.toFixed(1));
    ptm = parseFloat(ptm.toFixed(1));
    ostm = parseFloat(ostm.toFixed(1));

    state.current = {
      preTurb: pt,
      postTurb: ost,
      prePh: pp,
      postPh: osp,
      preEc: pe,
      postEc: ose,
      preTemp: ptm,
      postTemp: ostm
    };

    if (state.valveOpen) {
      const liters = (state.flowRateLpm / 60) * (state.intervalMs / 1000);
      state.cumulativeLiters += liters;
      const degradation = pt > 50 ? 0.002 : 0.0004;
      state.filterHealthPct = Math.max(0, state.filterHealthPct - degradation);
    }

    // Update PortaChar Device Health & Power Subsystem
    let baseCurrent = 385;
    if (state.deviceHealth.powerMode === 'eco') {
      baseCurrent = 195;
    } else if (state.deviceHealth.powerMode === 'boost') {
      baseCurrent = 530;
    }
    // When solenoid valve is closed, current drops by ~230 mA
    if (!state.valveOpen) {
      baseCurrent = Math.max(90, baseCurrent - 230);
    }
    state.deviceHealth.currentMa = Math.round(baseCurrent + randomBetween(-8, 8));

    // Solar Aux Harvesting (micro-fluctuations)
    const solarBase = state.deviceHealth.powerMode === 'eco' ? 18.6 : 18.4;
    state.deviceHealth.solarPowerW = parseFloat((solarBase + randomBetween(-0.4, 0.4)).toFixed(1));
    state.deviceHealth.solarVoltage = 18.2;

    // Small battery charge balance under solar floating charge
    if (state.deviceHealth.isCharging) {
      state.deviceHealth.batteryPct = Math.min(100, Math.max(10, state.deviceHealth.batteryPct + randomBetween(-0.008, 0.008)));
    }
    const batV = 14.8 + (state.deviceHealth.batteryPct / 100) * 0.55 + randomBetween(-0.02, 0.02);
    state.deviceHealth.voltage = parseFloat(batV.toFixed(2));

    // Est. runtime based on 5.2Ah pack
    const hrs = (5.2 * (state.deviceHealth.batteryPct / 100)) / (state.deviceHealth.currentMa / 1000);
    state.deviceHealth.runtimeHours = parseFloat(hrs.toFixed(1));

    // Pack & MCU temperatures
    const tempOffset = state.deviceHealth.powerMode === 'boost' ? 2.1 : (state.deviceHealth.powerMode === 'eco' ? -0.8 : 0);
    state.deviceHealth.tempC = parseFloat((26.8 + tempOffset + randomBetween(-0.2, 0.2)).toFixed(1));
    state.deviceHealth.mcuTempC = parseFloat((36.4 + tempOffset * 1.2 + randomBetween(-0.3, 0.3)).toFixed(1));
    state.deviceHealth.rssiDbm = Math.round(-68 + randomBetween(-1, 1));

    // Scenario impacts on probe health and biochar differential pressure
    if (state.scenario === 'turbidity_spike') {
      state.deviceHealth.biocharDeltaPsi = parseFloat((3.4 + randomBetween(-0.2, 0.3)).toFixed(1));
      state.deviceHealth.turbDrift = 0.03;
      state.deviceHealth.turbHealth = 98.4;
    } else if (state.scenario === 'membrane_breach') {
      state.deviceHealth.biocharDeltaPsi = parseFloat((4.8 + randomBetween(-0.2, 0.4)).toFixed(1));
      state.deviceHealth.turbDrift = 0.08;
      state.deviceHealth.turbHealth = 95.2;
    } else {
      state.deviceHealth.biocharDeltaPsi = parseFloat((2.1 + randomBetween(-0.1, 0.1)).toFixed(1));
      state.deviceHealth.turbDrift = 0.01;
      state.deviceHealth.turbHealth = 99.2;
    }

    const tStr = formatTime(new Date());
    state.history.timestamps.push(tStr);
    state.history.preTurb.push(pt);
    state.history.postTurb.push(ost);
    state.history.prePh.push(pp);
    state.history.postPh.push(osp);
    state.history.preEc.push(pe);
    state.history.postEc.push(ose);
    state.history.preTemp.push(ptm);
    state.history.postTemp.push(ostm);

    if (state.history.timestamps.length > BUFFER_SIZE) {
      state.history.timestamps.shift();
      state.history.preTurb.shift();
      state.history.postTurb.shift();
      state.history.prePh.shift();
      state.history.postPh.shift();
      state.history.preEc.shift();
      state.history.postEc.shift();
      state.history.preTemp.shift();
      state.history.postTemp.shift();
    }

    checkThresholdsAndSafety();
    updateUI();
    updateChartData();
  }

  // Threshold validation & automated valve cutoff
  function checkThresholdsAndSafety() {
    const cur = state.current;
    const isTurbBreach = cur.postTurb >= THRESHOLDS.turbidity.maxSafe;
    const isPhBreach = cur.postPh < THRESHOLDS.ph.minSafe || cur.postPh > THRESHOLDS.ph.maxSafe;

    if (isTurbBreach || isPhBreach) {
      if (state.valveOpen && !state.valveAutoTripped) {
        state.valveOpen = false;
        state.valveAutoTripped = true;
        state.deviceHealth.valveCycles += 1;
        const reason = isTurbBreach
          ? `Turbidity ${cur.postTurb} NTU exceeded limit (≥ 5.0 NTU)`
          : `pH ${cur.postPh} out of range (6.5 – 8.5)`;
        addAuditLogRow('danger', reason, 'Solenoid valve automatically CLOSED');
      }
    } else {
      if (state.valveAutoTripped && state.scenario === 'normal') {
        state.valveAutoTripped = false;
        state.valveOpen = true;
        state.deviceHealth.valveCycles += 1;
        addAuditLogRow('success', 'Potable parameters normalized', 'Solenoid valve reopened');
      }
    }
  }

  // Audit log row appender (Limitless table structure)
  function addAuditLogRow(level, detail, action) {
    const tbody = document.getElementById('table_audit_log_body');
    if (!tbody) return;

    const timeStr = formatTime(new Date());
    let badgeClass = 'bg-success bg-opacity-10 text-success';
    let iconClass = 'ph-check-circle';
    let levelText = 'Normal';

    if (level === 'danger') {
      badgeClass = 'bg-danger bg-opacity-10 text-danger';
      iconClass = 'ph-warning-octagon';
      levelText = 'Critical';
    } else if (level === 'warning') {
      badgeClass = 'bg-warning bg-opacity-10 text-warning';
      iconClass = 'ph-warning';
      levelText = 'Warning';
    } else if (level === 'info') {
      badgeClass = 'bg-primary bg-opacity-10 text-primary';
      iconClass = 'ph-info';
      levelText = 'Notice';
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>
        <span class="badge ${badgeClass}">
          <i class="${iconClass} me-1"></i> ${levelText}
        </span>
      </td>
      <td class="text-muted fs-sm">${timeStr}</td>
      <td class="fw-semibold text-body">${detail}</td>
      <td><span class="text-muted fs-sm">${action}</span></td>
    `;

    tbody.insertBefore(tr, tbody.firstChild);

    // Limit log to 10 rows
    while (tbody.children.length > 10) {
      tbody.removeChild(tbody.lastChild);
    }

    // Update alert count badge in sidebar
    const alertCount = tbody.querySelectorAll('.badge.bg-danger').length;
    const sidebarBadge = document.getElementById('sidebar_alert_badge');
    if (sidebarBadge) {
      sidebarBadge.innerText = `${alertCount} Alarms`;
      sidebarBadge.className = alertCount > 0 ? 'badge bg-danger rounded-pill ms-auto' : 'badge bg-secondary rounded-pill ms-auto';
    }
  }

  // Limitless DOM UI Updates
  function updateUI() {
    const cur = state.current;
    const turbEff = calcEfficiency(cur.preTurb, cur.postTurb);
    const ecEff = calcEfficiency(cur.preEc, cur.postEc);
    const deltaPh = (cur.postPh - cur.prePh).toFixed(2);
    const deltaTemp = (cur.postTemp - cur.preTemp).toFixed(1);
    const atcEc = calcAtcEc(cur.postEc, cur.postTemp).toFixed(1);
    const postTds = Math.round(cur.postEc * 0.65);
    const wqi = calcWQI(cur.postTurb, cur.postPh, cur.postEc);

    // 1. Top Quick Stats Cards (Limitless native classes)
    const elEffVal = document.getElementById('hero_eff_val');
    if (elEffVal) elEffVal.innerText = `${turbEff.toFixed(1)}%`;

    const elStatusText = document.getElementById('hero_status_text');
    const elWqiBadge = document.getElementById('hero_wqi_badge');
    const elStatusCard = document.getElementById('hero_status_card');

    if (elStatusText && elWqiBadge) {
      elWqiBadge.innerText = `WQI ${wqi}/100`;

      if (cur.postTurb >= THRESHOLDS.turbidity.maxSafe || cur.postPh < THRESHOLDS.ph.minSafe || cur.postPh > THRESHOLDS.ph.maxSafe) {
        elStatusText.innerText = 'CRITICAL';
        if (elStatusCard) elStatusCard.className = 'card bg-danger text-white';
      } else if (cur.postTurb >= THRESHOLDS.turbidity.warning || cur.postPh <= 6.6 || cur.postPh >= 8.3) {
        elStatusText.innerText = 'WARNING';
        if (elStatusCard) elStatusCard.className = 'card bg-warning text-white';
      } else {
        elStatusText.innerText = 'POTABLE';
        if (elStatusCard) elStatusCard.className = 'card bg-primary text-white';
      }
    }

    const elVolTreated = document.getElementById('hero_volume_treated');
    if (elVolTreated) elVolTreated.innerText = `${state.cumulativeLiters.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`;

    const elFilterLife = document.getElementById('hero_filter_life');
    if (elFilterLife) elFilterLife.innerText = `${state.filterHealthPct.toFixed(1)}%`;

    // 2. Sensor 1: Turbidity Card
    document.getElementById('val_pre_turb').innerText = cur.preTurb.toFixed(2);
    document.getElementById('val_post_turb').innerText = cur.postTurb.toFixed(2);
    document.getElementById('val_turb_reduction').innerHTML = `<i class="ph-trend-down me-1"></i> ${turbEff.toFixed(1)}% Removal`;

    const badgeTurb = document.getElementById('badge_turb_status');
    const barTurb = document.getElementById('bar_turb_threshold');
    const pctTurb = Math.min(100, (cur.postTurb / THRESHOLDS.turbidity.maxSafe) * 100);
    if (barTurb) barTurb.style.width = `${pctTurb}%`;

    if (cur.postTurb >= THRESHOLDS.turbidity.maxSafe) {
      badgeTurb.className = 'badge bg-danger rounded-pill ms-auto';
      badgeTurb.innerText = 'BREACH (≥ 5.0 NTU)';
      if (barTurb) barTurb.className = 'progress-bar bg-danger';
    } else if (cur.postTurb >= THRESHOLDS.turbidity.warning) {
      badgeTurb.className = 'badge bg-warning rounded-pill ms-auto';
      badgeTurb.innerText = 'Near Threshold';
      if (barTurb) barTurb.className = 'progress-bar bg-warning';
    } else {
      badgeTurb.className = 'badge bg-success bg-opacity-10 text-success rounded-pill ms-auto';
      badgeTurb.innerText = 'Safe (< 5.0 NTU)';
      if (barTurb) barTurb.className = 'progress-bar bg-success';
    }

    // 3. Sensor 2: pH Card
    document.getElementById('val_pre_ph').innerText = cur.prePh.toFixed(2);
    document.getElementById('val_post_ph').innerText = cur.postPh.toFixed(2);
    document.getElementById('val_ph_delta').innerHTML = `<i class="ph-arrows-left-right me-1"></i> ${deltaPh >= 0 ? '+' : ''}${deltaPh} pH Buffer`;

    const badgePh = document.getElementById('badge_ph_status');
    const barPh = document.getElementById('bar_ph_threshold');
    if (barPh) {
      // Scale 0-14 -> %
      const pctPh = (cur.postPh / 14) * 100;
      barPh.style.width = `${pctPh}%`;
    }

    if (cur.postPh < THRESHOLDS.ph.minSafe || cur.postPh > THRESHOLDS.ph.maxSafe) {
      badgePh.className = 'badge bg-danger rounded-pill ms-auto';
      badgePh.innerText = cur.postPh < 6.5 ? 'Acidic (< 6.5)' : 'Alkaline (> 8.5)';
      if (barPh) barPh.className = 'progress-bar bg-danger';
    } else {
      badgePh.className = 'badge bg-success bg-opacity-10 text-success rounded-pill ms-auto';
      badgePh.innerText = 'Safe (6.5 – 8.5)';
      if (barPh) barPh.className = 'progress-bar bg-success';
    }

    // 4. Sensor 3: Conductivity / TDS Card
    document.getElementById('val_pre_ec').innerText = cur.preEc.toFixed(0);
    document.getElementById('val_post_ec').innerText = cur.postEc.toFixed(0);
    document.getElementById('val_post_tds').innerText = `${postTds} ppm TDS`;
    document.getElementById('val_ec_reduction').innerHTML = `<i class="ph-trend-down me-1"></i> ${ecEff.toFixed(1)}% Rejection`;

    const badgeEc = document.getElementById('badge_ec_status');
    if (cur.postEc > THRESHOLDS.conductivity.warning) {
      badgeEc.className = 'badge bg-danger rounded-pill ms-auto';
      badgeEc.innerText = 'High Salinity';
    } else {
      badgeEc.className = 'badge bg-primary bg-opacity-10 text-primary rounded-pill ms-auto';
      badgeEc.innerText = 'Optimal (< 500 µS)';
    }

    // 5. Sensor 4: Temperature & ATC Card
    document.getElementById('val_pre_temp').innerText = cur.preTemp.toFixed(1);
    document.getElementById('val_post_temp').innerText = cur.postTemp.toFixed(1);
    document.getElementById('val_temp_delta').innerText = `${deltaTemp >= 0 ? '+' : ''}${deltaTemp}°C Drift`;
    document.getElementById('val_atc_reading').innerText = `ATC @ 25°C: ${atcEc} µS/cm`;

    // 6. Solenoid Valve Navbar & Button Status
    const navValveBadge = document.getElementById('nav_valve_badge');
    const btnEmergency = document.getElementById('btn_emergency_valve');

    if (state.valveOpen) {
      if (navValveBadge) {
        navValveBadge.className = 'badge bg-success bg-opacity-20 text-success border border-success border-opacity-25 px-2 py-1';
        navValveBadge.innerHTML = '<i class="ph-circle-wavy-check me-1"></i> Solenoid: OPEN (12.4 L/m)';
      }
      if (btnEmergency) {
        btnEmergency.className = 'btn btn-danger btn-sm rounded-pill px-3';
        btnEmergency.innerHTML = '<i class="ph-shield-warning me-1"></i> Emergency Cut-Off';
      }
    } else {
      if (navValveBadge) {
        navValveBadge.className = 'badge bg-danger bg-opacity-20 text-danger border border-danger border-opacity-25 px-2 py-1';
        navValveBadge.innerHTML = '<i class="ph-shield-slash me-1"></i> Solenoid: CLOSED (Cut-off)';
      }
      if (btnEmergency) {
        btnEmergency.className = 'btn btn-success btn-sm rounded-pill px-3';
        btnEmergency.innerHTML = '<i class="ph-circle-wavy-check me-1"></i> Reopen Solenoid';
      }
    }

    // 7. PortaChar Device Health & Hardware Diagnostics
    updateDeviceHealthUI();
  }

  // PortaChar Device Health & Hardware Diagnostics UI Update
  function updateDeviceHealthUI() {
    const dh = state.deviceHealth;

    // 1. Top Navbar Battery Badge
    const navBatBadge = document.getElementById('nav_battery_badge');
    if (navBatBadge) {
      let batIcon = 'ph-battery-charging';
      if (!dh.isCharging) {
        if (dh.batteryPct > 70) batIcon = 'ph-battery-high';
        else if (dh.batteryPct > 35) batIcon = 'ph-battery-medium';
        else batIcon = 'ph-battery-low';
      }
      navBatBadge.innerHTML = `<i class="${batIcon} me-1"></i> Bat: ${Math.round(dh.batteryPct)}% (${dh.voltage.toFixed(1)}V)`;
    }

    // 2. Sidebar Battery Badge
    const sidebarBatBadge = document.getElementById('sidebar_battery_badge');
    if (sidebarBatBadge) {
      sidebarBatBadge.innerText = `${Math.round(dh.batteryPct)}% Bat`;
    }

    // 3. Battery Card Elements
    const elBatPct = document.getElementById('health_battery_pct');
    if (elBatPct) elBatPct.innerText = `${dh.batteryPct.toFixed(1)}%`;

    const elBatVolt = document.getElementById('health_battery_voltage');
    if (elBatVolt) elBatVolt.innerText = `${dh.voltage.toFixed(2)} V • ${dh.currentMa} mA`;

    const elBatRuntime = document.getElementById('health_battery_runtime');
    if (elBatRuntime) elBatRuntime.innerText = `${dh.runtimeHours} Hours`;

    const elBatBar = document.getElementById('health_battery_bar');
    if (elBatBar) {
      elBatBar.style.width = `${Math.min(100, Math.max(0, dh.batteryPct))}%`;
      if (dh.batteryPct < 20) {
        elBatBar.className = 'progress-bar bg-danger progress-bar-striped progress-bar-animated';
      } else if (dh.batteryPct < 40) {
        elBatBar.className = 'progress-bar bg-warning progress-bar-striped progress-bar-animated';
      } else {
        elBatBar.className = 'progress-bar bg-teal progress-bar-striped progress-bar-animated';
      }
    }

    const elBatSoh = document.getElementById('health_battery_soh');
    if (elBatSoh) elBatSoh.innerText = `${dh.sohPct.toFixed(1)}% (Optimal)`;

    const elBatCycles = document.getElementById('health_battery_cycles');
    if (elBatCycles) elBatCycles.innerText = `${dh.cycles} / 1,000 Cycles`;

    const elSolarPwr = document.getElementById('health_solar_power');
    if (elSolarPwr) elSolarPwr.innerText = `+${dh.solarPowerW.toFixed(1)} W Input`;

    const elSolarVolt = document.getElementById('health_solar_voltage');
    if (elSolarVolt) elSolarVolt.innerText = `${dh.solarVoltage.toFixed(1)}V • ${(dh.solarPowerW / dh.solarVoltage).toFixed(2)}A MPPT`;

    const elBatTemp = document.getElementById('health_battery_temp');
    if (elBatTemp) elBatTemp.innerText = `${dh.tempC.toFixed(1)}°C`;

    const elBatStatePill = document.getElementById('health_battery_state_pill');
    if (elBatStatePill) {
      elBatStatePill.innerText = dh.isCharging ? 'Solar Charging Active' : 'Battery Discharging';
    }

    // 4. Sensor Health Card Elements
    const elTurbPct = document.getElementById('health_turb_pct');
    if (elTurbPct) elTurbPct.innerText = `${dh.turbHealth.toFixed(1)}% Health`;

    const elTurbDrift = document.getElementById('health_turb_drift');
    if (elTurbDrift) elTurbDrift.innerText = `Drift: +${dh.turbDrift.toFixed(2)} NTU`;

    const elTurbBar = document.getElementById('health_turb_bar');
    if (elTurbBar) elTurbBar.style.width = `${dh.turbHealth}%`;

    const elPhPct = document.getElementById('health_ph_pct');
    if (elPhPct) elPhPct.innerText = `${dh.phSlope.toFixed(1)}% Slope`;

    const elPhImp = document.getElementById('health_ph_impedance');
    if (elPhImp) elPhImp.innerText = `Imp: ${dh.phImpedance} MΩ (Nominal)`;

    const elPhBar = document.getElementById('health_ph_bar');
    if (elPhBar) elPhBar.style.width = `${dh.phSlope}%`;

    const elEcPct = document.getElementById('health_ec_pct');
    if (elEcPct) elEcPct.innerText = `${dh.ecHealth.toFixed(1)}% Health`;

    const elEcFouling = document.getElementById('health_ec_fouling');
    if (elEcFouling) elEcFouling.innerText = `Fouling: ${dh.ecFouling.toFixed(1)}% (Low)`;

    const elEcBar = document.getElementById('health_ec_bar');
    if (elEcBar) elEcBar.style.width = `${dh.ecHealth}%`;

    const elTempBar = document.getElementById('health_temp_bar');
    if (elTempBar) elTempBar.style.width = '100%';

    const elValvePct = document.getElementById('health_valve_pct');
    if (elValvePct) elValvePct.innerText = `${dh.valveHealth.toFixed(1)}% Health`;

    const elValveCycles = document.getElementById('health_valve_cycles');
    if (elValveCycles) elValveCycles.innerText = `${dh.valveCycles.toLocaleString()} Cycles`;

    const elValveBar = document.getElementById('health_valve_bar');
    if (elValveBar) elValveBar.style.width = `${dh.valveHealth}%`;

    // 5. Biochar & IoT Gateway Elements
    const elBiocharCap = document.getElementById('health_biochar_cap');
    if (elBiocharCap) elBiocharCap.innerText = `${state.filterHealthPct.toFixed(1)}%`;

    const elBiocharDeltaP = document.getElementById('health_biochar_delta_p');
    if (elBiocharDeltaP) elBiocharDeltaP.innerText = `${dh.biocharDeltaPsi.toFixed(1)} PSI`;

    const elBiocharBar = document.getElementById('health_biochar_bar');
    if (elBiocharBar) elBiocharBar.style.width = `${state.filterHealthPct}%`;

    const elMcuTemp = document.getElementById('health_mcu_temp');
    if (elMcuTemp) elMcuTemp.innerText = `${dh.mcuTempC.toFixed(1)}°C (Safe)`;

    const elUplinkRssi = document.getElementById('health_uplink_rssi');
    if (elUplinkRssi) elUplinkRssi.innerText = `${dh.rssiDbm} dBm (Strong)`;

    const elOverallBadge = document.getElementById('health_overall_badge');
    if (elOverallBadge) {
      if (dh.batteryPct < 20 || dh.turbHealth < 95 || !state.valveOpen) {
        elOverallBadge.className = 'badge bg-warning bg-opacity-10 text-warning border border-warning border-opacity-25 px-2 py-1';
        elOverallBadge.innerHTML = '<i class="ph-warning me-1"></i> System Status: Attention Required';
      } else {
        elOverallBadge.className = 'badge bg-success bg-opacity-10 text-success border border-success border-opacity-25 px-2 py-1';
        elOverallBadge.innerHTML = '<i class="ph-check-circle me-1"></i> System Health: 98.4% Optimal';
      }
    }
  }

  // --- Theme-Aligned ECharts Initialization ---
  function initCharts() {
    // 1. Turbidity Chart
    const domTurb = document.getElementById('chart_turbidity');
    if (domTurb) {
      chartTurbidity = echarts.init(domTurb);
      chartTurbidity.setOption({
        textStyle: { fontFamily: 'Inter, sans-serif' },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          borderColor: 'transparent',
          textStyle: { color: '#ffffff', fontSize: 12 },
          formatter: function (params) {
            let s = `<div class="fw-bold mb-1">${params[0].name}</div>`;
            params.forEach(p => {
              s += `<div class="d-flex justify-content-between gap-3">
                <span>${p.marker} ${p.seriesName}:</span>
                <span class="fw-bold">${p.value} NTU</span>
              </div>`;
            });
            return s;
          }
        },
        legend: {
          data: ['Influent (Raw Inlet)', 'Effluent (Treated Outlet)'],
          bottom: 0,
          textStyle: { color: '#64748b' }
        },
        grid: { top: 25, left: 45, right: 30, bottom: 45 },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: state.history.timestamps,
          axisLine: { lineStyle: { color: '#cbd5e1' } },
          axisLabel: { color: '#64748b', fontSize: 11 }
        },
        yAxis: {
          type: 'value',
          name: 'NTU',
          nameTextStyle: { color: '#64748b' },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
          axisLabel: { color: '#64748b' }
        },
        series: [
          {
            name: 'Influent (Raw Inlet)',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: state.history.preTurb,
            lineStyle: { width: 2, color: '#f59e0b', type: 'dashed' },
            itemStyle: { color: '#f59e0b' }
          },
          {
            name: 'Effluent (Treated Outlet)',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: state.history.postTurb,
            lineStyle: { width: 3, color: '#0284c7' },
            itemStyle: { color: '#0284c7' },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: 'rgba(2, 132, 199, 0.3)' },
                { offset: 1, color: 'rgba(2, 132, 199, 0.01)' }
              ])
            },
            markLine: {
              silent: true,
              symbol: 'none',
              lineStyle: { color: '#ef4444', width: 2 },
              data: [
                {
                  yAxis: THRESHOLDS.turbidity.maxSafe,
                  label: {
                    formatter: 'Max Safe Limit (5.0 NTU)',
                    position: 'insideEndTop',
                    color: '#ef4444',
                    fontWeight: 'bold',
                    fontSize: 11
                  }
                }
              ]
            }
          }
        ]
      });
    }

    // 2. pH Chart
    const domPh = document.getElementById('chart_ph');
    if (domPh) {
      chartPh = echarts.init(domPh);
      chartPh.setOption({
        textStyle: { fontFamily: 'Inter, sans-serif' },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(30, 41, 59, 0.95)',
          borderColor: 'transparent',
          textStyle: { color: '#ffffff', fontSize: 12 }
        },
        legend: {
          data: ['Influent (Raw Inlet)', 'Effluent (Treated Outlet)'],
          bottom: 0,
          textStyle: { color: '#64748b' }
        },
        grid: { top: 25, left: 45, right: 30, bottom: 45 },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: state.history.timestamps,
          axisLine: { lineStyle: { color: '#cbd5e1' } },
          axisLabel: { color: '#64748b', fontSize: 11 }
        },
        yAxis: {
          type: 'value',
          min: 4,
          max: 10,
          name: 'pH Scale',
          nameTextStyle: { color: '#64748b' },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
          axisLabel: { color: '#64748b' }
        },
        series: [
          {
            name: 'Influent (Raw Inlet)',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: state.history.prePh,
            lineStyle: { width: 2, color: '#f59e0b', type: 'dashed' },
            itemStyle: { color: '#f59e0b' }
          },
          {
            name: 'Effluent (Treated Outlet)',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: state.history.postPh,
            lineStyle: { width: 3, color: '#10b981' },
            itemStyle: { color: '#10b981' },
            markArea: {
              silent: true,
              itemStyle: { color: 'rgba(16, 185, 129, 0.08)' },
              data: [
                [
                  { yAxis: 6.5, name: 'Safe Zone (6.5 – 8.5)' },
                  { yAxis: 8.5 }
                ]
              ]
            },
            markLine: {
              silent: true,
              symbol: 'none',
              data: [
                { yAxis: 6.5, lineStyle: { color: '#10b981', type: 'dotted' } },
                { yAxis: 8.5, lineStyle: { color: '#10b981', type: 'dotted' } }
              ]
            }
          }
        ]
      });
    }

    // 3. Secondary Chart (Conductivity & Temp tab)
    const domSec = document.getElementById('chart_secondary');
    if (domSec) {
      chartSecondary = echarts.init(domSec);
      renderSecondaryChart();
    }

    window.addEventListener('resize', function () {
      chartTurbidity && chartTurbidity.resize();
      chartPh && chartPh.resize();
      chartSecondary && chartSecondary.resize();
    });
  }

  function renderSecondaryChart() {
    if (!chartSecondary) return;

    if (state.activeTab === 'conductivity') {
      chartSecondary.setOption({
        textStyle: { fontFamily: 'Inter, sans-serif' },
        tooltip: { trigger: 'axis' },
        legend: { data: ['Pre-EC (µS/cm)', 'Post-EC (µS/cm)'], bottom: 0 },
        grid: { top: 25, left: 55, right: 30, bottom: 45 },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: state.history.timestamps,
          axisLine: { lineStyle: { color: '#cbd5e1' } },
          axisLabel: { color: '#64748b', fontSize: 11 }
        },
        yAxis: {
          type: 'value',
          name: 'µS/cm',
          nameTextStyle: { color: '#64748b' },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
          axisLabel: { color: '#64748b' }
        },
        series: [
          {
            name: 'Pre-EC (µS/cm)',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: state.history.preEc,
            lineStyle: { width: 2, color: '#f97316', type: 'dashed' },
            itemStyle: { color: '#f97316' }
          },
          {
            name: 'Post-EC (µS/cm)',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: state.history.postEc,
            lineStyle: { width: 3, color: '#6366f1' },
            itemStyle: { color: '#6366f1' }
          }
        ]
      }, true);
    } else {
      chartSecondary.setOption({
        textStyle: { fontFamily: 'Inter, sans-serif' },
        tooltip: { trigger: 'axis' },
        legend: { data: ['Pre-Temp (°C)', 'Post-Temp (°C)'], bottom: 0 },
        grid: { top: 25, left: 45, right: 30, bottom: 45 },
        xAxis: {
          type: 'category',
          boundaryGap: false,
          data: state.history.timestamps,
          axisLine: { lineStyle: { color: '#cbd5e1' } },
          axisLabel: { color: '#64748b', fontSize: 11 }
        },
        yAxis: {
          type: 'value',
          min: 15,
          max: 30,
          name: '°C',
          nameTextStyle: { color: '#64748b' },
          splitLine: { lineStyle: { color: '#f1f5f9' } },
          axisLabel: { color: '#64748b' }
        },
        series: [
          {
            name: 'Pre-Temp (°C)',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: state.history.preTemp,
            lineStyle: { width: 2, color: '#ec4899', type: 'dashed' },
            itemStyle: { color: '#ec4899' }
          },
          {
            name: 'Post-Temp (°C)',
            type: 'line',
            smooth: true,
            showSymbol: false,
            data: state.history.postTemp,
            lineStyle: { width: 3, color: '#06b6d4' },
            itemStyle: { color: '#06b6d4' }
          }
        ]
      }, true);
    }
  }

  function updateChartData() {
    if (chartTurbidity) {
      chartTurbidity.setOption({
        xAxis: { data: state.history.timestamps },
        series: [
          { data: state.history.preTurb },
          { data: state.history.postTurb }
        ]
      });
    }

    if (chartPh) {
      chartPh.setOption({
        xAxis: { data: state.history.timestamps },
        series: [
          { data: state.history.prePh },
          { data: state.history.postPh }
        ]
      });
    }

    if (chartSecondary) {
      if (state.activeTab === 'conductivity') {
        chartSecondary.setOption({
          xAxis: { data: state.history.timestamps },
          series: [
            { data: state.history.preEc },
            { data: state.history.postEc }
          ]
        });
      } else {
        chartSecondary.setOption({
          xAxis: { data: state.history.timestamps },
          series: [
            { data: state.history.preTemp },
            { data: state.history.postTemp }
          ]
        });
      }
    }
  }

  // Event handlers
  function setupEvents() {
    // 1. Scenario button switcher
    const scenarioBtns = document.querySelectorAll('[data-scenario]');
    scenarioBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        scenarioBtns.forEach(b => {
          b.classList.remove('btn-primary', 'active');
          b.classList.add('btn-light');
        });
        this.classList.remove('btn-light');
        this.classList.add('btn-primary', 'active');

        const sc = this.getAttribute('data-scenario');
        state.scenario = sc;

        let note = '';
        let lvl = 'info';
        if (sc === 'turbidity_spike') {
          note = 'Simulation: Storm runoff event (Raw turbidity surged to >60 NTU)';
          lvl = 'warning';
        } else if (sc === 'membrane_breach') {
          note = 'Simulation: Membrane rupture triggered (>5.0 NTU critical breach)';
          lvl = 'danger';
        } else if (sc === 'acid_shock') {
          note = 'Simulation: Inflow acid shock introduced (Raw pH dropped <5.0)';
          lvl = 'warning';
        } else {
          note = 'Simulation: Restored to normal potable operations';
          lvl = 'success';
        }

        addAuditLogRow(lvl, note, 'Operational mode switch');
      });
    });

    // 2. Live update toggle switch
    const liveSwitch = document.getElementById('switch_live_update');
    if (liveSwitch) {
      liveSwitch.addEventListener('change', function () {
        state.isRunning = this.checked;
        const navStatus = document.getElementById('nav_stream_status');
        if (state.isRunning) {
          clearInterval(state.timerId);
          state.timerId = setInterval(generateTick, state.intervalMs);
          if (navStatus) {
            navStatus.className = 'badge bg-info bg-opacity-20 text-info border border-info border-opacity-25 px-2 py-1';
            navStatus.innerHTML = `<i class="ph-broadcast me-1"></i> Stream: ${(state.intervalMs / 1000).toFixed(1)}s LIVE`;
          }
          addAuditLogRow('info', 'Telemetry streaming resumed', 'Live polling active');
        } else {
          clearInterval(state.timerId);
          if (navStatus) {
            navStatus.className = 'badge bg-secondary bg-opacity-20 text-secondary border border-secondary border-opacity-25 px-2 py-1';
            navStatus.innerHTML = '<i class="ph-pause me-1"></i> Stream: PAUSED';
          }
          addAuditLogRow('info', 'Telemetry stream paused', 'Manual pause');
        }
      });
    }

    // 3. Interval selector
    const intervalSelect = document.getElementById('select_update_interval');
    if (intervalSelect) {
      intervalSelect.addEventListener('change', function () {
        state.intervalMs = parseInt(this.value, 10);
        if (state.isRunning) {
          clearInterval(state.timerId);
          state.timerId = setInterval(generateTick, state.intervalMs);
          const navStatus = document.getElementById('nav_stream_status');
          if (navStatus) {
            navStatus.innerHTML = `<i class="ph-broadcast me-1"></i> Stream: ${(state.intervalMs / 1000).toFixed(1)}s LIVE`;
          }
        }
      });
    }

    // 4. Sync / Refresh button
    const btnRefresh = document.getElementById('btn_refresh_stream');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', function () {
        generateTick();
        addAuditLogRow('info', 'Manual telemetry sync request sent', 'Instant tick');
      });
    }

    // 5. Emergency Cut-Off Button
    const btnEmergency = document.getElementById('btn_emergency_valve');
    if (btnEmergency) {
      btnEmergency.addEventListener('click', function () {
        if (state.valveOpen) {
          state.valveOpen = false;
          addAuditLogRow('warning', 'Manual emergency cutoff pressed', 'Solenoid closed by operator');
        } else {
          state.valveOpen = true;
          state.valveAutoTripped = false;
          addAuditLogRow('success', 'Manual valve override triggered', 'Solenoid opened by operator');
        }
        updateUI();
      });
    }

    // 6. Secondary Chart Tab Toggles
    const tabConductivity = document.getElementById('tab_link_conductivity');
    const tabTemp = document.getElementById('tab_link_temp');
    if (tabConductivity && tabTemp) {
      tabConductivity.addEventListener('click', function (e) {
        e.preventDefault();
        tabTemp.classList.remove('active');
        this.classList.add('active');
        state.activeTab = 'conductivity';
        renderSecondaryChart();
      });

      tabTemp.addEventListener('click', function (e) {
        e.preventDefault();
        tabConductivity.classList.remove('active');
        this.classList.add('active');
        state.activeTab = 'temperature';
        renderSecondaryChart();
      });
    }

    // 7. PortaChar Diagnostic Self-Test Button
    const btnSelfTest = document.getElementById('btn_run_self_test');
    if (btnSelfTest) {
      btnSelfTest.addEventListener('click', function () {
        if (state.deviceHealth.selfTestRunning) return;
        state.deviceHealth.selfTestRunning = true;
        btnSelfTest.disabled = true;
        btnSelfTest.innerHTML = '<i class="ph-spinner spinner me-1"></i> Running Self-Test...';
        addAuditLogRow('info', 'Hardware self-test initiated: testing 4S2P Li-Ion BMS & 4-sensor array', 'Diagnostics sweep');

        setTimeout(function () {
          state.deviceHealth.selfTestRunning = false;
          btnSelfTest.disabled = false;
          btnSelfTest.innerHTML = '<i class="ph-check-circle me-1 text-success"></i> Self-Test Passed';

          setTimeout(function () {
            btnSelfTest.innerHTML = '<i class="ph-activity me-1"></i> Run Diagnostic Self-Test';
          }, 3500);

          addAuditLogRow('success', `Self-Test PASSED: Li-Ion SOH ${state.deviceHealth.sohPct}%, 5/5 Probes calibrated, Latency 38ms, ΔP ${state.deviceHealth.biocharDeltaPsi} PSI`, 'All Nominal');
        }, 1200);
      });
    }

    // 8. Power Profile Switcher
    const powerBtns = document.querySelectorAll('[data-power-mode]');
    powerBtns.forEach(btn => {
      btn.addEventListener('click', function () {
        powerBtns.forEach(b => {
          b.classList.remove('active', 'btn-secondary');
          b.classList.add('btn-outline-secondary');
        });
        this.classList.remove('btn-outline-secondary');
        this.classList.add('active', 'btn-secondary');

        const mode = this.getAttribute('data-power-mode');
        state.deviceHealth.powerMode = mode;

        let intervalMs = 1500;
        let modeLabel = 'Standard (1.5s)';
        if (mode === 'eco') {
          intervalMs = 3000;
          modeLabel = 'Eco Mode (3.0s, Low Draw)';
        } else if (mode === 'boost') {
          intervalMs = 1000;
          modeLabel = 'Boost Mode (1.0s High-Rate)';
        }

        state.intervalMs = intervalMs;
        const intervalSelect = document.getElementById('select_update_interval');
        if (intervalSelect) intervalSelect.value = intervalMs.toString();

        if (state.isRunning) {
          clearInterval(state.timerId);
          state.timerId = setInterval(generateTick, state.intervalMs);
          const navStatus = document.getElementById('nav_stream_status');
          if (navStatus) {
            navStatus.innerHTML = `<i class="ph-broadcast me-1"></i> Stream: ${(state.intervalMs / 1000).toFixed(1)}s LIVE`;
          }
        }

        addAuditLogRow('info', `PortaChar power profile set to: ${modeLabel}`, 'Hardware optimization');
        updateUI();
      });
    });
  }

  // On DOM Ready
  document.addEventListener('DOMContentLoaded', function () {
    initHistory();
    initCharts();
    setupEvents();
    updateUI();

    // Initial log entries
    addAuditLogRow('info', 'PortaChar Field Unit #PC-402 initialized', 'Li-Ion 87.4% • 5/5 Probes Synced');
    addAuditLogRow('success', 'Safe thresholds verified: Turbidity < 5.0 NTU • pH 6.5–8.5', 'Operating nominal');

    // Start timer
    state.timerId = setInterval(generateTick, state.intervalMs);
  });

})();
