## DIY Electronics Workbench Pro: System Upgrades & Physics Documentation

This document compiles the session updates made to the workspace and describes the underlying mathematical laws of the real-time circuit simulation engine, with a specific focus on the physics of electrical storage components (batteries, chemical cells, and capacitors).

---

## Section 1: Overview of Workspace Upgrades

### 1.1 Responsive Mobile Safe-Area Adjustments (PWA)
* **The Issue**: On modern iOS devices with a top notch or dynamic island, full-viewport PWAs using `viewport-fit=cover` and `black-translucent` status bar styles caused the device indicators (time, battery, Wi-Fi) to overlap with the workbench header controls.
* **The Upgrade**: Modified the header in `style.css` to use CSS environment variables:
  ```css
  padding-top: env(safe-area-inset-top, 0px);
  height: calc(52px + env(safe-area-inset-top, 0px));
  ```
  This dynamically shifts the workbench buttons and title downwards only on notched devices, keeping the dark grid aesthetic flowing seamlessly underneath the status bar indicators.

### 1.2 Infinite Workspace Panning and Pinch-to-Zoom
* **The Upgrade**: Implemented an infinite 2D canvas transformation coordinate layer.
  * Added a CSS 2D affine transform matrix onto `#components-container` and `#wire-layer`.
  * Multi-touch trackpad scrolls and desktop mouse wheels are intercepted via `handleWorkspaceWheel` to calculate a responsive zoom focused directly on the user's mouse cursor.
  * Zoom and pan operations are automatically locked out while a wire is being drawn or a component card is being dragged, preventing frustrating viewport shifts.

### 1.3 UE5-Style Wire Reconnection and Detachment
* **The Upgrade**: Upgraded the wire manipulation tool to mimic modern professional node-graph workflows.
  * Clicking or tapping on a terminal node that already possesses an active connection immediately detaches the wire from that specific port.
  * The detached end is seamlessly converted into a live wiring preview following the mouse pointer.
  * Releasing the wire on a different terminal node establishes a new connection, while releasing it over empty space safely deletes the wire from the array, providing clean visual feedback.

### 1.4 Multi-Select Selection Box and Snapping
* **The Upgrade**: Left-clicking and dragging across empty workspace canvas creates a bounding selection rectangle.
  * Any components inside the boundaries are aggregated into a `selectedComponents` set.
  * Grabbing and moving any highlighted card moves the entire cluster of components cohesively while maintaining their relative spacing.
  * Upon releasing the drag, all selected components snap cleanly to the nearest **`24px`** interval matching your visual background grid.

### 1.5 Real-Time Telemetry HUD (Heads-Up Display)
* **The Upgrade**: Created a floating, translucent analytical HUD in the top-right corner of the workspace.
  * Clicking any card highlights its border and routes its operating parameters directly to the HUD.
  * Values update dynamically on every 100ms solver tick, displaying node voltages, current drops, and operating wattage.
  * Clicking on empty workspace canvas clears the active selection and returns the HUD to its monitoring state.

---

## Section 2: Component Layout & Visual Upgrades

### 2.1 Component Card Rotation
* **The Upgrade**: Cards can now be rotated in 90-degree steps via a dedicated `↻` button in their headers.
* **Text Preservation**: Rather than allowing title text and terminal indicators to flip upside down, we applied a CSS counter-rotation:
  ```css
  .term-node span, .compact-graphic text {
    transform: rotate(calc(-1 * var(--rotation, 0deg)));
  }
  ```
  This keeps all critical labeling upright and legible at all times, regardless of the card's rotation angle.

### 2.2 Compact "Breadboard/2D Blueprint" Mode
* **The Upgrade**: Toggling "Compact View" collapses the component cards down into physical, transparent 2D visual footprints.
* **Vector Footprints**: Generated distinct inline SVGs for all components:
  * **LEDs**: Top-down translucent colored bulbs.
  * **Resistors**: Standard axial packages showing their real-time color-coded bands.
  * **ICs**: Standard DIP (Dual In-line Package) footprints with accurate pin-outs.
  * **Batteries**: Vertical cylindrical cells with clear polarity indicators.
  * **Multimeter**: Handheld orange display meters displaying live voltage or current readouts inside the SVG.
* **Responsive Terminal Scaling**: Bound `--rel-x` and `--rel-y` properties to terminals, letting CSS scale and position them dynamically into their exact physical terminal ports when the card width reduces from `192px` to `100px`.

---

## Section 3: Physics Engine & Electricity Storage Math

The workbench simulation engine runs on a Modified Nodal Analysis (MNA) linear algebraic framework resolved iteratively via Gauss-Seidel relaxation. Storage devices (capacitors, batteries, and chemical cells) are modeled dynamically using transient companion models.

```
       Gauss-Seidel Solver Loop
     ┌──────────────────────────┐
     │  Solve Node Voltages     │ 
     │  Using Impedances        │
     └─────────────┬────────────┘
                   │
                   ▼  (At end of each 100ms tick)
     ┌──────────────────────────┐
     │  Update Storage States:  │
     │  - Integrate Cap Charge  │
     │  - Compute Battery SoC   │
     └──────────────────────────┘
```

### 3.1 Capacitor Companion Modeling
The capacitor is solved as a time-varying resistor ($R_{eq}$) in series with a voltage source ($V_{eq}$) derived using **Backward Euler numerical integration**:

$$R_{eq} = \frac{\Delta t}{C}$$

* **The Integration Fix**: Previously, the simulator incorrectly scaled the state update calculation by multiplying it by $\Delta t$ twice, causing the capacitor to charge $1000\times$ slower than it physically should. The current flowing through the capacitor branch is:
  $$I = \frac{V_{\text{terminal}} - V_{\text{stored}}}{R_{eq}}$$
  Replacing this with the corrected Backward Euler update ensures that the capacitor's internal voltage integrates accurately and charges at its physically correct rate:
  $$V_{\text{stored}} = V_{\text{terminal}}$$

---

### 3.2 Bidirectional Battery Chemistry
Batteries (such as the 18650 Li-ion, AA, D-cell, Lead-acid, and DIY cell) are modeled as non-linear voltage sources whose Open-Circuit Voltage (OCV) is a function of their State-of-Charge (SoC).

#### Open-Circuit Voltage (EMF)
The battery's internal Electromotive Force (EMF) scales linearly with its charge percentage ($0\%$ to $100\%$):
$$\text{EMF} = V_{\text{nominal}} \times \left(\frac{\text{SoC}}{100}\right)$$

#### Symmetrical Charge/Discharge Polarity
Current is mathematically calculated relative to the positive terminal:
$$I = \frac{\text{EMF} - (V_+ - V_-)}{R_{\text{int}}}$$

* **Discharging ($I > 0$)**: Current flows **out** of the positive terminal, indicating that the load is draining the cell.
* **Charging ($I < 0$)**: An external source (like the Bench PSU or Solar Panel) is applying a higher voltage than the battery's EMF. Current flows **into** the positive terminal, replenishing the cell up to $100\%$.

#### Numerical Stability and Stiffness Damping
When high-conductivity batteries (such as the 18650 with $R_{\text{int}} = 0.04\Omega$) are connected in parallel, the combined resistance is extremely low ($0.08\Omega$). 

A simple numerical integration step with a large current ($I = \frac{\Delta V}{R}$) would cause the calculation to overshoot the equilibrium point on every tick, creating rapid charge oscillations that quickly drain the system. To prevent this, we introduced a safe minimum resistance for the numerical integration step:
$$R_{\text{safe}} = \max(0.5\Omega, R_{\text{int}})$$
$$I_{\text{damped}} = \frac{\text{EMF} - (V_+ - V_-)}{R_{\text{safe}}}$$
This allows parallel batteries to balance smoothly and reach a steady state without losing energy.

#### Open-Circuit Idle Filtering
When a battery is disconnected, its terminals float. In numerical analysis, isolated nodes are assigned $0\text{V}$ relative to the ground reference. 

If left unhandled, the simulator would evaluate $(V_+ - V_-) = 0$, leading to a massive phantom current:
$$I = \frac{\text{EMF} - 0}{R_{\text{safe}}}$$
We implemented a wire-checking filter that inspects the connection array:
$$\text{isConnected} = \text{wires.some}(+) \land \text{wires.some}(-)$$
If a battery has any open terminals, the current is forced to exactly **$0.0\text{ mA}$**, allowing disconnected cells to maintain their charge indefinitely.

#### Physical Capacity-Based Charge Decay
Rather than using arbitrary decay rates, the battery drains according to its actual capacity rating in milliampere-hours ($\text{mAh}$):

$$\Delta Q = I \times \Delta t \text{ (Coulombs)}$$
$$Q_{\text{total}} = C_{\text{capacity}} \times 10^{-3} \times 3600 \text{ (Coulombs)}$$
$$\Delta \% = \frac{\Delta Q}{Q_{\text{total}}} \times 100\% = \frac{I \times 2.778}{C_{\text{capacity}}}\%$$

To ensure that the simulation remains visually engaging during active play, we apply a **Time Dilation Factor** (e.g., $300\times$) so that you can observe physical battery drainage under load over minutes rather than days:
$$\Delta \%_{\text{sim}} = \left(\frac{I \times 2.778}{C_{\text{capacity}}}\right) \times \text{DilationMultiplier}$$
