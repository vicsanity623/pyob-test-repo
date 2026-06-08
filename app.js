/* =====================================================
   DIY Electronics Workbench — app.js
   SOTA Professional Breadboard Simulation Engine
   ===================================================== */

'use strict';

// ─── GLOBAL STATE ─────────────────────────────────────────────────────────────
let components = [];
let wires = [];
let simulationRunning = true;
let transformState = { scale: 1.0, x: 0, y: 0 };
let isPanningWorkspace = false;
let panStart = { x: 0, y: 0 };
let lastTouchDistance = 0;
let activeWireStart = null;
let mousePosition = { x: 0, y: 0 };
let draggedComponent = null;
let dragOffset = { x: 0, y: 0 };
let lastVoltages = [];
let currentMobileTab = 'workspace';
let currentTutorial = 'lead_acid';
let simulationTime = 0.0;
let selectedWireColor = '#ef4444';
let showVoltageLabels = false;
let longPressTimer = null;
let longPressTarget = null;
let isDragging = false;
let activeCtxMenu = null;
let oscData = {};
let scopeAnimFrame = null;
let wireSelectMode = false;
let selectedWireIdx = null;

// Wire colour palette
const WIRE_COLORS = [
  { id: 'red', hex: '#ef4444', label: 'Red' },
  { id: 'blue', hex: '#3b82f6', label: 'Blue' },
  { id: 'black', hex: '#334155', label: 'Black' },
  { id: 'green', hex: '#22c55e', label: 'Green' },
  { id: 'yellow', hex: '#eab308', label: 'Yellow' },
  { id: 'white', hex: '#94a3b8', label: 'White' },
  { id: 'orange', hex: '#f97316', label: 'Orange' },
  { id: 'purple', hex: '#a855f7', label: 'Purple' },
];

// ─── DOM REFS ──────────────────────────────────────────────────────────────────
let workspace, container, wireLayer, playPauseBtn, clearBtn;

// ─── PARTS CATALOGUE ──────────────────────────────────────────────────────────
const PARTS_CATALOGUE = [
  // ── POWER SOURCES ──────────────────────────────────────────────────────────
  {
    group: 'Power Sources',
    parts: [
      { type: 'battery_18650', icon: '🔋', iconClass: 'icon-battery', name: '18650 Li-ion', desc: '3.7V, 2600mAh, 40mΩ' },
      { type: 'battery_aaa', icon: '🔋', iconClass: 'icon-battery', name: 'AAA Battery', desc: '1.5V Alkaline' },
      { type: 'battery_d', icon: '🔋', iconClass: 'icon-battery', name: 'D Cell Battery', desc: '1.5V, 10000mAh' },
      { type: 'lemon_battery', icon: '🍋', iconClass: 'icon-battery', name: 'Lemon Battery', desc: '0.9V, High IR' },
      { type: 'usb_power', icon: '🔌', iconClass: 'icon-power', name: '5V USB Power Supply', desc: 'Fixed 5V DC VBUS / GND rails' },
      { type: 'bench_psu', icon: '⚡', iconClass: 'icon-power', name: 'Bench PSU (0-30V adj)', desc: 'Adjustable lab supply with CC/CV' },
      { type: 'battery_9v', icon: '🔋', iconClass: 'icon-battery', name: '9V PP3 Battery', desc: 'Zinc-carbon 6F22, 500mAh' },
      { type: 'battery_aa', icon: '🔋', iconClass: 'icon-battery', name: 'AA Battery (1.5V)', desc: 'Alkaline LR6, 2850mAh' },
      { type: 'battery_cr2032', icon: '🔋', iconClass: 'icon-battery', name: 'CR2032 Coin Cell', desc: '3V Lithium, 210mAh' },
      { type: 'battery_lipo', icon: '🔋', iconClass: 'icon-battery', name: 'LiPo 3.7V Cell', desc: 'Li-Polymer 1000mAh, internal resistance 80mΩ' },
      { type: 'battery_lead', icon: '🔋', iconClass: 'icon-battery', name: '12V Lead Acid', desc: 'VRLA 7Ah, SLA AGM type' },
      { type: 'solar_panel', icon: '☀️', iconClass: 'icon-power', name: '12V Solar Panel', desc: 'Pmax 10W, Voc 18V, Isc 0.66A' },
      { type: 'signal_generator', icon: '〰️', iconClass: 'icon-power', name: 'AC Signal Generator', desc: 'Sine/Square/Saw, 0.1Hz–20kHz' },
      { type: 'diy_cell', icon: '🧪', iconClass: 'icon-battery', name: 'DIY Epsom-Salt Cell', desc: 'Modified Planté lead chemistry' },
    ]
  },
  // ── RAW MATERIALS ──────────────────────────────────────────────────────────
  {
    group: 'Raw Materials',
    parts: [
      { type: 'wire_copper', icon: '〰', iconClass: 'icon-passive', name: 'Copper Wire', desc: 'Low resistance (0.01Ω)' },
      { type: 'wire_nichrome', icon: '〰', iconClass: 'icon-passive', name: 'Nichrome Wire', desc: 'High resistance heater' },
      { type: 'salt_water', icon: '💧', iconClass: 'icon-passive', name: 'Salt Water Cell', desc: 'Conductive electrolyte' },
    ]
  },
  // ── PASSIVE COMPONENTS ─────────────────────────────────────────────────────
  {
    group: 'Passives',
    parts: [
      { type: 'resistor_220', icon: 'Ω', iconClass: 'icon-passive', name: 'Resistor 220Ω', desc: '±5% tolerance, fixed' },
      { type: 'resistor_330', icon: 'Ω', iconClass: 'icon-passive', name: 'Resistor 330Ω', desc: '±5% tolerance, fixed' },
      { type: 'resistor_4k7', icon: 'Ω', iconClass: 'icon-passive', name: 'Resistor 4.7kΩ', desc: '±5% tolerance, fixed' },
      { type: 'resistor_1m', icon: 'Ω', iconClass: 'icon-passive', name: 'Resistor 1MΩ', desc: '±5% tolerance, fixed' },
      { type: 'cap_1u', icon: '◫', iconClass: 'icon-passive', name: 'Capacitor 1µF', desc: 'Electrolytic' },
      { type: 'cap_100u', icon: '◫', iconClass: 'icon-passive', name: 'Capacitor 100µF', desc: 'Electrolytic' },
      { type: 'ind_1mH', icon: '⊂⊃', iconClass: 'icon-passive', name: 'Inductor 1mH', desc: 'RF Choke' },
      { type: 'resistor', icon: 'Ω', iconClass: 'icon-passive', name: 'Resistor (variable)', desc: '1Ω–10MΩ, 0.25W carbon film' },
      { type: 'resistor_1k', icon: 'Ω', iconClass: 'icon-passive', name: 'Resistor 1kΩ', desc: '±5% tolerance, fixed' },
      { type: 'resistor_10k', icon: 'Ω', iconClass: 'icon-passive', name: 'Resistor 10kΩ', desc: '±5% tolerance, fixed' },
      { type: 'resistor_100', icon: 'Ω', iconClass: 'icon-passive', name: 'Resistor 100Ω', desc: '±5% tolerance, fixed' },
      { type: 'pot', icon: '🎚️', iconClass: 'icon-passive', name: 'Potentiometer 10kΩ', desc: 'Linear taper, 3-terminal' },
      { type: 'capacitor', icon: '◫', iconClass: 'icon-passive', name: 'Capacitor 1000µF', desc: 'Electrolytic, 25V rated' },
      { type: 'cap_100n', icon: '◫', iconClass: 'icon-passive', name: 'Capacitor 100nF', desc: 'Ceramic disc, 50V rated' },
      { type: 'cap_10u', icon: '◫', iconClass: 'icon-passive', name: 'Capacitor 10µF', desc: 'Electrolytic, 50V rated' },
      { type: 'inductor', icon: '⊂⊃', iconClass: 'icon-passive', name: 'Inductor 100µH', desc: 'Ferrite core, DCR 0.4Ω, Isat 0.5A' },
      { type: 'diode', icon: '▶', iconClass: 'icon-passive', name: 'Diode 1N4007', desc: 'Rectifier, Vf 0.7V, 1A 1000V' },
      { type: 'zener', icon: '⇒', iconClass: 'icon-passive', name: 'Zener Diode 5.1V', desc: 'BZX55C5V1, Pzmax 500mW' },
      { type: 'transformer', icon: '⊘', iconClass: 'icon-passive', name: 'Transformer 1:10', desc: 'Step-up audio, 600Ω:60kΩ' },
    ]
  },
  // ── SEMICONDUCTORS ─────────────────────────────────────────────────────────
  {
    group: 'Semiconductors',
    parts: [
      { type: 'diode_1n4148', icon: '▶', iconClass: 'icon-passive', name: 'Diode 1N4148', desc: 'Fast switching, 0.7V' },
      { type: 'diode_1n5819', icon: '▶', iconClass: 'icon-passive', name: 'Diode 1N5819', desc: 'Schottky, 0.2V drop' },
      { type: 'led_white', icon: '🤍', iconClass: 'icon-active', name: 'LED White 5mm', desc: 'Vf 3.3V, If 20mA' },
      { type: 'npn_bc547', icon: '📉', iconClass: 'icon-active', name: 'NPN BC547', desc: 'Small signal BJT' },
      { type: 'pnp_bc557', icon: '📈', iconClass: 'icon-active', name: 'PNP BC557', desc: 'Small signal BJT' },
      { type: 'mosfet_2n7000', icon: '🧱', iconClass: 'icon-active', name: 'N-ch 2N7000', desc: 'Small signal MOSFET' },
      { type: 'led', icon: '💡', iconClass: 'icon-active', name: 'LED Red 5mm', desc: 'Vf 2.0V, If 20mA max 45mA' },
      { type: 'led_green', icon: '💚', iconClass: 'icon-active', name: 'LED Green 5mm', desc: 'Vf 2.2V, If 20mA, λ 525nm' },
      { type: 'led_blue', icon: '💙', iconClass: 'icon-active', name: 'LED Blue 5mm', desc: 'Vf 3.2V, If 20mA, λ 465nm' },
      { type: 'led_yellow', icon: '💛', iconClass: 'icon-active', name: 'LED Yellow 5mm', desc: 'Vf 2.1V, If 20mA, λ 590nm' },
      { type: 'led_rgb', icon: '🌈', iconClass: 'icon-active', name: 'RGB LED (common cath)', desc: 'Three element, 4-terminal' },
      { type: 'npn_transistor', icon: '📉', iconClass: 'icon-active', name: 'NPN BJT 2N2222', desc: 'Vceo 40V, Ic 600mA, hFE 100' },
      { type: 'pnp_transistor', icon: '📈', iconClass: 'icon-active', name: 'PNP BJT 2N2907', desc: 'Vceo 40V, Ic 600mA, hFE 100' },
      { type: 'mosfet_n', icon: '🧱', iconClass: 'icon-active', name: 'N-ch MOSFET IRLZ44N', desc: 'Vgs(th) 2V, Id 47A, Rds 22mΩ' },
      { type: 'mosfet_p', icon: '🧱', iconClass: 'icon-active', name: 'P-ch MOSFET IRF9540N', desc: 'Vgs(th) -4V, Id 19A, Rds 117mΩ' },
    ]
  },
  // ── ICs & LOGIC ────────────────────────────────────────────────────────────
  {
    group: 'ICs & Logic',
    parts: [
      { type: 'ic_74hc00', icon: '📦', iconClass: 'icon-logic', name: '74HC00 NAND', desc: 'Quad 2-Input NAND Gate' },
      { type: 'ic_74hc08', icon: '📦', iconClass: 'icon-logic', name: '74HC08 AND', desc: 'Quad 2-Input AND Gate' },
      { type: 'ic_74hc04', icon: '📦', iconClass: 'icon-logic', name: '74HC04 NOT', desc: 'Hex Inverter Gate' },
      { type: 'ne555', icon: '📦', iconClass: 'icon-logic', name: 'NE555 Timer', desc: 'Astable/monostable, 5V–15V, 200mA' },
      { type: 'lm741', icon: '📦', iconClass: 'icon-logic', name: 'LM741 Op-Amp', desc: 'Single op-amp, ±15V supply' },
      { type: 'lm358', icon: '📦', iconClass: 'icon-logic', name: 'LM358 Dual Op-Amp', desc: 'Single-supply, 3V–32V, GBW 1MHz' },
      { type: 'lm7805', icon: '📦', iconClass: 'icon-logic', name: 'LM7805 Voltage Reg', desc: 'Fixed +5V, 1A, TO-220 package' },
      { type: 'lm317', icon: '📦', iconClass: 'icon-logic', name: 'LM317 Adj. Reg', desc: 'Adj 1.25–37V, 1.5A, TO-220' },
    ]
  },
  // ── SENSORS ────────────────────────────────────────────────────────────────
  {
    group: 'Sensors',
    parts: [
      { type: 'dip_switch', icon: '🎛️', iconClass: 'icon-sensor', name: 'DIP Switch', desc: '4-position DIP switch' },
      { type: 'slide_switch', icon: '🎚️', iconClass: 'icon-sensor', name: 'Slide Switch', desc: 'SPDT contact' },
      { type: 'thermistor', icon: '🌡️', iconClass: 'icon-sensor', name: 'NTC Thermistor 10kΩ', desc: 'B=3950K, R25=10kΩ, -40°–125°C' },
      { type: 'ldr', icon: '👁️', iconClass: 'icon-sensor', name: 'LDR Photoresistor', desc: 'CdS GL5539, 5–200kΩ dark/light' },
      { type: 'spst_switch', icon: '🎛️', iconClass: 'icon-sensor', name: 'SPST Switch', desc: 'Manual SPST contact' },
      { type: 'pushbutton', icon: '⏏️', iconClass: 'icon-sensor', name: 'Pushbutton (NO)', desc: 'Momentary NO contact' },
    ]
  },
  // ── DISPLAY & AUDIO ────────────────────────────────────────────────────────
  {
    group: 'Display & Audio',
    parts: [
      { type: 'seven_seg', icon: '7️⃣', iconClass: 'icon-display', name: '7-Segment Display', desc: 'Common cathode, single digit' },
      { type: 'buzzer', icon: '🔔', iconClass: 'icon-audio', name: 'Piezo Buzzer', desc: '5V active buzzer, 2.3kHz' },
      { type: 'speaker', icon: '🔊', iconClass: 'icon-audio', name: '8Ω Speaker', desc: '0.25W, full-range driver' },
    ]
  },
  // ── INSTRUMENTATION ────────────────────────────────────────────────────────
  {
    group: 'Instrumentation',
    parts: [
      { type: 'multimeter', icon: '📟', iconClass: 'icon-measure', name: 'Digital Multimeter', desc: 'V / mA / Ω measurement' },
      { type: 'oscilloscope', icon: '📺', iconClass: 'icon-measure', name: 'Mini Oscilloscope', desc: 'Waveform display 2-ch' },
    ]
  },
];

// ─── COMPONENT DEFINITIONS ─────────────────────────────────────────────────────
function makeTerminals(id, defs) {
  return defs.map((d, i) => ({
    id: `${id}_t${i}`,
    label: d.label,
    relX: d.x,
    relY: d.y,
    voltage: 0.0
  }));
}

function buildComponent(type, id, existingComponents) {
  let terminals = [], state = {};
  switch (type) {
    case 'battery_18650':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { voltage: 3.7, capacity: 2600, charge: 100, internalR: 0.04, name: '18650 Li-ion' };
      break;
    case 'battery_aaa':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { voltage: 1.5, capacity: 1200, charge: 100, internalR: 0.3, name: 'AAA Alkaline' };
      break;
    case 'battery_d':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { voltage: 1.5, capacity: 10000, charge: 100, internalR: 0.1, name: 'D Cell' };
      break;
    case 'lemon_battery':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { voltage: 0.9, capacity: 50, charge: 100, internalR: 250, name: 'Lemon Bat' };
      break;
    case 'usb_power':
      terminals = makeTerminals(id, [{ label: '5V', x: 176, y: 32 }, { label: 'GND', x: 176, y: 68 }]);
      state = { name: 'USB 5V' };
      break;
    case 'bench_psu':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: 'GND', x: 176, y: 68 }]);
      state = { voltage: 12.0, currentLimit: 1.0, name: 'Bench PSU' };
      break;
    case 'battery_9v':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { voltage: 9.0, capacity: 500, charge: 100, internalR: 5, name: '9V PP3' };
      break;
    case 'battery_aa':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { voltage: 1.5, capacity: 2850, charge: 100, internalR: 0.3, name: 'AA 1.5V' };
      break;
    case 'battery_cr2032':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { voltage: 3.0, capacity: 210, charge: 100, internalR: 10, name: 'CR2032' };
      break;
    case 'battery_lipo':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { voltage: 3.7, capacity: 1000, charge: 100, internalR: 0.08, name: 'LiPo 3.7V' };
      break;
    case 'battery_lead':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { voltage: 12.0, capacity: 7000, charge: 100, internalR: 0.05, name: '12V SLA' };
      break;
    case 'solar_panel':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 32 }, { label: '-', x: 176, y: 68 }]);
      state = { sunlight: 50, voltage: 6.0, isc: 0.66, name: 'Solar 12V' };
      break;
    case 'signal_generator':
      terminals = makeTerminals(id, [{ label: '+', x: 176, y: 50 }, { label: '-', x: 20, y: 50 }]);
      state = { frequency: 0.5, amplitude: 2.0, waveform: 'sine', outputVoltage: 0.0, name: 'Sig.Gen' };
      break;
    case 'diy_cell':
      terminals = makeTerminals(id, [{ label: '+', x: 25, y: 32 }, { label: '-', x: 155, y: 32 }]);
      state = {
        forming: 0, charge: 0, voltage: 0.0, current: 0.0,
        name: 'Cell ' + (existingComponents.filter(c => c.type === 'diy_cell').length + 1)
      };
      break;
    case 'resistor':
      terminals = makeTerminals(id, [{ label: 'A', x: 16, y: 62 }, { label: 'B', x: 176, y: 62 }]);
      state = { resistance: 330, fixed: false };
      break;
    case 'resistor_1k':
      terminals = makeTerminals(id, [{ label: 'A', x: 16, y: 62 }, { label: 'B', x: 176, y: 62 }]);
      state = { resistance: 1000, fixed: true };
      break;
    case 'resistor_10k':
      terminals = makeTerminals(id, [{ label: 'A', x: 16, y: 62 }, { label: 'B', x: 176, y: 62 }]);
      state = { resistance: 10000, fixed: true };
      break;
    case 'resistor_100':
      terminals = makeTerminals(id, [{ label: 'A', x: 16, y: 62 }, { label: 'B', x: 176, y: 62 }]);
      state = { resistance: 100, fixed: true };
      break;
    case 'pot':
      terminals = makeTerminals(id, [{ label: 'A', x: 16, y: 62 }, { label: 'W', x: 96, y: 20 }, { label: 'B', x: 176, y: 62 }]);
      state = { resistance: 10000, wiper: 0.5 };
      break;
    case 'capacitor':
      terminals = makeTerminals(id, [{ label: '+', x: 25, y: 50 }, { label: '-', x: 155, y: 50 }]);
      state = { capacitance: 1000e-6, storedVoltage: 0.0, name: '1000µF' };
      break;
    case 'cap_100n':
      terminals = makeTerminals(id, [{ label: '+', x: 25, y: 50 }, { label: '-', x: 155, y: 50 }]);
      state = { capacitance: 100e-9, storedVoltage: 0.0, name: '100nF' };
      break;
    case 'cap_10u':
      terminals = makeTerminals(id, [{ label: '+', x: 25, y: 50 }, { label: '-', x: 155, y: 50 }]);
      state = { capacitance: 10e-6, storedVoltage: 0.0, name: '10µF' };
      break;
    case 'ind_1mH':
    case 'inductor':
      terminals = makeTerminals(id, [{ label: 'A', x: 16, y: 50 }, { label: 'B', x: 176, y: 50 }]);
      state = { inductance: 100e-6, current: 0.0, name: '100µH' };
      break;
    case 'diode':
      terminals = makeTerminals(id, [{ label: 'A+', x: 16, y: 62 }, { label: 'K-', x: 176, y: 62 }]);
      state = { vf: 0.7, name: '1N4007' };
      break;
    case 'zener':
      terminals = makeTerminals(id, [{ label: 'A+', x: 16, y: 62 }, { label: 'K-', x: 176, y: 62 }]);
      state = { vf: 0.7, vz: 5.1, name: '5.1V Zener' };
      break;
    case 'transformer':
      terminals = makeTerminals(id, [{ label: 'P+', x: 16, y: 35 }, { label: 'P-', x: 16, y: 70 }, { label: 'S+', x: 176, y: 35 }, { label: 'S-', x: 176, y: 70 }]);
      state = { ratio: 10, name: '1:10 XFMR' };
      break;
    case 'led':
      terminals = makeTerminals(id, [{ label: 'A+', x: 28, y: 72 }, { label: 'K-', x: 148, y: 72 }]);
      state = { blown: false, current: 0.0, vf: 2.0, color: '#ef4444', name: 'LED Red' };
      break;
    case 'led_green':
      terminals = makeTerminals(id, [{ label: 'A+', x: 28, y: 72 }, { label: 'K-', x: 148, y: 72 }]);
      state = { blown: false, current: 0.0, vf: 2.2, color: '#22c55e', name: 'LED Green' };
      break;
    case 'led_blue':
      terminals = makeTerminals(id, [{ label: 'A+', x: 28, y: 72 }, { label: 'K-', x: 148, y: 72 }]);
      state = { blown: false, current: 0.0, vf: 3.2, color: '#3b82f6', name: 'LED Blue' };
      break;
    case 'led_yellow':
      terminals = makeTerminals(id, [{ label: 'A+', x: 28, y: 72 }, { label: 'K-', x: 148, y: 72 }]);
      state = { blown: false, current: 0.0, vf: 2.1, color: '#eab308', name: 'LED Yellow' };
      break;
    case 'led_rgb':
      terminals = makeTerminals(id, [{ label: 'R+', x: 20, y: 85 }, { label: 'G+', x: 60, y: 85 }, { label: 'B+', x: 100, y: 85 }, { label: 'K-', x: 140, y: 85 }]);
      state = { blownR: false, blownG: false, blownB: false, name: 'RGB LED' };
      break;
    case 'npn_transistor':
      terminals = makeTerminals(id, [{ label: 'C', x: 92, y: 22 }, { label: 'B', x: 26, y: 82 }, { label: 'E', x: 158, y: 82 }]);
      state = { current_b: 0.0, beta: 100, name: '2N2222 NPN', vbe_on: 0.7 };
      break;
    case 'pnp_transistor':
      terminals = makeTerminals(id, [{ label: 'C', x: 92, y: 22 }, { label: 'B', x: 26, y: 82 }, { label: 'E', x: 158, y: 82 }]);
      state = { current_b: 0.0, beta: 100, name: '2N2907 PNP', vbe_on: 0.7 };
      break;
    case 'mosfet_n':
      terminals = makeTerminals(id, [{ label: 'D', x: 92, y: 22 }, { label: 'G', x: 26, y: 82 }, { label: 'S', x: 158, y: 82 }]);
      state = { threshold: 2.0, rds_on: 0.022, name: 'IRLZ44N N-ch' };
      break;
    case 'mosfet_p':
      terminals = makeTerminals(id, [{ label: 'D', x: 92, y: 22 }, { label: 'G', x: 26, y: 82 }, { label: 'S', x: 158, y: 82 }]);
      state = { threshold: -4.0, rds_on: 0.117, name: 'IRF9540N P-ch' };
      break;
    case 'ne555':
      terminals = makeTerminals(id, [{ label: 'Vcc', x: 176, y: 25 }, { label: 'GND', x: 176, y: 55 }, { label: 'OUT', x: 176, y: 80 }, { label: 'TRG', x: 20, y: 25 }, { label: 'THR', x: 20, y: 55 }, { label: 'DIS', x: 20, y: 80 }]);
      state = { mode: 'astable', out: false, capV: 0.0, name: 'NE555' };
      break;
    case 'lm741':
      terminals = makeTerminals(id, [{ label: 'IN+', x: 20, y: 35 }, { label: 'IN-', x: 20, y: 65 }, { label: 'Vcc+', x: 96, y: 10 }, { label: 'Vcc-', x: 96, y: 90 }, { label: 'OUT', x: 176, y: 50 }]);
      state = { gain: 100000, name: 'LM741' };
      break;
    case 'lm358':
      terminals = makeTerminals(id, [{ label: 'IN+', x: 20, y: 35 }, { label: 'IN-', x: 20, y: 65 }, { label: 'Vcc', x: 96, y: 10 }, { label: 'GND', x: 96, y: 90 }, { label: 'OUT', x: 176, y: 50 }]);
      state = { gain: 100000, name: 'LM358' };
      break;
    case 'lm7805':
      terminals = makeTerminals(id, [{ label: 'IN', x: 20, y: 55 }, { label: 'GND', x: 96, y: 85 }, { label: 'OUT', x: 176, y: 55 }]);
      state = { vout: 5.0, name: 'LM7805' };
      break;
    case 'lm317':
      terminals = makeTerminals(id, [{ label: 'IN', x: 20, y: 55 }, { label: 'ADJ', x: 96, y: 85 }, { label: 'OUT', x: 176, y: 55 }]);
      state = { r1: 240, r2: 2400, vout: 12.0, name: 'LM317' };
      break;
    case 'thermistor':
      terminals = makeTerminals(id, [{ label: 'A', x: 16, y: 62 }, { label: 'B', x: 176, y: 62 }]);
      state = { temp: 25, b: 3950, r25: 10000, name: 'NTC 10kΩ' };
      break;
    case 'ldr':
      terminals = makeTerminals(id, [{ label: 'A', x: 16, y: 62 }, { label: 'B', x: 176, y: 62 }]);
      state = { lightPct: 50, name: 'LDR GL5539' };
      break;
    case 'spst_switch':
      terminals = makeTerminals(id, [{ label: 'In', x: 22, y: 50 }, { label: 'Out', x: 152, y: 50 }]);
      state = { closed: false, name: 'SPST' };
      break;
    case 'pushbutton':
      terminals = makeTerminals(id, [{ label: '1', x: 22, y: 50 }, { label: '2', x: 152, y: 50 }]);
      state = { pressed: false, name: 'Pushbutton' };
      break;
    case 'seven_seg':
      terminals = makeTerminals(id, [{ label: 'a', x: 20, y: 110 }, { label: 'b', x: 44, y: 110 }, { label: 'c', x: 68, y: 110 }, { label: 'd', x: 92, y: 110 }, { label: 'e', x: 116, y: 110 }, { label: 'f', x: 140, y: 110 }, { label: 'g', x: 164, y: 110 }, { label: 'K', x: 92, y: 10 }]);
      state = { name: '7-Seg' };
      break;
    case 'buzzer':
      terminals = makeTerminals(id, [{ label: '+', x: 28, y: 72 }, { label: '-', x: 148, y: 72 }]);
      state = { freq: 2300, active: false, name: 'Buzzer 5V' };
      break;
    case 'speaker':
      terminals = makeTerminals(id, [{ label: '+', x: 28, y: 72 }, { label: '-', x: 148, y: 72 }]);
      state = { impedance: 8, power: 0.25, active: false, name: '8Ω Speaker' };
      break;
    case 'multimeter':
      terminals = makeTerminals(id, [{ label: 'VΩ+', x: 38, y: 130 }, { label: 'COM-', x: 138, y: 130 }]);
      state = { mode: 'voltage', value: 0.0, name: 'DMM' };
      break;
    case 'oscilloscope':
      terminals = makeTerminals(id, [{ label: 'CH1', x: 30, y: 130 }, { label: 'GND', x: 96, y: 130 }, { label: 'CH2', x: 162, y: 130 }]);
      state = { timebase: 0.5, gain: 1.0, name: 'Oscilloscope' };
      if (!oscData[id]) oscData[id] = { ch1: [], ch2: [] };
      break;
    default:
      terminals = [];
      state = {};
  }
  return { terminals, state };
}

// ─── COMPONENT CARD SIZES ──────────────────────────────────────────────────────
function getCardSize(type) {
  const map = {
    oscilloscope: 'w-48', seven_seg: 'w-48', ne555: 'w-48', lm741: 'w-48',
    lm358: 'w-48', transformer: 'w-48', led_rgb: 'w-44', mosfet_n: 'w-48',
    mosfet_p: 'w-48', npn_transistor: 'w-48', pnp_transistor: 'w-48',
    multimeter: 'w-44', bench_psu: 'w-48', lm317: 'w-48', ic_74hc00: 'w-48', ic_74hc08: 'w-48', ic_74hc04: 'w-48', dip_switch: 'w-48', slide_switch: 'w-48',
  };
  return map[type] || 'w-48';
}

// ─── COMPONENT TITLE ───────────────────────────────────────────────────────────
function getComponentTitle(comp) {
  return comp.state.name || comp.type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

// ─── RENDER COMPONENT INNER HTML ──────────────────────────────────────────────
function buildCardBody(comp) {
  const id = comp.id;
  switch (comp.type) {
    case 'usb_power':
      return `<div class="flex flex-col items-center gap-1 py-1">
           <div class="readout-label">USB NATIVE OUTPUT</div>
           <div class="readout">5.00 V</div>
           <div class="readout-label">VBUS DC</div>
         </div>`;
    case 'bench_psu':
      return `<div class="flex flex-col gap-2">
           <div class="flex justify-between items-center"><span class="text-muted" style="font-size:9px">Voltage (V)</span>
             <input type="number" id="${id}-v" min="0" max="30" step="0.5" value="${comp.state.voltage}" style="width:56px" onchange="updateBenchPSU('${id}','v',this.value)">
           </div>
           <div class="flex justify-between items-center"><span class="text-muted" style="font-size:9px">I-Limit (A)</span>
             <input type="number" id="${id}-i" min="0" max="3" step="0.1" value="${comp.state.currentLimit}" style="width:56px" onchange="updateBenchPSU('${id}','i',this.value)">
           </div>
           <div class="readout readout-sm text-center" id="${id}-readout">${comp.state.voltage.toFixed(2)} V</div>
         </div>`;
    case 'battery_18650': case 'battery_aaa': case 'battery_d': case 'lemon_battery':
    case 'battery_9v': case 'battery_aa': case 'battery_cr2032':
    case 'battery_lipo': case 'battery_lead':
      return `<div class="flex flex-col gap-1.5">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">EMF</span><span class="font-mono text-teal" style="font-size:11px">${comp.state.voltage.toFixed(2)} V</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Int. R</span><span class="font-mono" style="font-size:10px">${comp.state.internalR}Ω</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Charge</span><span class="font-mono text-amber" id="${id}-chg" style="font-size:10px">100%</span></div>
           <div class="progress-track"><div class="progress-fill" id="${id}-chg-bar" style="width:100%;background:#f59e0b"></div></div>
         </div>`;
    case 'solar_panel':
      return `<div class="flex flex-col gap-1.5">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Sunlight</span><span class="font-mono text-amber" id="${id}-sun" style="font-size:11px">50%</span></div>
           <input type="range" class="amber" min="0" max="100" value="50" oninput="updateSolarPanel('${id}',this.value)">
           <div class="flex justify-between" style="margin-top:2px"><span class="text-muted" style="font-size:9px">Output</span><span class="font-mono text-teal" id="${id}-out" style="font-size:11px">6.00 V</span></div>
         </div>`;
    case 'signal_generator':
      return `<div class="flex flex-col gap-1.5">
           <div class="flex gap-1 justify-center">
             ${['sine', 'square', 'saw'].map(w => `<button onclick="setSigWave('${id}','${w}')" id="${id}-wave-${w}" class="btn btn-secondary" style="padding:2px 6px;font-size:9px;border-radius:4px">${w.charAt(0).toUpperCase() + w.slice(1)}</button>`).join('')}
           </div>
           <div class="flex justify-between items-center"><span class="text-muted" style="font-size:9px">Freq Hz</span>
             <input type="number" id="${id}-freq" min="0.1" max="20000" step="0.1" value="0.5" style="width:56px" onchange="updateSigGen('${id}',this.value)">
           </div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Amplitude</span>
             <input type="number" id="${id}-amp" min="0.1" max="20" step="0.5" value="2.0" style="width:56px" onchange="updateSigAmp('${id}',this.value)">
           </div>
           <div class="readout readout-sm pulse" id="${id}-disp">0.00 V</div>
         </div>`;
    case 'diy_cell':
      return `<div class="flex flex-col gap-1.5">
           <div class="flex justify-between items-center" style="border-bottom:1px solid var(--border);padding-bottom:4px;margin-bottom:2px">
             <span class="text-muted" style="font-size:9px">Label</span>
             <input type="text" value="${comp.state.name}" style="width:80px;text-align:right" oninput="comp_${id.replace(/-/g, '_')}_setName(this.value)">
           </div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Forming</span><span class="font-mono text-amber" id="${id}-forming" style="font-size:10px">0%</span></div>
           <div class="progress-track"><div class="progress-fill" id="${id}-f-bar" style="width:0%;background:#f59e0b"></div></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Charge</span><span class="font-mono text-teal" id="${id}-charge" style="font-size:10px">0%</span></div>
           <div class="progress-track"><div class="progress-fill" id="${id}-c-bar" style="width:0%;background:#00e5c8"></div></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">EMF</span><span class="font-mono" id="${id}-emf" style="font-size:10px;color:var(--text-primary)">0.00 V</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Current</span><span class="font-mono" id="${id}-curr" style="font-size:10px;color:var(--text-primary)">0.0 mA</span></div>
           <div id="${id}-bubble" class="hidden text-center pulse" style="font-size:9px;color:#7dd3fc;background:rgba(56,189,248,0.1);border:1px solid #0369a1;border-radius:4px;padding:2px 4px;">💨 Gassing</div>
         </div>`;
    case 'resistor_220': case 'resistor_330': case 'resistor_4k7': case 'resistor_1m': case 'wire_copper': case 'wire_nichrome': case 'salt_water':
    case 'resistor': case 'resistor_1k': case 'resistor_10k': case 'resistor_100':
      const fixed = comp.state.fixed;
      return `<div class="flex flex-col gap-2">
           ${fixed ? `<div class="flex justify-between"><span class="text-muted" style="font-size:9px">Value</span><span class="font-mono" style="font-size:11px">${formatResistance(comp.state.resistance)}</span></div>` :
          `<div class="flex justify-between items-center"><span class="text-muted" style="font-size:9px">Value (Ω)</span>
             <input type="number" id="${id}-rval" min="1" max="10000000" value="${comp.state.resistance}" style="width:70px" onchange="updateResistorVal('${id}',this.value)">
           </div>`}
           <div class="flex items-center gap-1">
             <div class="resistor-lead"></div>
             <div class="resistor-body" style="flex:2">
               <div class="resistor-band" id="${id}-b1"></div>
               <div class="resistor-band" id="${id}-b2"></div>
               <div class="resistor-band" id="${id}-b3"></div>
               <div class="resistor-band" style="background:#c8a000;width:2px"></div>
             </div>
             <div class="resistor-lead"></div>
           </div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Power</span><span class="font-mono text-amber" id="${id}-pwr" style="font-size:9px">0 mW</span></div>
         </div>`;
    case 'pot':
      return `<div class="flex flex-col gap-2">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Wiper</span><span class="font-mono text-teal" id="${id}-wiper-pct" style="font-size:10px">50%</span></div>
           <input type="range" min="0" max="100" value="50" oninput="updatePot('${id}',this.value)">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">R(A-W)</span><span class="font-mono" id="${id}-raw" style="font-size:9px">5.0 kΩ</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">R(W-B)</span><span class="font-mono" id="${id}-rwb" style="font-size:9px">5.0 kΩ</span></div>
         </div>`;
    case 'cap_1u': case 'cap_100u':
    case 'capacitor': case 'cap_100n': case 'cap_10u':
      const cLabel = comp.state.name || '1000µF';
      return `<div class="flex flex-col gap-1.5">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Value</span><span class="font-mono" style="font-size:10px">${cLabel}</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Stored V</span><span class="font-mono text-sky" id="${id}-sv" style="font-size:11px">0.00 V</span></div>
           <div class="progress-track"><div class="progress-fill" id="${id}-cbar" style="width:0%;background:#38bdf8"></div></div>
         </div>`;
    case 'ind_1mH':
    case 'inductor':
      return `<div class="flex flex-col gap-1.5">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Value</span><span class="font-mono" style="font-size:10px">100µH</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Current</span><span class="font-mono text-purple" id="${id}-curr" style="font-size:11px">0.00 mA</span></div>
         </div>`;
    case 'diode_1n4148': case 'diode_1n5819':
    case 'diode': case 'zener':
      return `<div class="flex flex-col gap-1.5">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Type</span><span class="font-mono" style="font-size:10px">${comp.state.name}</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Vf</span><span class="font-mono" style="font-size:10px">${comp.state.vf}V</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">State</span><span class="font-mono" id="${id}-state" style="font-size:10px">Off</span></div>
         </div>`;
    case 'transformer':
      return `<div class="flex flex-col gap-1.5">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Turns ratio</span><span class="font-mono" style="font-size:10px">1:10</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Primary V</span><span class="font-mono" id="${id}-vp" style="font-size:10px">0.00 V</span></div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Secondary V</span><span class="font-mono text-teal" id="${id}-vs" style="font-size:10px">0.00 V</span></div>
         </div>`;
    case 'led_white':
    case 'led': case 'led_green': case 'led_blue': case 'led_yellow':
      return `<div class="flex flex-col items-center gap-2 py-1">
           <div class="led-bulb" id="${id}-bulb"><div class="led-bulb-inner" id="${id}-bulb-inner"></div></div>
           <div style="font-size:10px;text-align:center;color:var(--text-muted)" id="${id}-status">Off</div>
           <button id="${id}-reset" class="hidden btn btn-danger" style="font-size:9px;padding:3px 8px" onclick="resetBlownLed('${id}')">Replace LED</button>
         </div>`;
    case 'led_rgb':
      return `<div class="flex flex-col items-center gap-2 py-1">
           <div style="display:flex;gap:6px">
             <div class="led-bulb" id="${id}-r-bulb" style="width:22px;height:22px"><div class="led-bulb-inner" id="${id}-r-inner" style="width:10px;height:10px;background:#7f1d1d"></div></div>
             <div class="led-bulb" id="${id}-g-bulb" style="width:22px;height:22px"><div class="led-bulb-inner" id="${id}-g-inner" style="width:10px;height:10px;background:#14532d"></div></div>
             <div class="led-bulb" id="${id}-b-bulb" style="width:22px;height:22px"><div class="led-bulb-inner" id="${id}-b-inner" style="width:10px;height:10px;background:#1e3a5f"></div></div>
           </div>
           <div style="font-size:9px;color:var(--text-muted)">R / G / B</div>
         </div>`;
    case 'npn_bc547': case 'pnp_bc557':
    case 'npn_transistor': case 'pnp_transistor':
      const polarity = comp.type === 'npn_transistor' ? 'NPN' : 'PNP';
      return `<div class="flex flex-col gap-1.5 items-center">
           <div class="font-mono" style="font-size:9px;color:var(--text-secondary)">${comp.state.name} – ${polarity} BJT</div>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%">
             <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Ib</span><span class="font-mono" id="${id}-ib" style="font-size:9px">0µA</span></div>
             <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Ic</span><span class="font-mono text-rose" id="${id}-ic" style="font-size:9px">0mA</span></div>
             <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Vbe</span><span class="font-mono" id="${id}-vbe" style="font-size:9px">0.0V</span></div>
             <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Vce</span><span class="font-mono" id="${id}-vce" style="font-size:9px">0.0V</span></div>
           </div>
           <div id="${id}-mode" style="font-size:9px;padding:2px 6px;border-radius:3px;background:var(--bg-deepest);color:var(--text-muted)">Cut-off</div>
         </div>`;
    case 'mosfet_2n7000':
    case 'mosfet_n': case 'mosfet_p':
      return `<div class="flex flex-col gap-1.5 items-center">
           <div class="font-mono" style="font-size:9px;color:var(--text-secondary)">${comp.state.name}</div>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%">
             <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Vgs</span><span class="font-mono" id="${id}-vgs" style="font-size:9px">0.0V</span></div>
             <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Id</span><span class="font-mono text-rose" id="${id}-id" style="font-size:9px">0mA</span></div>
           </div>
           <div id="${id}-mode" style="font-size:9px;padding:2px 6px;border-radius:3px;background:var(--bg-deepest);color:var(--text-muted)">OFF</div>
         </div>`;
    case 'ne555':
      return `<div class="flex flex-col gap-1.5 items-center">
           <div class="font-mono" style="font-size:9px;color:var(--text-secondary)">NE555 TIMER IC</div>
           <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;width:100%">
             <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Output</span><span class="font-mono" id="${id}-out" style="font-size:10px">LOW</span></div>
             <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Cap V</span><span class="font-mono" id="${id}-cv" style="font-size:9px">0.0V</span></div>
           </div>
         </div>`;
    case 'lm741': case 'lm358':
      return `<div class="flex flex-col gap-1.5 items-center">
           <div class="font-mono" style="font-size:9px;color:var(--text-secondary)">${comp.state.name} OP-AMP</div>
           <div class="flex justify-between" style="width:100%"><span class="text-muted" style="font-size:9px">Vout</span><span class="font-mono text-teal" id="${id}-vout" style="font-size:11px">0.00 V</span></div>
           <div class="flex justify-between" style="width:100%"><span class="text-muted" style="font-size:9px">Mode</span><span class="font-mono" id="${id}-mode" style="font-size:9px;color:var(--text-muted)">—</span></div>
         </div>`;
    case 'lm7805':
      return `<div class="flex flex-col gap-1.5 items-center">
           <div class="font-mono" style="font-size:9px;color:var(--text-secondary)">LM7805 +5V REG</div>
           <div class="readout">5.00 V</div>
           <div style="font-size:9px;color:var(--text-muted)">Fixed output, 1A max</div>
         </div>`;
    case 'lm317':
      return `<div class="flex flex-col gap-2">
           <div class="font-mono" style="font-size:9px;color:var(--text-secondary)">LM317 ADJ REG</div>
           <div class="flex justify-between items-center"><span class="text-muted" style="font-size:9px">R2 (Ω)</span>
             <input type="number" id="${id}-r2" min="100" max="50000" value="2400" style="width:60px" onchange="updateLM317('${id}',this.value)">
           </div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Vout</span><span class="font-mono text-teal" id="${id}-vout" style="font-size:11px">${comp.state.vout.toFixed(2)} V</span></div>
         </div>`;
    case 'thermistor':
      return `<div class="flex flex-col gap-1.5">
           <div class="flex justify-between items-center"><span class="text-muted" style="font-size:9px">Temp (°C)</span>
             <input type="number" min="-40" max="125" value="25" id="${id}-temp" style="width:56px" oninput="updateThermistor('${id}',this.value)">
           </div>
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Resistance</span><span class="font-mono" id="${id}-r" style="font-size:10px">10.0 kΩ</span></div>
         </div>`;
    case 'ldr':
      return `<div class="flex flex-col gap-1.5">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Light</span><span class="font-mono text-amber" id="${id}-lp" style="font-size:10px">50%</span></div>
           <input type="range" class="amber" min="0" max="100" value="50" oninput="updateLDR('${id}',this.value)">
           <div class="flex justify-between"><span class="text-muted" style="font-size:9px">Resistance</span><span class="font-mono" id="${id}-r" style="font-size:10px">22.4 kΩ</span></div>
         </div>`;
    case 'spst_switch':
      return `<div class="flex flex-col items-center gap-2 py-1">
           <div style="font-size:9px;color:var(--text-muted)">SPST Contact Switch</div>
           <div class="switch-track" id="${id}-track" onclick="toggleSwitch('${id}')">
             <div class="switch-thumb" id="${id}-thumb"></div>
           </div>
           <div style="font-size:9px;color:var(--text-muted)" id="${id}-lbl">OPEN</div>
         </div>`;
    case 'pushbutton':
      return `<div class="flex flex-col items-center gap-2 py-1">
           <div style="font-size:9px;color:var(--text-muted)">Momentary NO Switch</div>
           <button id="${id}-pbtn"
             onmousedown="setPushbutton('${id}',true)" onmouseup="setPushbutton('${id}',false)"
             ontouchstart="setPushbutton('${id}',true);event.preventDefault()" ontouchend="setPushbutton('${id}',false)"
             class="btn btn-secondary w-full" style="font-size:11px;padding:8px">Press</button>
         </div>`;
    case 'seven_seg':
      return `<div class="flex flex-col items-center gap-2 py-1">
           <svg viewBox="0 0 60 80" style="width:60px;height:80px">
             <rect id="${id}-sa" x="10" y="3" width="40" height="6" rx="3" fill="#1a2030"/>
             <rect id="${id}-sb" x="52" y="10" width="6" height="28" rx="3" fill="#1a2030"/>
             <rect id="${id}-sc" x="52" y="42" width="6" height="28" rx="3" fill="#1a2030"/>
             <rect id="${id}-sd" x="10" y="71" width="40" height="6" rx="3" fill="#1a2030"/>
             <rect id="${id}-se" x="2" y="42" width="6" height="28" rx="3" fill="#1a2030"/>
             <rect id="${id}-sf" x="2" y="10" width="6" height="28" rx="3" fill="#1a2030"/>
             <rect id="${id}-sg" x="10" y="37" width="40" height="6" rx="3" fill="#1a2030"/>
           </svg>
           <div style="font-size:9px;color:var(--text-muted)">Segments driven by voltage</div>
         </div>`;
    case 'buzzer':
      return `<div class="flex flex-col items-center gap-2 py-1">
           <div style="font-size:30px" id="${id}-icon">🔕</div>
           <div style="font-size:9px;color:var(--text-muted)" id="${id}-status">Silent</div>
         </div>`;
    case 'speaker':
      return `<div class="flex flex-col items-center gap-2 py-1">
           <div style="font-size:28px" id="${id}-icon">🔈</div>
           <div style="font-size:9px;color:var(--text-muted)" id="${id}-status">Silent</div>
         </div>`;
    case 'multimeter':
      return `<div class="flex flex-col gap-2">
           <div class="dmm-screen">
             <div class="dmm-value" id="${id}-display">0.00</div>
             <div class="dmm-unit" id="${id}-unit">V</div>
           </div>
           <div style="display:flex;gap:4px;justify-content:center">
             <button id="${id}-mode-v" class="btn btn-secondary" style="font-size:9px;padding:3px 8px;border-color:#166534" onclick="setMMMode('${id}','voltage')">V</button>
             <button id="${id}-mode-a" class="btn btn-secondary" style="font-size:9px;padding:3px 8px" onclick="setMMMode('${id}','current')">mA</button>
             <button id="${id}-mode-r" class="btn btn-secondary" style="font-size:9px;padding:3px 8px" onclick="setMMMode('${id}','resistance')">Ω</button>
           </div>
         </div>`;
    case 'oscilloscope':
      return `<div class="flex flex-col gap-1.5">
           <canvas class="scope-canvas" id="${id}-canvas" width="176" height="50"></canvas>
           <div style="display:flex;gap:8px;font-size:9px">
             <span style="color:#22c55e">● CH1</span>
             <span style="color:#f59e0b">● CH2</span>
             <span class="text-muted" style="margin-left:auto" id="${id}-freq">0.0 Hz</span>
           </div>
           <div style="display:flex;gap:4px">
             <span class="text-muted" style="font-size:9px">Time/div</span>
             <select id="${id}-tb" onchange="updateScopeTimebase('${id}',this.value)" style="font-size:9px;padding:1px 4px">
               <option value="0.1">100ms</option>
               <option value="0.5" selected>500ms</option>
               <option value="1.0">1s</option>
               <option value="2.0">2s</option>
             </select>
           </div>
         </div>`;
    default:
      return `<div class="text-muted" style="font-size:9px;text-align:center;padding:8px 0">${comp.type}</div>`;
  }
}

// ─── ADD COMPONENT ─────────────────────────────────────────────────────────────
function addComponent(type, customX, customY) {
  const id = type + '_' + Math.random().toString(36).substr(2, 9);
  const rect = workspace.getBoundingClientRect();
  const x = customX !== null && customX !== undefined ? customX : Math.max(10, (rect.width / 2) - 96);
  const y = customY !== null && customY !== undefined ? customY : Math.max(10, (rect.height / 2) - 80);
  const { terminals, state } = buildComponent(type, id, components);
  const comp = { id, type, x, y, terminals, state };
  components.push(comp);
  renderComponent(comp);
  updateResistorBandsForComp(comp);
  updateWires();
  return comp;
}

function addAndFocusComponent(type) {
  const rect = workspace.getBoundingClientRect();
  const spawnX = Math.max(10, (rect.width / 2) - 96);
  const spawnY = Math.max(10, (rect.height / 2) - 80);
  addComponent(type, spawnX, spawnY);
  if (window.innerWidth < 768) switchMobileTab('workspace');
  showToast(`Added ${type.replace(/_/g, ' ')}`, 'success');
}

// ─── RENDER COMPONENT ──────────────────────────────────────────────────────────
function renderComponent(comp) {
  const div = document.createElement('div');
  div.id = comp.id;
  div.className = 'comp-card';
  div.dataset.type = comp.type;
  div.style.left = comp.x + 'px';
  div.style.top = comp.y + 'px';

  const headerColors = {
    usb_power: 'border-bottom-color:#1e1b4b',
    bench_psu: 'border-bottom-color:#2d0f17',
    battery_9v: 'border-bottom-color:#0f3030', battery_aa: 'border-bottom-color:#0f3030',
    battery_cr2032: 'border-bottom-color:#0f3030', battery_lipo: 'border-bottom-color:#0f3030',
    battery_lead: 'border-bottom-color:#0f3030', diy_cell: 'border-bottom-color:#0f3030',
    solar_panel: 'border-bottom-color:#3d2900',
    signal_generator: 'border-bottom-color:#2a1a4a',
    multimeter: 'border-bottom-color:#0a2a18',
    oscilloscope: 'border-bottom-color:#0a2a18',
    npn_transistor: 'border-bottom-color:#2d0f17', pnp_transistor: 'border-bottom-color:#2d0f17',
    mosfet_n: 'border-bottom-color:#0d1a3d', mosfet_p: 'border-bottom-color:#0d1a3d',
  };

  div.innerHTML = `
       <div class="comp-header" style="${headerColors[comp.type] || ''}"
            onmousedown="startDrag(event,'${comp.id}')"
            ontouchstart="startDrag(event,'${comp.id}')">
         <span class="comp-title">${getComponentTitle(comp)}</span>
         <button class="comp-remove-btn" onclick="removeComponent('${comp.id}')">✕</button>
       </div>
       <div class="comp-body">${buildCardBody(comp)}</div>
     `;

  // Add terminals
  comp.terminals.forEach(term => {
    const tDiv = document.createElement('div');
    tDiv.id = term.id;
    tDiv.className = 'term-node';
    tDiv.dataset.termId = term.id;
    tDiv.dataset.compId = comp.id;
    tDiv.innerText = term.label;
    tDiv.style.left = (term.relX - 11) + 'px';
    tDiv.style.top = (term.relY - 11) + 'px';
    tDiv.addEventListener('mousedown', e => startWire(e, term.id));
    tDiv.addEventListener('touchstart', e => { startWire(e, term.id); }, { passive: false });
    div.appendChild(tDiv);
  });

  // Long-press context menu on card body
  div.addEventListener('touchstart', e => startLongPress(e, comp.id, 'component'), { passive: true });
  div.addEventListener('touchend', cancelLongPress);
  div.addEventListener('touchmove', cancelLongPress, { passive: true });
  div.addEventListener('contextmenu', e => { e.preventDefault(); showComponentContextMenu(e, comp.id); });

  container.appendChild(div);
  updateResistorBandsForComp(comp);
}

// ─── COMPONENT-SPECIFIC UPDATE HELPERS ────────────────────────────────────────
function formatResistance(r) {
  if (r >= 1e6) return (r / 1e6).toFixed(1) + 'MΩ';
  if (r >= 1000) return (r / 1000).toFixed(1) + 'kΩ';
  return r + 'Ω';
}

function updateBenchPSU(id, field, val) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  if (field === 'v') { comp.state.voltage = parseFloat(val) || 0; const el = document.getElementById(`${id}-readout`); if (el) el.innerText = comp.state.voltage.toFixed(2) + ' V'; }
  if (field === 'i') comp.state.currentLimit = parseFloat(val) || 0;
}

function updateSolarPanel(id, val) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.sunlight = parseInt(val);
  comp.state.voltage = 12.0 * (comp.state.sunlight / 100);
  const s = document.getElementById(`${id}-sun`); if (s) s.innerText = comp.state.sunlight + '%';
  const o = document.getElementById(`${id}-out`); if (o) o.innerText = comp.state.voltage.toFixed(2) + ' V';
}

function setSigWave(id, wave) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.waveform = wave;
  ['sine', 'square', 'saw'].forEach(w => {
    const btn = document.getElementById(`${id}-wave-${w}`);
    if (btn) btn.style.borderColor = (w === wave) ? 'var(--teal)' : '';
  });
}

function updateSigGen(id, val) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.frequency = parseFloat(val) || 0.5;
}

function updateSigAmp(id, val) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.amplitude = parseFloat(val) || 2.0;
}

function updateResistorVal(id, val) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  let r = parseInt(val); if (isNaN(r) || r < 1) r = 1; if (r > 10e6) r = 10e6;
  comp.state.resistance = r;
  const inp = document.getElementById(`${id}-rval`); if (inp) inp.value = r;
  updateResistorBandsForComp(comp);
}

function updateResistorBandsForComp(comp) {
  if (!comp.type.startsWith('resistor') && comp.type !== 'pot') return;
  const colors = ['#000', '#78350f', '#dc2626', '#ea580c', '#eab308', '#16a34a', '#2563eb', '#9333ea', '#4b5563', '#fff'];
  const r = comp.state.resistance;
  const s = r.toString();
  const d1 = parseInt(s[0]) || 0, d2 = parseInt(s[1]) || 0, mult = Math.max(0, s.length - 2);
  const c1 = colors[d1] || '#000', c2 = colors[d2] || '#000', c3 = colors[mult] || '#000';
  const b1 = document.getElementById(`${comp.id}-b1`), b2 = document.getElementById(`${comp.id}-b2`), b3 = document.getElementById(`${comp.id}-b3`);
  if (b1) b1.style.background = c1; if (b2) b2.style.background = c2; if (b3) b3.style.background = c3;
}

function updatePot(id, val) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.wiper = parseInt(val) / 100;
  const aw = Math.round(comp.state.resistance * comp.state.wiper);
  const wb = comp.state.resistance - aw;
  const p = document.getElementById(`${id}-wiper-pct`); if (p) p.innerText = val + '%';
  const raw = document.getElementById(`${id}-raw`); if (raw) raw.innerText = formatResistance(aw);
  const rwb = document.getElementById(`${id}-rwb`); if (rwb) rwb.innerText = formatResistance(wb);
}

function setMMMode(id, mode) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.mode = mode;
  ['voltage', 'current', 'resistance'].forEach(m => {
    const btn = document.getElementById(`${id}-mode-${m === 'voltage' ? 'v' : m === 'current' ? 'a' : 'r'}`);
    if (btn) btn.style.borderColor = (m === mode) ? '#166534' : '';
  });
  const unit = document.getElementById(`${id}-unit`);
  if (unit) unit.innerText = { voltage: 'V', current: 'mA', resistance: 'Ω' }[mode];
}

function toggleSwitch(id) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.closed = !comp.state.closed;
  const track = document.getElementById(`${id}-track`);
  const lbl = document.getElementById(`${id}-lbl`);
  if (track) track.classList.toggle('on', comp.state.closed);
  if (lbl) lbl.innerText = comp.state.closed ? 'CLOSED (ON)' : 'OPEN (OFF)';
}

function setPushbutton(id, pressed) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.pressed = pressed;
  const btn = document.getElementById(`${id}-pbtn`);
  if (btn) { btn.style.background = pressed ? 'rgba(0,229,200,0.2)' : ''; btn.style.borderColor = pressed ? 'var(--teal)' : ''; }
}

function toggleDip(id, num) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state['sw' + num] = !comp.state['sw' + num];
  const thumb = document.getElementById(`${id}-th${num}`);
  if (thumb) thumb.style.transform = `translateY(${comp.state['sw' + num] ? 0 : 20}px)`;
}

function toggleSlide(id) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.pos = comp.state.pos === 1 ? 2 : 1;
  const thumb = document.getElementById(`${id}-thumb`);
  if (thumb) thumb.style.transform = `translateX(${comp.state.pos === 1 ? 0 : 20}px)`;
}



function resetBlownLed(id) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.blown = false;
  const r = document.getElementById(`${id}-reset`); if (r) r.classList.add('hidden');
  const s = document.getElementById(`${id}-status`); if (s) { s.innerText = 'Off'; s.style.color = ''; }
}

function updateThermistor(id, val) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.temp = parseFloat(val) || 25;
  const T = comp.state.temp + 273.15;
  const T0 = 298.15;
  const R = comp.state.r25 * Math.exp(comp.state.b * (1 / T - 1 / T0));
  comp.state.resistance = R;
  const el = document.getElementById(`${id}-r`); if (el) el.innerText = formatResistance(Math.round(R));
}

function updateLDR(id, val) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.lightPct = parseInt(val);
  const lux = Math.pow(10, (comp.state.lightPct / 100) * 5); // 1–100000 lux
  const R = 5000 * Math.pow(lux, -0.7);
  comp.state.resistance = R;
  const lp = document.getElementById(`${id}-lp`); if (lp) lp.innerText = val + '%';
  const r = document.getElementById(`${id}-r`); if (r) r.innerText = formatResistance(Math.round(R));
}

function updateLM317(id, val) {
  const comp = components.find(c => c.id === id);
  if (!comp) return;
  comp.state.r2 = parseInt(val) || 2400;
  comp.state.vout = 1.25 * (1 + comp.state.r2 / comp.state.r1);
  const el = document.getElementById(`${id}-vout`); if (el) el.innerText = comp.state.vout.toFixed(2) + ' V';
}

function updateScopeTimebase(id, val) {
  const comp = components.find(c => c.id === id);
  if (comp) comp.state.timebase = parseFloat(val);
}

// ─── REMOVE COMPONENT ─────────────────────────────────────────────────────────
function removeComponent(id) {
  components = components.filter(c => c.id !== id);
  wires = wires.filter(w => !w.from.startsWith(id) && !w.to.startsWith(id));
  const el = document.getElementById(id); if (el) el.remove();
  delete oscData[id];
  updateWires();
  showToast('Component removed', 'info');
}

// ─── DRAG ──────────────────────────────────────────────────────────────────────
function getPointerCoords(e) {
  const rect = workspace.getBoundingClientRect();
  const src = (e.touches && e.touches.length > 0) ? e.touches[0] :
    (e.changedTouches && e.changedTouches.length > 0) ? e.changedTouches[0] : e;
  const rx = src.clientX - rect.left;
  const ry = src.clientY - rect.top;
  const x = (rx - transformState.x) / transformState.scale;
  const y = (ry - transformState.y) / transformState.scale;
  return { x, y, clientX: src.clientX, clientY: src.clientY };
}

function startDrag(e, compId) {
  if (e.target.tagName.toLowerCase() === 'button' ||
    e.target.tagName.toLowerCase() === 'input' ||
    e.target.tagName.toLowerCase() === 'select' ||
    e.target.tagName.toLowerCase() === 'canvas') return;
  const comp = components.find(c => c.id === compId);
  if (!comp) return;
  isDragging = false;
  const rect = workspace.getBoundingClientRect();
  const coords = getPointerCoords(e);
  draggedComponent = comp;
  dragOffset.x = coords.clientX - (comp.x * transformState.scale + transformState.x + rect.left);
  dragOffset.y = coords.clientY - (comp.y * transformState.scale + transformState.y + rect.top);
  document.addEventListener('mousemove', handleDrag);
  document.addEventListener('touchmove', handleDrag, { passive: false });
  document.addEventListener('mouseup', endDrag);
  document.addEventListener('touchend', endDrag);
}

function handleDrag(e) {
  if (!draggedComponent) return;
  e.preventDefault();
  isDragging = true;
  const rect = workspace.getBoundingClientRect();
  const coords = getPointerCoords(e);
  let nx = (coords.clientX - dragOffset.x - rect.left - transformState.x) / transformState.scale;
  let ny = (coords.clientY - dragOffset.y - rect.top - transformState.y) / transformState.scale;
  draggedComponent.x = nx;
  draggedComponent.y = ny;
  const el = document.getElementById(draggedComponent.id);
  if (el) { el.style.left = nx + 'px'; el.style.top = ny + 'px'; }
  updateWires();
}

function endDrag() {
  draggedComponent = null;
  isDragging = false;
  document.removeEventListener('mousemove', handleDrag);
  document.removeEventListener('touchmove', handleDrag);
  document.removeEventListener('mouseup', endDrag);
  document.removeEventListener('touchend', endDrag);
}

// ─── WIRING ───────────────────────────────────────────────────────────────────
function startWire(e, termId) {
  if (isDragging) return;
  e.stopPropagation();
  e.preventDefault();
  // Cancel any active wire if clicking same terminal
  if (activeWireStart === termId) { activeWireStart = null; updateWires(); return; }
  activeWireStart = termId;
  const coords = getPointerCoords(e);
  mousePosition.x = coords.x;
  mousePosition.y = coords.y;
  showToast('Drag to another terminal to connect', 'info');
  updateWires();
}

function handlePointerMove(e) {
  if (activeWireStart) {
    e.preventDefault();
    const coords = getPointerCoords(e);
    mousePosition.x = coords.x;
    mousePosition.y = coords.y;
    updateWires();
  }
}

function handlePointerUp(e) {
  if (!activeWireStart) return;
  const coords = getPointerCoords(e);
  const el = document.elementFromPoint(coords.clientX, coords.clientY);
  if (el && el.dataset && el.dataset.termId && el.dataset.termId !== activeWireStart) {
    const termId = el.dataset.termId;
    const wireExists = wires.some(w => (w.from === activeWireStart && w.to === termId) || (w.from === termId && w.to === activeWireStart));
    if (!wireExists) {
      wires.push({ from: activeWireStart, to: termId, color: selectedWireColor });
      showToast('Wire connected ✓', 'success');
    }
  }
  activeWireStart = null;
  updateWires();
}

function updateWires() {
  wireLayer.innerHTML = '';
  const rect = workspace.getBoundingClientRect();

  wires.forEach((wire, index) => {
    const termFrom = getTerminalObj(wire.from);
    const compFrom = components.find(c => c.terminals.some(t => t.id === wire.from));
    const termTo = getTerminalObj(wire.to);
    const compTo = components.find(c => c.terminals.some(t => t.id === wire.to));

    if (!compFrom || !compTo || !termFrom || !termTo) return;

    const x1 = compFrom.x + termFrom.relX;
    const y1 = compFrom.y + termFrom.relY;
    const x2 = compTo.x + termTo.relX;
    const y2 = compTo.y + termTo.relY;

    const termData = getTerminalObj(wire.from);
    let strokeColor = wire.color || '#64748b';
    if (termData && wire.color === '#ef4444') {
      if (termData.voltage > 4.5) strokeColor = '#ef4444';
      else if (termData.voltage <= 0.05) strokeColor = '#3b82f6';
      else if (termData.voltage > 1.5) strokeColor = '#f97316';
    }

    const dx = x2 - x1, dy = y2 - y1;
    const ctrl = Math.min(Math.abs(dx) * 0.5, 80);
    const d = `M${x1} ${y1} C${x1 + ctrl} ${y1},${x2 - ctrl} ${y2},${x2} ${y2}`;

    // Shadow path
    const shadow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    shadow.setAttribute('d', d);
    shadow.setAttribute('stroke', 'rgba(0,0,0,0.4)');
    shadow.setAttribute('stroke-width', '6');
    shadow.setAttribute('fill', 'none');
    shadow.setAttribute('stroke-linecap', 'round');
    wireLayer.appendChild(shadow);

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.setAttribute('stroke', strokeColor);
    path.setAttribute('stroke-width', '3.5');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.style.pointerEvents = 'none';

    const hitPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hitPath.setAttribute('d', d);
    hitPath.setAttribute('stroke', 'transparent');
    hitPath.setAttribute('stroke-width', '30');
    hitPath.setAttribute('fill', 'none');
    hitPath.setAttribute('stroke-linecap', 'round');
    hitPath.style.cursor = 'pointer';
    hitPath.style.pointerEvents = 'stroke';

    // Animate if current flowing
    if (termData && Math.abs(termData.voltage) > 0.1) {
      path.classList.add('wire-animated');
    }

    // Desktop right-click to disconnect
    hitPath.addEventListener('contextmenu', e => {
      e.preventDefault();
      showWireContextMenu(e, index);
    });

    // Mobile long-press on wire
    let wireLpTimer = null;
    hitPath.addEventListener('touchstart', e => {
      wireLpTimer = setTimeout(() => {
        wireLpTimer = null;
        const touch = e.touches[0];
        showWireContextMenu({ clientX: touch.clientX, clientY: touch.clientY }, index);
      }, 500);
    }, { passive: true });
    hitPath.addEventListener('touchend', () => { if (wireLpTimer) { clearTimeout(wireLpTimer); wireLpTimer = null; } });
    hitPath.addEventListener('touchmove', () => { if (wireLpTimer) { clearTimeout(wireLpTimer); wireLpTimer = null; } }, { passive: true });

    wireLayer.appendChild(path);
    wireLayer.appendChild(hitPath);
  });

  // Draw active wire preview
  if (activeWireStart) {
    const termFrom = getTerminalObj(activeWireStart);
    const compFrom = components.find(c => c.terminals.some(t => t.id === activeWireStart));
    if (compFrom && termFrom) {
      const x1 = compFrom.x + termFrom.relX;
      const y1 = compFrom.y + termFrom.relY;
      const x2 = mousePosition.x, y2 = mousePosition.y;
      const ctrl = Math.min(Math.abs(x2 - x1) * 0.5, 80);
      const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      preview.setAttribute('d', `M${x1} ${y1} C${x1 + ctrl} ${y1},${x2 - ctrl} ${y2},${x2} ${y2}`);
      preview.setAttribute('stroke', selectedWireColor);
      preview.setAttribute('stroke-width', '3');
      preview.setAttribute('stroke-dasharray', '6,4');
      preview.setAttribute('fill', 'none');
      preview.setAttribute('stroke-linecap', 'round');
      preview.setAttribute('opacity', '0.7');
      wireLayer.appendChild(preview);
    }
  }

  // Mark connected terminals
  const connectedTerms = new Set();
  wires.forEach(w => { connectedTerms.add(w.from); connectedTerms.add(w.to); });
  connectedTerms.forEach(tid => {
    const el = document.getElementById(tid);
    if (el) el.classList.add('connected');
  });
}

function getTerminalObj(tId) {
  for (let c of components) {
    const t = c.terminals.find(t => t.id === tId);
    if (t) return t;
  }
  return null;
}

function disconnectWire(index) {
  wires.splice(index, 1);
  updateWires();
  showToast('Wire disconnected', 'warn');
}

function disconnectAllWiresFromComponent(id) {
  wires = wires.filter(w => !w.from.startsWith(id) && !w.to.startsWith(id));
  updateWires();
  showToast('All wires disconnected', 'warn');
}

// ─── CONTEXT MENUS ────────────────────────────────────────────────────────────
function closeContextMenu() {
  if (activeCtxMenu) { activeCtxMenu.remove(); activeCtxMenu = null; }
}

function createContextMenu(x, y, items) {
  closeContextMenu();
  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.left = Math.min(x, window.innerWidth - 180) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 200) + 'px';
  items.forEach(item => {
    if (item === 'sep') {
      const sep = document.createElement('div'); sep.className = 'ctx-menu-sep'; menu.appendChild(sep);
    } else {
      const btn = document.createElement('button');
      btn.className = 'ctx-menu-item' + (item.danger ? ' danger' : '');
      btn.innerHTML = `<span>${item.icon || ''}</span><span>${item.label}</span>`;
      btn.onclick = () => { closeContextMenu(); item.action(); };
      menu.appendChild(btn);
    }
  });
  document.body.appendChild(menu);
  activeCtxMenu = menu;
  setTimeout(() => document.addEventListener('click', closeContextMenu, { once: true }), 0);
}

function showWireContextMenu(e, wireIdx) {
  const x = e.clientX || (e.touches && e.touches[0].clientX) || 100;
  const y = e.clientY || (e.touches && e.touches[0].clientY) || 100;
  createContextMenu(x, y, [
    { icon: '✂️', label: 'Disconnect wire', danger: true, action: () => disconnectWire(wireIdx) },
    { icon: '🎨', label: 'Change wire color…', action: () => showWireColorPicker(wireIdx) },
  ]);
}

function showComponentContextMenu(e, compId) {
  const x = e.clientX || (e.touches && e.touches[0].clientX) || 100;
  const y = e.clientY || (e.touches && e.touches[0].clientY) || 100;
  createContextMenu(x, y, [
    { icon: '✂️', label: 'Disconnect all wires', action: () => disconnectAllWiresFromComponent(compId) },
    'sep',
    { icon: '🗑️', label: 'Delete component', danger: true, action: () => removeComponent(compId) },
  ]);
}

function showWireColorPicker(wireIdx) {
  const wire = wires[wireIdx];
  if (!wire) return;
  // Quick color cycle
  const colors = WIRE_COLORS.map(c => c.hex);
  const current = colors.indexOf(wire.color);
  wire.color = colors[(current + 1) % colors.length];
  updateWires();
}

// ─── LONG PRESS ───────────────────────────────────────────────────────────────
function startLongPress(e, targetId, type) {
  cancelLongPress();
  longPressTarget = { id: targetId, type };
  longPressTimer = setTimeout(() => {
    longPressTimer = null;
    if (type === 'component') {
      const touch = e.touches && e.touches[0];
      showComponentContextMenu({ clientX: touch.clientX, clientY: touch.clientY }, targetId);
      if (navigator.vibrate) navigator.vibrate(50);
    }
  }, 500);
}

function cancelLongPress() {
  if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  longPressTarget = null;
}

// ─── TOAST NOTIFICATIONS ──────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerText = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}

// ─── MOBILE TAB SWITCHING ─────────────────────────────────────────────────────
function switchMobileTab(tab) {
  currentMobileTab = tab;
  ['workspace', 'parts', 'guide'].forEach(t => {
    const tab_btn = document.getElementById('tab-' + t);
    const panel = t === 'workspace' ? document.getElementById('workspace') :
      t === 'parts' ? document.getElementById('panel-parts') :
        document.getElementById('panel-guide');
    if (!panel || !tab_btn) return;
    panel.classList.remove('mobile-visible');
    tab_btn.classList.remove('active');
  });
  const activePanel = tab === 'workspace' ? document.getElementById('workspace') :
    tab === 'parts' ? document.getElementById('panel-parts') :
      document.getElementById('panel-guide');
  const activeBtn = document.getElementById('tab-' + tab);
  if (activePanel) activePanel.classList.add('mobile-visible');
  if (activeBtn) activeBtn.classList.add('active');
  if (tab === 'workspace') setTimeout(updateWires, 50);
}

// ─── TUTORIAL GUIDE ───────────────────────────────────────────────────────────
const tutorialGuides = {
  lead_acid: {
    title: "4.0V DIY Epsom-Salt Battery",
    steps: [
      { id: 'step-1', title: "Step 1: Placement", desc: "Place 1× USB Power Supply and 2× DIY Epsom-Salt Cells onto the workspace." },
      { id: 'step-2', title: "Step 2: Series Connection", desc: "Connect Cell 1 (+) to Cell 2 (−) to build a 2-cell series battery." },
      { id: 'step-3', title: "Step 3: Protection Resistor", desc: "Add a Resistor and set it to 81Ω to limit forming current." },
      { id: 'step-4', title: "Step 4: Forming Charge", desc: "Connect USB 5V → Resistor A, Resistor B → Cell 2 (+), USB GND → Cell 1 (−). Wait for 100% forming." },
      { id: 'step-5', title: "Step 5: Load Test", desc: "Disconnect charger. Set Resistor to 330Ω, add LED. Connect Cell 2 (+) → Resistor A → LED (+) → LED (−) → Cell 1 (−)." },
    ],
    liveMetrics: () => {
      const cells = components.filter(c => c.type === 'diy_cell');
      if (!cells.length) return '<div class="metric-row">No cells on workspace.</div>';
      return cells.map(c => `
           <div style="border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:6px">
             <div class="metric-row" style="font-weight:600;color:var(--text-primary)">${c.state.name}</div>
             <div class="metric-row"><span>Forming</span><span class="metric-val" style="color:var(--amber)">${Math.round(c.state.forming)}%</span></div>
             <div class="metric-row"><span>Charge</span><span class="metric-val text-teal">${Math.round(c.state.charge)}%</span></div>
             <div class="metric-row"><span>EMF</span><span class="metric-val">${(c.state.voltage || 0).toFixed(2)} V</span></div>
             <div class="metric-row"><span>Current</span><span class="metric-val">${((c.state.current || 0) * 1000).toFixed(1)} mA</span></div>
           </div>`).join('');
    }
  },
  solar_charge: {
    title: "12V Solar Charging Regulator",
    steps: [
      { id: 'step-1', title: "Step 1: Place Components", desc: "Add 1× 12V Solar Panel, 1× Capacitor, 1× SPST Switch." },
      { id: 'step-2', title: "Step 2: Wire Circuit", desc: "Solar (+) → Switch In, Switch Out → Cap (+), Solar (−) → Cap (−)." },
      { id: 'step-3', title: "Step 3: Max Sunlight", desc: "Drag the Sunlight slider to 100% → 12.0V output." },
      { id: 'step-4', title: "Step 4: Close Switch", desc: "Tap the SPST switch ON. Watch capacitor charge to 12V." },
    ],
    liveMetrics: () => {
      const caps = components.filter(c => ['capacitor', 'cap_100n', 'cap_10u'].includes(c.type));
      const solar = components.find(c => c.type === 'solar_panel');
      let html = '';
      if (solar) html += `<div class="metric-row"><span>Solar Voltage</span><span class="metric-val">${solar.state.voltage.toFixed(2)} V</span></div>`;
      caps.forEach(cap => {
        html += `<div class="metric-row"><span>Cap Stored V</span><span class="metric-val text-sky">${(cap.state.storedVoltage || 0).toFixed(2)} V</span></div>`;
      });
      return html || '<div class="metric-row" style="color:var(--text-muted)">No capacitors present.</div>';
    }
  },
  class_a_amp: {
    title: "Class-A Common-Emitter Amplifier",
    steps: [
      { id: 'step-1', title: "Step 1: Place Parts", desc: "Add Signal Generator, NPN Transistor, 2× Resistors, Multimeter." },
      { id: 'step-2', title: "Step 2: Pull-Up Network", desc: "USB 5V → R1-A, R1-B → Transistor C. Emitter (E) → USB GND." },
      { id: 'step-3', title: "Step 3: Signal Input", desc: "Signal Gen (+) → Base (B). Signal Gen (−) → USB GND." },
      { id: 'step-4', title: "Step 4: Measure Output", desc: "DMM Red → Collector (C). DMM Black → GND. Set DMM to V." },
      { id: 'step-5', title: "Step 5: Observe Gain", desc: "Set R1 to 1kΩ. Collector swings inverse to Base — signal inversion!" },
    ],
    liveMetrics: () => {
      const npn = components.find(c => c.type === 'npn_transistor');
      const gen = components.find(c => c.type === 'signal_generator');
      let html = '';
      if (gen) html += `<div class="metric-row"><span>Signal In</span><span class="metric-val" style="color:var(--purple)">${(gen.state.outputVoltage || 0).toFixed(2)} V</span></div>`;
      if (npn) {
        const vB = npn.terminals.find(t => t.label === 'B')?.voltage || 0;
        const vC = npn.terminals.find(t => t.label === 'C')?.voltage || 0;
        const vE = npn.terminals.find(t => t.label === 'E')?.voltage || 0;
        html += `<div class="metric-row"><span>Vb (Base)</span><span class="metric-val">${vB.toFixed(2)} V</span></div>`;
        html += `<div class="metric-row"><span>Vc (Collector)</span><span class="metric-val text-rose">${vC.toFixed(2)} V</span></div>`;
        html += `<div class="metric-row"><span>Ve (Emitter)</span><span class="metric-val">${vE.toFixed(2)} V</span></div>`;
        html += `<div class="metric-row"><span>Ib</span><span class="metric-val">${((npn.state.current_b || 0) * 1e6).toFixed(1)} µA</span></div>`;
      } else html += '<div class="metric-row" style="color:var(--text-muted)">No NPN detected.</div>';
      return html;
    }
  },
  voltage_divider: {
    title: "Voltage Divider + LED",
    steps: [
      { id: 'step-1', title: "Step 1: Place Parts", desc: "Add USB 5V Supply, 2× Resistors, 1× LED Red." },
      { id: 'step-2', title: "Step 2: Divider", desc: "USB 5V → R1-A, R1-B → R2-A, R2-B → GND." },
      { id: 'step-3', title: "Step 3: Set Values", desc: "Set R1=220Ω. The midpoint (R1-B/R2-A) ≈ 2.5V." },
      { id: 'step-4', title: "Step 4: Light the LED", desc: "R1-B → LED Anode (+), LED Cathode (−) → R2-A." },
    ],
    liveMetrics: () => {
      const rs = components.filter(c => c.type.startsWith('resistor'));
      const leds = components.filter(c => c.type.startsWith('led'));
      let html = '';
      rs.forEach((r, i) => { html += `<div class="metric-row"><span>R${i + 1}</span><span class="metric-val">${formatResistance(r.state.resistance)}</span></div>`; });
      leds.forEach(l => { html += `<div class="metric-row"><span>${l.state.name}</span><span class="metric-val">${((l.state.current || 0) * 1000).toFixed(1)} mA</span></div>`; });
      return html || '<div class="metric-row" style="color:var(--text-muted)">No components.</div>';
    }
  },
  custom: {
    title: "Custom Sandbox (Free Play)",
    steps: [
      { id: 'step-1', title: "Sandbox Active", desc: "Build any circuit you like! Active connections and loops will print out live analytics down below." }
    ],
    liveMetrics: () => getCustomCircuitMetrics()
  }
};

function getCustomCircuitMetrics() {
  let html = '';
  const sources = components.filter(c => ['usb_power', 'bench_psu', 'battery_9v', 'battery_aa', 'battery_cr2032', 'battery_lipo', 'battery_lead', 'battery_18650', 'battery_aaa', 'battery_d', 'diy_cell'].includes(c.type));
  const loads = components.filter(c => c.type.startsWith('resistor') || c.type.startsWith('led'));

  if (!components.length) {
    return '<div class="metric-row" style="color:var(--text-muted)">No components on workspace.</div>';
  }

  sources.forEach(src => {
    const posTerm = src.terminals.find(t => t.label === '+' || t.label === '5V' || t.label === 'Vcc');
    const negTerm = src.terminals.find(t => t.label === '-' || t.label === 'GND');
    if (posTerm && negTerm) {
      const vDiff = Math.abs(posTerm.voltage - negTerm.voltage);
      html += `<div class="metric-row"><span style="color:var(--teal)">● ${getComponentTitle(src)}</span><span class="metric-val">${vDiff.toFixed(2)} V</span></div>`;
    }
  });

  loads.forEach(load => {
    const termA = load.terminals[0];
    const termB = load.terminals[1];
    if (termA && termB) {
      const vDiff = Math.abs(termA.voltage - termB.voltage);
      if (vDiff > 0.01) {
        if (load.type.startsWith('resistor')) {
          const cur = vDiff / load.state.resistance;
          html += `<div class="metric-row"><span>R (${formatResistance(load.state.resistance)})</span><span class="metric-val text-amber">${(cur * 1000).toFixed(1)} mA</span></div>`;
        } else if (load.type.startsWith('led') && !load.state.blown) {
          html += `<div class="metric-row"><span>${load.state.name} Current</span><span class="metric-val text-emerald">${((load.state.current || 0) * 1000).toFixed(1)} mA</span></div>`;
        }
      }
    }
  });

  return html || '<div class="metric-row" style="color:var(--text-secondary)">Build a closed loop to monitor paths.</div>';
}

function switchTutorial(key) {
  currentTutorial = key;
  const config = tutorialGuides[key];
  if (!config) return;
  const tracker = document.getElementById('step-tracker');
  if (tracker) {
    tracker.innerHTML = config.steps.map(s => `
         <div id="${s.id}" class="tutorial-step locked">
           <div class="step-header">
             <span class="step-title">${s.title}</span>
             <span class="status-badge step-badge locked">Locked</span>
           </div>
           <p class="step-desc">${s.desc}</p>
         </div>`).join('');
  }
  // Reset workspace
  components = []; wires = []; container.innerHTML = ''; lastVoltages = [];
  const ww = workspace ? workspace.clientWidth : window.innerWidth;
  const sx = ww < 768 ? 20 : 60;
  if (key === 'lead_acid') {
    addComponent('usb_power', sx, 40);
    addComponent('diy_cell', sx, 175);
    addComponent('diy_cell', sx, 325);
  } else if (key === 'solar_charge') {
    addComponent('solar_panel', sx, 40);
    addComponent('capacitor', sx, 185);
    addComponent('spst_switch', sx, 330);
  } else if (key === 'class_a_amp') {
    addComponent('usb_power', sx, 40);
    addComponent('signal_generator', sx, 175);
    addComponent('npn_transistor', sx, 315);
  } else if (key === 'voltage_divider') {
    addComponent('usb_power', sx, 40);
    addComponent('resistor_1k', sx, 175);
    addComponent('resistor_100', sx, 320);
  }
  updateWires();
}

function updateStepStyle(id, passed, locked = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('locked', 'in-progress', 'completed');
  const badge = el.querySelector('.step-badge');
  if (locked) {
    el.classList.add('locked');
    if (badge) { badge.textContent = 'Locked'; badge.className = 'status-badge step-badge locked'; }
    return;
  }
  if (passed) {
    el.classList.add('completed');
    if (badge) { badge.textContent = '✓ Done'; badge.className = 'status-badge step-badge completed'; }
  } else {
    el.classList.add('in-progress');
    if (badge) { badge.textContent = 'In Progress'; badge.className = 'status-badge step-badge in-progress'; }
  }
}

function evaluateActiveTutorial(nodeMap) {
  const steps = tutorialGuides[currentTutorial].steps;
  if (currentTutorial === 'lead_acid') {
    const cells = components.filter(c => c.type === 'diy_cell');
    const pwr = components.find(c => c.type === 'usb_power');
    const resistors = components.filter(c => c.type.startsWith('resistor'));
    const leds = components.filter(c => c.type.startsWith('led'));
    const s1 = cells.length >= 2 && !!pwr;
    updateStepStyle('step-1', s1);
    if (!s1) { ['step-2', 'step-3', 'step-4', 'step-5'].forEach(s => updateStepStyle(s, false, true)); return; }
    let series = false;
    if (cells.length >= 2) {
      const c1p = nodeMap[cells[0].terminals.find(t => t.label === '+')?.id], c1n = nodeMap[cells[0].terminals.find(t => t.label === '-')?.id];
      const c2p = nodeMap[cells[1].terminals.find(t => t.label === '+')?.id], c2n = nodeMap[cells[1].terminals.find(t => t.label === '-')?.id];
      if ((c1n === c2p && c1n !== undefined) || (c2n === c1p && c2n !== undefined)) series = true;
    }
    updateStepStyle('step-2', series, !s1);
    if (!series) { ['step-3', 'step-4', 'step-5'].forEach(s => updateStepStyle(s, false, true)); return; }
    const s3 = resistors.some(r => r.state.resistance >= 75 && r.state.resistance <= 90);
    updateStepStyle('step-3', s3, !series);
    if (!s3) { ['step-4', 'step-5'].forEach(s => updateStepStyle(s, false, true)); return; }
    const s4 = cells.every(c => c.state.forming >= 99 && c.state.charge > 5);
    updateStepStyle('step-4', s4, !s3);
    if (!s4) { updateStepStyle('step-5', false, true); return; }
    const s5 = leds.length > 0 && resistors.some(r => r.state.resistance >= 200 && r.state.resistance <= 400) && leds.some(l => l.state.current > 0.001 && !l.state.blown);
    updateStepStyle('step-5', s5, !s4);
  }
  else if (currentTutorial === 'solar_charge') {
    const solar = components.find(c => c.type === 'solar_panel');
    const caps = components.filter(c => ['capacitor', 'cap_100n', 'cap_10u'].includes(c.type));
    const sw = components.filter(c => c.type === 'spst_switch');
    const s1 = !!(solar && caps.length > 0 && sw.length > 0);
    updateStepStyle('step-1', s1);
    if (!s1) { ['step-2', 'step-3', 'step-4'].forEach(s => updateStepStyle(s, false, true)); return; }
    let loop = false;
    if (solar && caps.length && sw.length) {
      const sp = nodeMap[solar.terminals.find(t => t.label === '+')?.id];
      const sn = nodeMap[solar.terminals.find(t => t.label === '-')?.id];
      const cp = nodeMap[caps[0].terminals.find(t => t.label === '+')?.id];
      const cn = nodeMap[caps[0].terminals.find(t => t.label === '-')?.id];
      const si = nodeMap[sw[0].terminals.find(t => t.label === 'In')?.id];
      const so = nodeMap[sw[0].terminals.find(t => t.label === 'Out')?.id];
      if (((sp === si && so === cp) || (sp === so && si === cp)) && sn === cn && sn !== undefined) loop = true;
    }
    updateStepStyle('step-2', loop, !s1);
    if (!loop) { ['step-3', 'step-4'].forEach(s => updateStepStyle(s, false, true)); return; }
    const s3 = solar && solar.state.sunlight >= 95;
    updateStepStyle('step-3', s3, !loop);
    if (!s3) { updateStepStyle('step-4', false, true); return; }
    const s4 = caps.some(c => c.state.storedVoltage > 10);
    updateStepStyle('step-4', s4, !s3);
  }
  else if (currentTutorial === 'class_a_amp') {
    const gen = components.find(c => c.type === 'signal_generator');
    const npn = components.find(c => c.type === 'npn_transistor');
    const rs = components.filter(c => c.type.startsWith('resistor'));
    const mm = components.filter(c => c.type === 'multimeter');
    const pwr = components.find(c => c.type === 'usb_power');
    const s1 = !!(gen && npn && rs.length >= 1 && mm.length >= 1);
    updateStepStyle('step-1', s1);
    if (!s1) { ['step-2', 'step-3', 'step-4', 'step-5'].forEach(s => updateStepStyle(s, false, true)); return; }
    let s2 = false;
    if (pwr && rs.length) {
      const vb = nodeMap[pwr.terminals.find(t => t.label === '5V')?.id];
      const gn = nodeMap[pwr.terminals.find(t => t.label === 'GND')?.id];
      const ra = nodeMap[rs[0].terminals.find(t => t.label === 'A')?.id];
      const rb = nodeMap[rs[0].terminals.find(t => t.label === 'B')?.id];
      const nc = nodeMap[npn.terminals.find(t => t.label === 'C')?.id];
      const ne = nodeMap[npn.terminals.find(t => t.label === 'E')?.id];
      if (((vb === ra && rb === nc) || (vb === rb && ra === nc)) && ne === gn && ne !== undefined) s2 = true;
    }
    updateStepStyle('step-2', s2, !s1);
    if (!s2) { ['step-3', 'step-4', 'step-5'].forEach(s => updateStepStyle(s, false, true)); return; }
    let s3 = false;
    if (gen && pwr) {
      const gp = nodeMap[gen.terminals.find(t => t.label === '+')?.id];
      const gn = nodeMap[pwr.terminals.find(t => t.label === 'GND')?.id];
      const nb = nodeMap[npn.terminals.find(t => t.label === 'B')?.id];
      const gm = nodeMap[gen.terminals.find(t => t.label === '-')?.id];
      if (gp === nb && gm === gn && gp !== undefined) s3 = true;
    }
    updateStepStyle('step-3', s3, !s2);
    if (!s3) { ['step-4', 'step-5'].forEach(s => updateStepStyle(s, false, true)); return; }
    let s4 = false;
    if (mm.length && pwr) {
      const mr = nodeMap[mm[0].terminals.find(t => t.label === 'VΩ+')?.id];
      const mb = nodeMap[mm[0].terminals.find(t => t.label === 'COM-')?.id];
      const nc = nodeMap[npn.terminals.find(t => t.label === 'C')?.id];
      const gn = nodeMap[pwr.terminals.find(t => t.label === 'GND')?.id];
      if (mr === nc && mb === gn && mr !== undefined) s4 = true;
    }
    updateStepStyle('step-4', s4, !s3);
    if (!s4) { updateStepStyle('step-5', false, true); return; }
    const vC = npn.terminals.find(t => t.label === 'C')?.voltage || 0;
    const s5 = rs[0].state.resistance >= 800 && rs[0].state.resistance <= 1200 && vC > 0.5 && vC < 4.5;
    updateStepStyle('step-5', s5, !s4);
  }
}

// ─── SIMULATION SOLVER ────────────────────────────────────────────────────────
function simulationTick() {
  if (!simulationRunning) return;
  simulationTime += 0.1;

  // Build union-find graph
  const parent = {};
  function find(id) {
    if (!parent[id]) parent[id] = id;
    if (parent[id] === id) return id;
    return parent[id] = find(parent[id]);
  }
  function union(a, b) {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  }

  const allTerminals = [];
  components.forEach(c => c.terminals.forEach(t => allTerminals.push(t.id)));
  wires.forEach(w => union(w.from, w.to));

  const nodeMap = {};
  let nodeCount = 0;
  allTerminals.forEach(tid => {
    const root = find(tid);
    if (nodeMap[root] === undefined) nodeMap[root] = nodeCount++;
    nodeMap[tid] = nodeMap[root];
  });

  if (!nodeCount) return;

  // Find ground node
  let gndIdx = -1;
  const gndTypes = ['usb_power', 'bench_psu', 'solar_panel', 'signal_generator', 'battery_9v', 'battery_aa', 'battery_cr2032', 'battery_lipo', 'battery_lead', 'battery_18650', 'battery_aaa', 'battery_d', 'lemon_battery'];
  for (let t of gndTypes) {
    const c = components.find(c => c.type === t);
    if (c) {
      const gnd = c.terminals.find(t => t.label === 'GND' || t.label === '-');
      if (gnd) { gndIdx = nodeMap[gnd.id]; break; }
    }
  }
  if (gndIdx === -1) gndIdx = 0;

  const V = new Array(nodeCount).fill(0.0);
  if (lastVoltages && lastVoltages.length === nodeCount) V.forEach((_, i) => { V[i] = lastVoltages[i]; });
  V[gndIdx] = 0.0;

  // Iterative nodal analysis (Gauss-Seidel)
  for (let iter = 0; iter < 80; iter++) {
    const nV = [...V];
    for (let i = 0; i < nodeCount; i++) {
      if (i === gndIdx) continue;
      let sumG = 0, sumGV = 0;

      components.forEach(comp => {
        const { type, state, terminals } = comp;
        const T = (label) => { const t = terminals.find(x => x.label === label); return t ? nodeMap[t.id] : undefined; };

        // ── Two-terminal resistive sources ──
        const twoPort = (nP, nN, emf, R) => {
          if (nP === undefined || nN === undefined) return;
          const G = 1 / R;
          if (nP === i) { sumG += G; sumGV += G * (V[nN] + emf); }
          if (nN === i) { sumG += G; sumGV += G * (V[nP] - emf); }
        };

        if (type === 'usb_power') twoPort(T('5V'), T('GND'), 5.0, 0.2);
        else if (type === 'bench_psu') twoPort(T('+'), T('GND'), state.voltage, 0.5);
        else if (type === 'battery_9v' || type === 'battery_aa' || type === 'battery_cr2032' || type === 'battery_lipo' || type === 'battery_lead' || type === 'battery_18650' || type === 'battery_aaa' || type === 'battery_d' || type === 'lemon_battery')
          twoPort(T('+'), T('-'), state.voltage * (state.charge / 100), state.internalR);
        else if (type === 'solar_panel') twoPort(T('+'), T('-'), state.voltage, 5.0 + 50 * (1 - state.sunlight / 100));
        else if (type === 'signal_generator') {
          const wf = state.waveform || 'sine';
          let genV;
          if (wf === 'sine') genV = state.amplitude * Math.sin(2 * Math.PI * state.frequency * simulationTime);
          else if (wf === 'square') genV = state.amplitude * (Math.sin(2 * Math.PI * state.frequency * simulationTime) >= 0 ? 1 : -1);
          else genV = state.amplitude * (2 * (state.frequency * simulationTime % 1) - 1);
          state.outputVoltage = genV;
          twoPort(T('+'), T('-'), genV, 10);
        }
        else if (type === 'diy_cell') {
          const fr = state.forming / 100, cr = state.charge / 100;
          const cellV = fr * (1.5 + 0.5 * cr);
          const Rint = 150 - 146 * fr;
          twoPort(T('+'), T('-'), cellV, Rint);
        }
        else if (type === 'resistor' || type === 'resistor_1k' || type === 'resistor_10k' || type === 'resistor_100' || type === 'resistor_220' || type === 'resistor_330' || type === 'resistor_4k7' || type === 'resistor_1m' || type === 'wire_copper' || type === 'wire_nichrome' || type === 'salt_water') {
          const nA = T('A'), nB = T('B'); if (nA === undefined || nB === undefined) return;
          const G = 1 / state.resistance; const nb = (nA === i) ? nB : nA;
          if (nA === i || nB === i) { sumG += G; sumGV += G * V[nb]; }
        }
        else if (type === 'pot') {
          const nA = T('A'), nW = T('W'), nB = T('B');
          const Raw = Math.max(1, state.resistance * state.wiper), Rwb = Math.max(1, state.resistance * (1 - state.wiper));
          if (nA !== undefined && nW !== undefined) { const G = 1 / Raw; if (nA === i) { sumG += G; sumGV += G * V[nW]; } if (nW === i) { sumG += G; sumGV += G * V[nA]; } }
          if (nW !== undefined && nB !== undefined) { const G = 1 / Rwb; if (nW === i) { sumG += G; sumGV += G * V[nB]; } if (nB === i) { sumG += G; sumGV += G * V[nW]; } }
        }
        else if (type === 'capacitor' || type === 'cap_100n' || type === 'cap_10u' || type === 'cap_1u' || type === 'cap_100u') {
          const C = state.capacitance, dt = 0.1;
          const Req = dt / C; const G = 1 / Req; const capV = state.storedVoltage;
          twoPort(T('+'), T('-'), capV, Req);
        }
        else if (type === 'inductor' || type === 'ind_1mH') {
          const nA = T('A'), nB = T('B'); if (nA === undefined || nB === undefined) return;
          const L = state.inductance, dt = 0.1;
          const R_eq = L / dt; const G = 1 / R_eq;
          const indV = R_eq * state.current;
          if (nA === i) { sumG += G; sumGV += G * (V[nB] + indV); }
          if (nB === i) { sumG += G; sumGV += G * (V[nA] - indV); }
        }
        else if (type === 'diode' || type === 'diode_1n4148' || type === 'diode_1n5819') {
          const nA = T('A+'), nK = T('K-'); if (nA === undefined || nK === undefined) return;
          const vd = V[nA] - V[nK];
          const G = vd > state.vf ? 1 / 10 : 1 / 1e7;
          const Veff = (nA === i) ? (V[nK] + state.vf) : (V[nA] - state.vf);
          if (nA === i || nK === i) { sumG += G; sumGV += G * (vd > state.vf ? Veff : V[(nA === i) ? nK : nA]); }
        }
        else if (type === 'zener') {
          const nA = T('A+'), nK = T('K-'); if (nA === undefined || nK === undefined) return;
          const vd = V[nA] - V[nK], vkr = V[nK] - V[nA];
          if (vd > state.vf) { // forward
            const G = 1 / 10;
            if (nA === i) { sumG += G; sumGV += G * (V[nK] + state.vf); }
            if (nK === i) { sumG += G; sumGV += G * (V[nA] - state.vf); }
          } else if (vkr > state.vz) { // breakdown
            const G = 1 / 5;
            if (nK === i) { sumG += G; sumGV += G * (V[nA] + state.vz); }
            if (nA === i) { sumG += G; sumGV += G * (V[nK] - state.vz); }
          } else { sumG += 1 / 1e8; }
        }
        else if (type === 'led' || type === 'led_green' || type === 'led_blue' || type === 'led_yellow' || type === 'led_white') {
          if (state.blown) return;
          const nA = T('A+'), nK = T('K-'); if (nA === undefined || nK === undefined) return;
          const vd = V[nA] - V[nK];
          const G = vd > state.vf ? 1 / 20 : 1 / 1e6;
          const Veff = (nA === i) ? (V[nK] + state.vf) : (V[nA] - state.vf);
          if (nA === i || nK === i) { sumG += G; sumGV += G * (vd > state.vf ? Veff : V[(nA === i) ? nK : nA]); }
        }
        else if (type === 'led_rgb') {
          ['R+', 'G+', 'B+'].forEach(pos => {
            const nA = T(pos), nK = T('K-'); if (nA === undefined || nK === undefined) return;
            const vf = pos === 'B+' ? 3.2 : pos === 'G+' ? 2.2 : 2.0;
            const vd = V[nA] - V[nK]; const G = vd > vf ? 1 / 25 : 1 / 1e6;
            const Veff = (nA === i) ? (V[nK] + vf) : (V[nA] - vf);
            if (nA === i || nK === i) { sumG += G; sumGV += G * (vd > vf ? Veff : V[(nA === i) ? nK : nA]); }
          });
        }
        else if (type === 'spst_switch') {
          const n1 = T('In'), n2 = T('Out'); if (n1 === undefined || n2 === undefined) return;
          const R = state.closed ? 0.01 : 1e8; const G = 1 / R; const nb = (n1 === i) ? n2 : n1;
          if (n1 === i || n2 === i) { sumG += G; sumGV += G * V[nb]; }
        }
        else if (type === 'dip_switch') {
          for (let d = 1; d <= 4; d++) {
            const n1 = T(d + 'A'), n2 = T(d + 'B'); if (n1 === undefined || n2 === undefined) continue;
            const R = state['sw' + d] ? 0.01 : 1e8; const G = 1 / R; const nb = (n1 === i) ? n2 : n1;
            if (n1 === i || n2 === i) { sumG += G; sumGV += G * V[nb]; }
          }
        }
        else if (type === 'slide_switch') {
          const nc = T('COM'), n1 = T('1'), n2 = T('2'); if (nc === undefined) return;
          if (state.pos === 1 && n1 !== undefined) {
            const R = 0.01; const G = 1 / R; const nb = (nc === i) ? n1 : nc;
            if (nc === i || n1 === i) { sumG += G; sumGV += G * V[nb]; }
          } else if (state.pos === 2 && n2 !== undefined) {
            const R = 0.01; const G = 1 / R; const nb = (nc === i) ? n2 : nc;
            if (nc === i || n2 === i) { sumG += G; sumGV += G * V[nb]; }
          }
        }
        else if (type === 'ic_74hc00' || type === 'ic_74hc08' || type === 'ic_74hc04') {
          // Read inputs
          const vIn1 = T('1A') !== undefined ? V[T('1A')] : 0;
          const vIn2 = T('1B') !== undefined ? V[T('1B')] : 0;
          const vcc = T('Vcc') !== undefined ? V[T('Vcc')] : 0;
          const gnd = T('GND') !== undefined ? V[T('GND')] : 0;
          const outId = T('1Y');

          if (vcc - gnd > 3.0) {
            let outHigh = false;
            if (type === 'ic_74hc00') outHigh = !(vIn1 > 2.0 && vIn2 > 2.0); // NAND
            else if (type === 'ic_74hc08') outHigh = (vIn1 > 2.0 && vIn2 > 2.0); // AND
            else if (type === 'ic_74hc04') outHigh = !(vIn1 > 2.0); // NOT

            state.out1 = outHigh;
            const vOut = outHigh ? vcc - 0.1 : gnd + 0.1;
            // Output driver
            if (outId === i) { sumG += 1 / 50; sumGV += (1 / 50) * vOut; }
          } else {
            state.out1 = false;
            if (outId === i) { sumG += 1 / 1e6; sumGV += 0; }
          }
        }
        else if (type === 'pushbutton') {
          const n1 = T('1'), n2 = T('2'); if (n1 === undefined || n2 === undefined) return;
          const R = state.pressed ? 0.01 : 1e8; const G = 1 / R; const nb = (n1 === i) ? n2 : n1;
          if (n1 === i || n2 === i) { sumG += G; sumGV += G * V[nb]; }
        }
        else if (type === 'npn_transistor' || type === 'npn_bc547') {
          const nC = T('C'), nB = T('B'), nE = T('E'); if (nC === undefined || nB === undefined || nE === undefined) return;
          // B-E junction
          const vbe = V[nB] - V[nE], active = vbe > 0.7;
          if (nB === i || nE === i) { const G = active ? 1 / 50 : 1 / 1e7; const nb = (nB === i) ? nE : nB; const Veff = (nB === i) ? (V[nE] + 0.7) : (V[nB] - 0.7); sumG += G; sumGV += G * (active ? Veff : V[nb]); }
          // C-E channel
          if (nC === i || nE === i) { const Ib = Math.max(0, (vbe - 0.7) / 50); state.current_b = Ib; const Rce = Math.max(2, 1 / (state.beta * Ib + 1e-9)); const G = 1 / Rce; const nb = (nC === i) ? nE : nC; sumG += G; sumGV += G * V[nb]; }
        }
        else if (type === 'pnp_transistor' || type === 'pnp_bc557') {
          const nC = T('C'), nB = T('B'), nE = T('E'); if (nC === undefined || nB === undefined || nE === undefined) return;
          const veb = V[nE] - V[nB], active = veb > 0.7;
          if (nE === i || nB === i) { const G = active ? 1 / 50 : 1 / 1e7; const nb = (nE === i) ? nB : nE; const Veff = (nE === i) ? (V[nB] + 0.7) : (V[nE] - 0.7); sumG += G; sumGV += G * (active ? Veff : V[nb]); }
          if (nE === i || nC === i) { const Ib = Math.max(0, (veb - 0.7) / 50); state.current_b = Ib; const Rce = Math.max(2, 1 / (state.beta * Ib + 1e-9)); const G = 1 / Rce; const nb = (nE === i) ? nC : nE; sumG += G; sumGV += G * V[nb]; }
        }
        else if (type === 'mosfet_n' || type === 'mosfet_2n7000') {
          const nD = T('D'), nG = T('G'), nS = T('S'); if (nD === undefined || nG === undefined || nS === undefined) return;
          if (nG === i) { sumG += 1 / 1e10; sumGV += (1 / 1e10) * V[nS]; }
          const vgs = V[nG] - V[nS], on = vgs > state.threshold;
          if (nD === i || nS === i) { const Rds = on ? state.rds_on : 1e7; const G = 1 / Rds; const nb = (nD === i) ? nS : nD; sumG += G; sumGV += G * V[nb]; }
        }
        else if (type === 'mosfet_p') {
          const nD = T('D'), nG = T('G'), nS = T('S'); if (nD === undefined || nG === undefined || nS === undefined) return;
          if (nG === i) { sumG += 1 / 1e10; sumGV += (1 / 1e10) * V[nS]; }
          const vgs = V[nG] - V[nS], on = vgs < state.threshold;
          if (nS === i || nD === i) { const Rds = on ? state.rds_on : 1e7; const G = 1 / Rds; const nb = (nS === i) ? nD : nS; sumG += G; sumGV += G * V[nb]; }
        }
        else if (type === 'lm7805') {
          const nI = T('IN'), nG = T('GND'), nO = T('OUT'); if (!nI || !nG || !nO) return;
          const vin = V[nI] - V[nG];
          const vout = vin > 7 ? 5.0 : 0;
          twoPort(nO, nG, vout, 2.0);
          if (nI === i || nG === i) { sumG += 1 / 1e7; sumGV += (1 / 1e7) * V[(nI === i) ? nG : nI]; }
        }
        else if (type === 'lm317') {
          const nI = T('IN'), nA = T('ADJ'), nO = T('OUT'); if (nI === undefined || nA === undefined || nO === undefined) return;
          twoPort(nO, nA, state.vout, 3.0);
          if (nI === i) { sumG += 1 / 1e7; sumGV += (1 / 1e7) * V[nI]; }
        }
        else if (type === 'lm741' || type === 'lm358') {
          const nIp = T('IN+'), nIn = T('IN-'), nVp = T('Vcc+') || T('Vcc'), nVn = T('Vcc-') || T('GND'), nO = T('OUT');
          if (nIp === undefined || nIn === undefined || nO === undefined) return;
          const vp = (nVp !== undefined ? V[nVp] : 5), vn = (nVn !== undefined ? V[nVn] : 0);
          const vd = V[nIp] - V[nIn];
          const vout = Math.max(vn + 0.5, Math.min(vp - 0.5, state.gain * vd));
          if (nO === i) { sumG += 1 / 100; sumGV += (1 / 100) * vout; }
          if (nIp === i) { sumG += 1 / 1e9; }
          if (nIn === i) { sumG += 1 / 1e9; }
        }
        else if (type === 'ne555') {
          const nVcc = T('Vcc'), nGnd = T('GND'), nOut = T('OUT'), nTrg = T('TRG'), nThr = T('THR'), nDis = T('DIS');
          if (nVcc === undefined || nGnd === undefined || nOut === undefined) return;
          const vcc = V[nVcc], vgnd = V[nGnd];
          const vtrg = (nTrg !== undefined ? V[nTrg] : 0), vthr = (nThr !== undefined ? V[nThr] : 0);
          const dt = 0.1;
          if (vthr > 2 * vcc / 3) state.out = false;
          if (vtrg < vcc / 3) state.out = true;
          const outV = state.out ? vcc - 0.5 : vgnd + 0.1;
          if (nOut === i) { sumG += 1 / 50; sumGV += (1 / 50) * outV; }
          // Cap charging through DIS when out is low
          if (nDis !== undefined && nGnd !== undefined) { const R = state.out ? 1e7 : 200; const G = 1 / R; const nb = (nDis === i) ? nGnd : nDis; if (nDis === i || nGnd === i) { sumG += G; sumGV += G * V[nb]; } }
        }
        else if (type === 'multimeter') {
          const nR = T('VΩ+'), nB = T('COM-'); if (nR === undefined || nB === undefined) return;
          const R = state.mode === 'voltage' ? 1e8 : state.mode === 'current' ? 0.1 : 1e8;
          const G = 1 / R; const nb = (nR === i) ? nB : nR;
          if (nR === i || nB === i) { sumG += G; sumGV += G * V[nb]; }
        }
        else if (type === 'thermistor' || type === 'ldr') {
          const nA = T('A'), nB = T('B'); if (nA === undefined || nB === undefined) return;
          const G = 1 / (state.resistance || 10000); const nb = (nA === i) ? nB : nA;
          if (nA === i || nB === i) { sumG += G; sumGV += G * V[nb]; }
        }
        else if (type === 'transformer') {
          const nP = T('P+'), nPn = T('P-'), nS = T('S+'), nSn = T('S-');
          if (nP === undefined || nPn === undefined || nS === undefined || nSn === undefined) return;
          const vp = V[nP] - V[nPn], vs_ideal = vp * state.ratio;
          if (nP === i || nPn === i) { const G = 1 / 500; const nb = (nP === i) ? nPn : nP; sumG += G; sumGV += G * V[nb]; }
          if (nS === i) { sumG += 1 / 100; sumGV += (1 / 100) * (V[nSn] + vs_ideal); }
          if (nSn === i) { sumG += 1 / 100; sumGV += (1 / 100) * (V[nS] - vs_ideal); }
        }
        else if (type === 'buzzer' || type === 'speaker') {
          const nP = T('+'), nN = T('-'); if (nP === undefined || nN === undefined) return;
          const G = 1 / 8; const nb = (nP === i) ? nN : nP;
          if (nP === i || nN === i) { sumG += G; sumGV += G * V[nb]; }
        }
        else {
          // Fallback: high impedance on all terminals
          if (terminals.length >= 2) { sumG += 1 / 1e9; }
        }
      });

      if (sumG > 0) nV[i] = sumGV / sumG; else nV[i] = 0;
    }
    V.forEach((_, i) => { if (i !== gndIdx) V[i] = nV[i]; });
  }

  V[gndIdx] = 0.0;
  lastVoltages = V;

  // Update terminal voltages
  components.forEach(c => { c.terminals.forEach(t => { t.voltage = V[nodeMap[t.id]] || 0; }); });

  // Post-process updates
  components.forEach(comp => {
    const { id, type, state, terminals } = comp;
    const tv = (label) => { const t = terminals.find(x => x.label === label); return t ? t.voltage : 0; };

    if (type === 'signal_generator') {
      const el = document.getElementById(`${id}-disp`); if (el) el.innerText = state.outputVoltage.toFixed(2) + ' V';
    }
    else if (type === 'capacitor' || type === 'cap_100n' || type === 'cap_10u' || type === 'cap_1u' || type === 'cap_100u') {
      const vp = tv('+'), vn = tv('-');
      const C = state.capacitance, dt = 0.1, Req = dt / C;
      state.storedVoltage += ((vp - vn - state.storedVoltage) / Req) * dt;
      state.storedVoltage = Math.max(-50, Math.min(50, state.storedVoltage));
      const sv = document.getElementById(`${id}-sv`); if (sv) sv.innerText = state.storedVoltage.toFixed(2) + ' V';
      const cb = document.getElementById(`${id}-cbar`); if (cb) cb.style.width = Math.max(0, Math.min(100, (state.storedVoltage / 15) * 100)) + '%';
    }
    else if (type === 'inductor' || type === 'ind_1mH') {
      const vA = tv('A'), vB = tv('B');
      const L = state.inductance, dt = 0.1;
      state.current += ((vA - vB) / L) * dt;
      state.current = Math.max(-10, Math.min(10, state.current));
      const el = document.getElementById(`${id}-curr`); if (el) el.innerText = (state.current * 1000).toFixed(2) + ' mA';
    }
    else if (type === 'diy_cell') {
      const vA = tv('+'), vC = tv('-');
      const fr = state.forming / 100, cr = state.charge / 100;
      const cellV = fr * (1.5 + 0.5 * cr), Rint = 150 - 146 * fr;
      state.current = (vA - vC - cellV) / Rint;
      state.voltage = cellV;
      const dt = 0.25;
      if (state.current > 0) {
        if (state.forming < 100) state.forming = Math.min(100, state.forming + state.current * 40 * dt);
        else state.charge = Math.min(100, state.charge + state.current * 20 * dt);
      } else if (state.current < 0) {
        state.charge = Math.max(0, state.charge + state.current * 15 * dt);
      }
      const f = document.getElementById(`${id}-forming`); if (f) f.innerText = Math.round(state.forming) + '%';
      const fb = document.getElementById(`${id}-f-bar`); if (fb) fb.style.width = state.forming + '%';
      const c = document.getElementById(`${id}-charge`); if (c) c.innerText = Math.round(state.charge) + '%';
      const cb = document.getElementById(`${id}-c-bar`); if (cb) cb.style.width = state.charge + '%';
      const ev = document.getElementById(`${id}-emf`); if (ev) ev.innerText = cellV.toFixed(2) + ' V';
      const ec = document.getElementById(`${id}-curr`); if (ec) ec.innerText = (state.current * 1000).toFixed(1) + ' mA';
      const bub = document.getElementById(`${id}-bubble`); if (bub) bub.classList.toggle('hidden', !(state.current > 0.012 && state.forming >= 95));
    }
    else if (type === 'battery_9v' || type === 'battery_aa' || type === 'battery_cr2032' || type === 'battery_lipo' || type === 'battery_lead' || type === 'battery_18650' || type === 'battery_aaa' || type === 'battery_d' || type === 'lemon_battery') {
      const vp = tv('+'), vn = tv('-');
      const emf = state.voltage * (state.charge / 100);
      const I = (vp - vn - emf) / state.internalR;
      if (I > 0.001) state.charge = Math.max(0, state.charge - I * 0.001);
      const chg = document.getElementById(`${id}-chg`); if (chg) chg.innerText = Math.round(state.charge) + '%';
      const bar = document.getElementById(`${id}-chg-bar`); if (bar) bar.style.width = state.charge + '%';
    }
    else if (type.startsWith('led')) {
      if (type === 'led_rgb') {
        ['R', 'G', 'B'].forEach(ch => {
          const vA = tv(`${ch}+`), vK = tv('K-');
          const vf = ch === 'B' ? 3.2 : ch === 'G' ? 2.2 : 2.0;
          const vd = vA - vK, I = vd > vf ? (vd - vf) / 25 : 0;
          const bulb = document.getElementById(`${id}-${ch.toLowerCase()}-bulb`);
          const inner = document.getElementById(`${id}-${ch.toLowerCase()}-inner`);
          if (!bulb || !inner) return;
          const colors = { R: '#ef4444', G: '#22c55e', B: '#3b82f6' };
          if (I > 0.001) {
            const int = Math.min(1, I / 0.02);
            inner.style.background = colors[ch];
            bulb.style.boxShadow = `0 0 ${8 + int * 12}px ${colors[ch]}`;
          } else {
            inner.style.background = ''; bulb.style.boxShadow = '';
          }
        });
      } else {
        if (state.blown) return;
        const vA = tv('A+'), vK = tv('K-');
        const vd = vA - vK;
        const I = vd > state.vf ? (vd - state.vf) / 20 : 0;
        state.current = I;
        if (I > 0.045) { state.blown = true; const r = document.getElementById(`${id}-reset`); if (r) r.classList.remove('hidden'); }
        const bulb = document.getElementById(`${id}-bulb`);
        const inner = document.getElementById(`${id}-bulb-inner`);
        const status = document.getElementById(`${id}-status`);
        if (!bulb || !inner || !status) return;
        if (state.blown) {
          bulb.style.borderColor = '#7f1d1d'; inner.style.background = '#3f0f0f'; status.innerText = '💥 BLOWN'; status.style.color = 'var(--rose)';
        } else if (I > 0.001) {
          const int = Math.min(1, I / 0.02);
          bulb.style.borderColor = state.color; bulb.style.boxShadow = `0 0 ${10 + int * 15}px ${state.color}`;
          inner.style.background = state.color; inner.style.opacity = 0.5 + int * 0.5;
          status.innerText = `${(I * 1000).toFixed(1)} mA`; status.style.color = state.color;
        } else {
          bulb.style.borderColor = ''; bulb.style.boxShadow = ''; inner.style.background = ''; inner.style.opacity = '';
          status.innerText = 'Off'; status.style.color = '';
        }
      }
    }
    else if (type === 'multimeter') {
      const vR = tv('VΩ+'), vB = tv('COM-');
      const display = document.getElementById(`${id}-display`);
      if (!display) return;
      if (state.mode === 'voltage') display.innerText = (vR - vB).toFixed(2);
      else if (state.mode === 'current') display.innerText = ((vR - vB) / 0.1 * 1000).toFixed(1);
      else display.innerText = 'HI';
    }
    else if (type === 'oscilloscope') {
      if (!oscData[id]) oscData[id] = { ch1: [], ch2: [] };
      const vCh1 = tv('CH1'), vCh2 = tv('CH2');
      oscData[id].ch1.push(vCh1);
      oscData[id].ch2.push(vCh2);
      if (oscData[id].ch1.length > 200) { oscData[id].ch1.shift(); oscData[id].ch2.shift(); }
      drawScope(id);
    }
    else if (type === 'npn_transistor' || type === 'pnp_transistor') {
      const vB = tv('B'), vC = tv('C'), vE = tv('E');
      const vbe = type === 'npn_transistor' ? (vB - vE) : (vE - vB);
      const vce = vC - vE;
      const Ic = state.current_b * state.beta;
      const modeStr = vbe > 0.6 ? (vce > 0.2 ? 'Active' : 'Saturation') : 'Cut-off';
      const ibEl = document.getElementById(`${id}-ib`); if (ibEl) ibEl.innerText = (state.current_b * 1e6).toFixed(1) + 'µA';
      const icEl = document.getElementById(`${id}-ic`); if (icEl) icEl.innerText = (Ic * 1000).toFixed(2) + 'mA';
      const vbeEl = document.getElementById(`${id}-vbe`); if (vbeEl) vbeEl.innerText = vbe.toFixed(2) + 'V';
      const vceEl = document.getElementById(`${id}-vce`); if (vceEl) vceEl.innerText = vce.toFixed(2) + 'V';
      const modeEl = document.getElementById(`${id}-mode`);
      if (modeEl) { modeEl.innerText = modeStr; modeEl.style.color = modeStr === 'Active' ? 'var(--teal)' : modeStr === 'Saturation' ? 'var(--amber)' : 'var(--text-muted)'; }
    }
    else if (type === 'mosfet_n' || type === 'mosfet_p') {
      const vG = tv('G'), vD = tv('D'), vS = tv('S');
      const vgs = vG - vS, on = type === 'mosfet_n' ? vgs > state.threshold : vgs < state.threshold;
      const Id = (vD - vS) / (on ? state.rds_on : 1e7);
      const vgsEl = document.getElementById(`${id}-vgs`); if (vgsEl) vgsEl.innerText = vgs.toFixed(2) + 'V';
      const idEl = document.getElementById(`${id}-id`); if (idEl) idEl.innerText = (Math.abs(Id) * 1000).toFixed(1) + 'mA';
      const modeEl = document.getElementById(`${id}-mode`);
      if (modeEl) { modeEl.innerText = on ? 'ON' : 'OFF'; modeEl.style.color = on ? 'var(--teal)' : 'var(--text-muted)'; }
    }
    else if (type === 'lm741' || type === 'lm358') {
      const vIp = tv('IN+'), vIn = tv('IN-');
      const vVp = tv('Vcc+') || tv('Vcc') || 5, vVn = tv('Vcc-') || tv('GND') || 0;
      const vout = Math.max(vVn + 0.5, Math.min(vVp - 0.5, state.gain * (vIp - vIn)));
      const el = document.getElementById(`${id}-vout`); if (el) el.innerText = vout.toFixed(2) + ' V';
      const mode = document.getElementById(`${id}-mode`);
      if (mode) { const vd = vIp - vIn; mode.innerText = Math.abs(vd) < 0.001 ? 'Virtual short' : vd > 0 ? '+Sat' : '-Sat'; }
    }
    else if (type === 'ne555') {
      const out = document.getElementById(`${id}-out`); if (out) { out.innerText = state.out ? 'HIGH' : 'LOW'; out.style.color = state.out ? 'var(--teal)' : 'var(--rose)'; }
      const cv = document.getElementById(`${id}-cv`); if (cv) { const vThr = tv('THR'); cv.innerText = vThr.toFixed(1) + 'V'; }
    }
    else if (type === 'diode' || type === 'zener') {
      const vA = tv('A+'), vK = tv('K-');
      const fwd = vA - vK > state.vf;
      const el = document.getElementById(`${id}-state`);
      if (el) { el.innerText = fwd ? 'ON' : 'OFF'; el.style.color = fwd ? 'var(--teal)' : 'var(--text-muted)'; }
    }
    else if (type === 'transformer') {
      const vPp = tv('P+'), vPn = tv('P-');
      const vp = vPp - vPn;
      const elVp = document.getElementById(`${id}-vp`); if (elVp) elVp.innerText = vp.toFixed(2) + ' V';
      const elVs = document.getElementById(`${id}-vs`); if (elVs) elVs.innerText = (vp * state.ratio).toFixed(2) + ' V';
    }
    else if (type === 'resistor' || type === 'resistor_1k' || type === 'resistor_10k' || type === 'resistor_100' || type === 'resistor_220' || type === 'resistor_330' || type === 'resistor_4k7' || type === 'resistor_1m' || type === 'wire_copper' || type === 'wire_nichrome' || type === 'salt_water') {
      const vA = tv('A'), vB = tv('B');
      const P = Math.pow(vA - vB, 2) / state.resistance;
      const el = document.getElementById(`${id}-pwr`); if (el) el.innerText = (P * 1000).toFixed(1) + ' mW';
    }
    else if (type === 'buzzer') {
      const vP = tv('+'), vN = tv('-');
      const on = Math.abs(vP - vN) > 4.0;
      state.active = on;
      const icon = document.getElementById(`${id}-icon`); if (icon) icon.innerText = on ? '🔔' : '🔕';
      const status = document.getElementById(`${id}-status`); if (status) { status.innerText = on ? 'Buzzing!' : 'Silent'; status.style.color = on ? 'var(--teal)' : ''; }
    }
    else if (type === 'speaker') {
      const vP = tv('+'), vN = tv('-');
      const on = Math.abs(vP - vN) > 0.5;
      state.active = on;
      const icon = document.getElementById(`${id}-icon`); if (icon) icon.innerText = on ? '🔊' : '🔈';
      const status = document.getElementById(`${id}-status`); if (status) { status.innerText = on ? 'Playing' : 'Silent'; status.style.color = on ? 'var(--teal)' : ''; }
    }
    else if (type === 'seven_seg') {
      const segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
      segs.forEach(s => {
        const t = terminals.find(x => x.label === s);
        const on = t && (t.voltage > 2.0);
        const el = document.getElementById(`${id}-s${s}`);
        if (el) el.setAttribute('fill', on ? '#ef4444' : '#1a2030');
      });
    }
  });

  evaluateActiveTutorial(nodeMap);
  const mEl = document.getElementById('live-metrics');
  if (mEl) {
    if (tutorialGuides[currentTutorial]) {
      mEl.innerHTML = tutorialGuides[currentTutorial].liveMetrics();
    } else {
      mEl.innerHTML = getCustomCircuitMetrics();
    }
  }
}

// ─── OSCILLOSCOPE RENDERER ────────────────────────────────────────────────────
function drawScope(id) {
  const canvas = document.getElementById(`${id}-canvas`);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.fillStyle = '#000a04'; ctx.fillRect(0, 0, w, h);
  // Grid
  ctx.strokeStyle = 'rgba(0,60,30,0.5)'; ctx.lineWidth = 0.5;
  for (let x = 0; x < w; x += w / 4) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
  for (let y = 0; y < h; y += h / 4) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

  const data = oscData[id];
  if (!data) return;

  ['ch1', 'ch2'].forEach((ch, idx) => {
    const d = data[ch]; if (!d.length) return;
    const color = ch === 'ch1' ? '#22c55e' : '#f59e0b';
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath();
    const maxV = Math.max(15, Math.max(...d.map(Math.abs)));
    d.forEach((v, i) => {
      const px = (i / d.length) * w;
      const py = h / 2 - (v / maxV) * (h / 2 - 4);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  });
}

// ─── WORKSPACE PAN & ZOOM LAYER ──────────────────────────────────────────────
function applyWorkspaceTransform() {
  const transformStr = `translate(${transformState.x}px, ${transformState.y}px) scale(${transformState.scale})`;
  container.style.transform = transformStr;
  wireLayer.style.transform = transformStr;
}

function handleWorkspaceWheel(e) {
  e.preventDefault();
  const zoomFactor = 1.08;
  const rect = workspace.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const prevScale = transformState.scale;
  let newScale = e.deltaY < 0 ? prevScale * zoomFactor : prevScale / zoomFactor;
  newScale = Math.max(0.3, Math.min(2.5, newScale));

  transformState.x = mouseX - (mouseX - transformState.x) * (newScale / prevScale);
  transformState.y = mouseY - (mouseY - transformState.y) * (newScale / prevScale);
  transformState.scale = newScale;

  applyWorkspaceTransform();
  updateWires();
}

function startWorkspacePan(e) {
  if (draggedComponent || activeWireStart) return;
  const src = e.touches ? e.touches[0] : e;

  // 2-Finger or middle click/empty space touch triggers panning
  if (e.touches && e.touches.length === 2) {
    isPanningWorkspace = true;
    lastTouchDistance = getTouchDistance(e);
    panStart.x = (e.touches[0].clientX + e.touches[1].clientX) / 2 - transformState.x;
    panStart.y = (e.touches[0].clientY + e.touches[1].clientY) / 2 - transformState.y;
    return;
  }

  if (e.button === 1 || e.button === 2 || !e.touches) {
    isPanningWorkspace = true;
    panStart.x = src.clientX - transformState.x;
    panStart.y = src.clientY - transformState.y;
  }
}

function handleWorkspacePanAndZoom(e) {
  if (!isPanningWorkspace) return;
  e.preventDefault();

  // Pinch-to-zoom logic
  if (e.touches && e.touches.length === 2) {
    const dist = getTouchDistance(e);
    const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
    const rect = workspace.getBoundingClientRect();
    const relX = midX - rect.left;
    const relY = midY - rect.top;

    const prevScale = transformState.scale;
    let newScale = transformState.scale * (dist / lastTouchDistance);
    newScale = Math.max(0.3, Math.min(2.5, newScale));

    transformState.x = relX - (relX - transformState.x) * (newScale / prevScale);
    transformState.y = relY - (relY - transformState.y) * (newScale / prevScale);
    transformState.scale = newScale;
    lastTouchDistance = dist;

    applyWorkspaceTransform();
    updateWires();
    return;
  }

  const src = e.touches ? e.touches[0] : e;
  transformState.x = src.clientX - panStart.x;
  transformState.y = src.clientY - panStart.y;
  applyWorkspaceTransform();
  updateWires();
}

function stopWorkspacePan() {
  isPanningWorkspace = false;
}

function getTouchDistance(e) {
  const dx = e.touches[0].clientX - e.touches[1].clientX;
  const dy = e.touches[0].clientY - e.touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── WIRE COLOR SELECTOR UI ───────────────────────────────────────────────────
function renderWireColorBar() {
  const bar = document.getElementById('wire-color-bar');
  if (!bar) return;
  bar.innerHTML = WIRE_COLORS.map(c => `
       <div class="wire-swatch ${c.hex === selectedWireColor ? 'active' : ''}" 
            style="background:${c.hex}" 
            title="${c.label}"
            onclick="selectWireColor('${c.hex}')"></div>
     `).join('');
}

function selectWireColor(hex) {
  selectedWireColor = hex;
  renderWireColorBar();
  showToast(`Wire color: ${WIRE_COLORS.find(c => c.hex === hex)?.label || hex}`, 'info');
}

// ─── BUILD PARTS BIN HTML ─────────────────────────────────────────────────────
function buildPartsBin() {
  const bin = document.getElementById('parts-container');
  if (!bin) return;
  bin.innerHTML = PARTS_CATALOGUE.map(group => `
       <div class="parts-group">
         <div class="parts-group-label">${group.group}</div>
         ${group.parts.map(p => `
           <button class="part-btn" onclick="addAndFocusComponent('${p.type}')">
             <div class="part-icon ${p.iconClass}">${p.icon}</div>
             <div class="part-info">
               <div class="part-name">${p.name}</div>
               <div class="part-desc">${p.desc}</div>
             </div>
           </button>
         `).join('')}
       </div>
     `).join('');
}

// ─── PARTS SEARCH ─────────────────────────────────────────────────────────────
function filterParts(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.part-btn').forEach(btn => {
    const name = btn.querySelector('.part-name')?.innerText.toLowerCase() || '';
    const desc = btn.querySelector('.part-desc')?.innerText.toLowerCase() || '';
    btn.style.display = (!q || name.includes(q) || desc.includes(q)) ? '' : 'none';
  });
  // Show/hide group labels
  document.querySelectorAll('.parts-group').forEach(g => {
    const visible = [...g.querySelectorAll('.part-btn')].some(b => b.style.display !== 'none');
    g.style.display = visible ? '' : 'none';
  });
}

// ─── TUTORIAL SELECTOR BUILD ──────────────────────────────────────────────────
function buildTutorialSelector() {
  const sel = document.getElementById('tutorial-select');
  if (!sel) return;
  sel.innerHTML = Object.entries(tutorialGuides).map(([k, v], i) => `
       <option value="${k}">${i + 1}. ${v.title}</option>
     `).join('');
}

// ─── KEYBOARD SHORTCUTS ───────────────────────────────────────────────────────
function initKeyboardShortcuts() {
  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape') { activeWireStart = null; closeContextMenu(); updateWires(); }
    if (e.key === ' ') { e.preventDefault(); simulationRunning = !simulationRunning; updatePlayButton(); }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      // delete selected component if any
    }
  });
}

function updatePlayButton() {
  const btn = document.getElementById('btn-play-pause');
  const icon = document.getElementById('play-icon');
  const text = document.getElementById('play-text');
  if (!btn) return;
  if (simulationRunning) {
    btn.classList.remove('paused');
    if (icon) icon.innerText = '⏸';
    if (text) text.innerText = 'Pause';
  } else {
    btn.classList.add('paused');
    if (icon) icon.innerText = '▶';
    if (text) text.innerText = 'Resume';
  }
}

// ─── WIRE MANAGER ──────────────────────────────────────────────────────────────
function openWireManager() {
  const overlay = document.getElementById('wire-overlay');
  if (overlay) overlay.classList.remove('hidden');
  renderWireList();
}
function closeWireManager() {
  const overlay = document.getElementById('wire-overlay');
  if (overlay) overlay.classList.add('hidden');
}
function closeWireManagerOutside(e) {
  if (e.target.id === 'wire-overlay') closeWireManager();
}
function renderWireList() {
  const list = document.getElementById('wire-list');
  if (!list) return;
  list.innerHTML = wires.map((w, i) => `
    <div class="wire-item" style="display:flex; justify-content:space-between; padding:8px; border-bottom:1px solid var(--border);">
      <span style="color:${w.color}; font-family:var(--font-mono); font-size:12px;">Wire ${i + 1}</span>
      <button onclick="deleteWire(${i}); renderWireList()" style="color:var(--rose); background:none; border:none; cursor:pointer;">Delete</button>
    </div>
  `).join('');
  if (wires.length === 0) list.innerHTML = '<div style="padding:16px; color:var(--text-muted); text-align:center;">No wires connected.</div>';
}
function deleteAllWires() {
  if (confirm('Delete all wires?')) {
    wires = [];
    updateWires();
    renderWireList();
  }
}
function deleteWire(index) {
  wires.splice(index, 1);
  updateWires();
}

// ─── INIT ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  workspace = document.getElementById('workspace');
  container = document.getElementById('components-container');
  wireLayer = document.getElementById('wire-layer');
  playPauseBtn = document.getElementById('btn-play-pause');
  clearBtn = document.getElementById('btn-clear');

  // Build parts bin
  buildPartsBin();
  buildTutorialSelector();
  renderWireColorBar();

  // Event listeners
  workspace.addEventListener('mousemove', handlePointerMove);
  workspace.addEventListener('touchmove', handlePointerMove, { passive: false });
  workspace.addEventListener('mouseup', handlePointerUp);
  workspace.addEventListener('touchend', handlePointerUp);
  workspace.addEventListener('click', e => { if (!activeWireStart) closeContextMenu(); });
  window.addEventListener('resize', updateWires);

  // Canvas Navigation Listeners (Zoom & Pan)
  workspace.addEventListener('wheel', handleWorkspaceWheel, { passive: false });
  workspace.addEventListener('mousedown', startWorkspacePan);
  workspace.addEventListener('touchstart', startWorkspacePan, { passive: false });

  document.addEventListener('mousemove', handleWorkspacePanAndZoom);
  document.addEventListener('touchmove', handleWorkspacePanAndZoom, { passive: false });

  document.addEventListener('mouseup', stopWorkspacePan);
  document.addEventListener('touchend', stopWorkspacePan);

  playPauseBtn.addEventListener('click', () => {
    simulationRunning = !simulationRunning;
    updatePlayButton();
  });

  clearBtn.addEventListener('click', () => {
    if (confirm('Clear all components and wires?')) {
      components = []; wires = []; container.innerHTML = ''; lastVoltages = [];
      updateWires();
      showToast('Workspace cleared', 'warn');
    }
  });

  document.getElementById('btn-voltage-labels')?.addEventListener('click', () => {
    showVoltageLabels = !showVoltageLabels;
    showToast(showVoltageLabels ? 'Voltage labels ON' : 'Voltage labels OFF', 'info');
  });

  document.getElementById('parts-search')?.addEventListener('input', e => filterParts(e.target.value));

  document.getElementById('btn-wires')?.addEventListener('click', openWireManager);
  initKeyboardShortcuts();
  switchMobileTab('workspace');
  switchTutorial('lead_acid');

  // Simulation loop
  setInterval(simulationTick, 100);
});
