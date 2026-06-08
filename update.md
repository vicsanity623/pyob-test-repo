### Section 1: Technical & Architectural Summary

This project implements a web-based, real-time nodal analysis and simulation suite designed to run in a single client-side HTML file.

```
       ┌─────────────────────────────────────────────────────────┐
       │                  User Interface (HTML/CSS)              │
       │     (Workspace Canvas, Component Inventory, Guides)     │
       └───────────────────────────┬─────────────────────────────┘
                                   │ Pointer / Touch Interaction
                                   ▼
       ┌─────────────────────────────────────────────────────────┐
       │               Graph & Network Mapper                    │
       │       (Union-Find Disjoint Sets, Node Mapping)          │
       └───────────────────────────┬─────────────────────────────┘
                                   │ Netlist representation
                                   ▼
       ┌─────────────────────────────────────────────────────────┐
       │             Iterative Relaxation Solver                 │
       │  (Nodal analysis, dynamic G/V eff equations per step)  │
       └───────────────────────────┬─────────────────────────────┘
                                   │ Calculated state vectors
                                   ▼
       ┌─────────────────────────────────────────────────────────┐
       │                 Transient State Engine                  │
       │  (Companion models: Backward Euler, Ebers-Moll models)   │
       └─────────────────────────────────────────────────────────┘
```

#### Core Components of the Simulator:

1. **Union-Find Disjoint Sets (Network Mapping)**: 
   To identify connected wire networks, the application runs a Disjoint-Set union algorithm on every terminal coordinate on the canvas. This groups interconnected terminals into a finite set of unique electrical nodes. Node $0$ is designated as the system Reference Ground (tied to any available GND terminal or defaulted).

2. **Iterative Nodal Relaxation Solver**:
   Instead of solving large matrices using Gaussian elimination (which can be computationally expensive and prone to stability issues with highly non-linear components), this engine uses an iterative relaxation method (derived from Gauss-Seidel iteration). The voltage $V_i$ of each node is resolved iteratively based on the conductances ($G$) and effective voltages ($V^{eff}$) of its connected neighbors:
   $$V_i^{(new)} = \frac{\sum_{j} G_{ij} \cdot V_j^{eff}}{\sum_{j} G_{ij}}$$

3. **Dynamic Companion Modeling**:
   * **Capacitors**: Modeled using a transient companion system (Backward Euler method). At each time step $\Delta t$, the capacitor is represented as an equivalent conductance $G_{eq} = \frac{C}{\Delta t}$ in series with a voltage source equal to its historical charge voltage ($V_{cap}$). Current is calculated, and the charge state is integrated forward: $V_{cap}^{(new)} = V_{cap} + \frac{I \cdot \Delta t}{C}$.
   * **NPN/PNP Transistors**: Modeled using simplified Ebers-Moll threshold approximations. The Base-Emitter junction acts as a diode with a forward voltage drop ($V_{be} \approx 0.7\text{V}$). Collector-Emitter path conductance is modulated by the base current ($I_b$), functioning as a current-controlled resistance: $R_{ce} = \max\left(R_{min}, \frac{1}{\beta \cdot I_b}\right)$.
   * **N-Channel MOSFETs**: Modeled by tracking Gate-Source potential ($V_{gs}$). If $V_{gs}$ exceeds the threshold voltage, the Drain-Source resistance ($R_{ds}$) transitions dynamically from a high-impedance state ($1\text{M}\Omega$) to a low-resistance conduction state ($0.5\Omega$).

---


---

### Section 3: Project Architecture Guide

#### 1. Directory Structure

For deployment to **GitHub Pages**, organize your repository as follows:

```
├── index.html          <-- The main file containing all HTML, CSS, and JS engine code
├── manifest.json       <-- Progressive Web App configuration
└── sw.js               <-- Service Worker script for offline availability
```

---

#### 2. Service Worker (`sw.js`)

Create a file named `sw.js` in the root of your repository to enable offline operation:

```javascript
const CACHE_NAME = 'diy-workbench-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      return cachedResponse || fetch(e.request);
    })
  );
});
```

---

#### 3. Web App Manifest (`manifest.json`)

Create a file named `manifest.json` in the root of your repository to allow installation as a Progressive Web App on mobile devices:

```json
{
  "short_name": "DIY Workbench",
  "name": "DIY Electronics & Electrochemical Workbench",
  "icons": [
    {
      "src": "https://cdn-icons-png.flaticon.com/512/3135/3135715.png",
      "type": "image/png",
      "sizes": "512x512"
    }
  ],
  "start_url": "./index.html",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "display": "standalone",
  "orientation": "portrait"
}
```
