// ============================================================================
// VISUAL EFFECTS & ANIMATIONS ENGINE (effects.js)
// ============================================================================

// --- 1. FLOATING COMBAT TEXT (DAMAGE / CRIT / SUPER / HEAL) ---
function spawnFloatingText(targetWrapperId, text, type = 'damage') {
    const container = document.getElementById(targetWrapperId);
    if (!container) return;

    const el = document.createElement('div');
    let colorClass = (type === 'heal') ? 'floating-heal' : ((type === 'crit' || type === 'super') ? 'floating-crit text-base' : 'floating-damage text-lg');
    el.className = `floating-combat-text ${colorClass}`;
    el.innerText = text;
    
    // Slight random offset so multi-hits don't stack directly on top of each other
    let randX = Math.floor(Math.random() * 24) - 12;
    el.style.left = `calc(50% + ${randX}px)`;
    el.style.top = '10%';

    container.appendChild(el);
    setTimeout(() => { if (el.parentNode) el.remove(); }, 950);
}

// --- 2. SPRITE HIT REACTION (SHAKE & STROBE FLASH) ---
function triggerHitReaction(spriteId) {
    const sprite = document.getElementById(spriteId);
    if (!sprite) return;
    sprite.classList.remove('hit-flash-effect');
    void sprite.offsetWidth; // Trigger DOM reflow to restart animation
    sprite.classList.add('hit-flash-effect');
    setTimeout(() => sprite.classList.remove('hit-flash-effect'), 450);
}

// --- 3. FANNED 20-BERRY CARD STACK RENDERER ---
function renderBerryStack() {
    const container = document.getElementById('berry-stack-container');
    if (!container) return;
    
    let count = gameState.gardenBerries || 0;
    container.innerHTML = '';

    if (count <= 0) {
        container.innerHTML = `<span class="text-2xl select-none">🌳</span>`;
        return;
    }

    // Fanning Spread Limits (Arched Playing-Card Math)
    let maxSpreadX = 14; // Horizontal span in pixels
    let maxAngle = 36;   // Total rotation fan spread in degrees (-18° to +18°)

    for (let i = 0; i < count; i++) {
        let ratio = count > 1 ? (i / (count - 1)) : 0.5;
        let xOffset = (ratio - 0.5) * maxSpreadX * 2;
        let rot = (ratio - 0.5) * maxAngle;
        let yArch = -Math.sin(ratio * Math.PI) * 4; // Creates an arched curve

        let berrySpan = document.createElement('span');
        berrySpan.innerText = '🍓';
        berrySpan.className = 'absolute text-2xl select-none pointer-events-none filter drop-shadow transition-all duration-300';
        berrySpan.style.zIndex = i + 1;
        berrySpan.style.transform = `translate(${xOffset.toFixed(1)}px, ${yArch.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`;
        
        container.appendChild(berrySpan);
    }
}

// --- 4. REAL-TIME ENVIRONMENT & DAY/NIGHT LIGHTING ---
function updateEnvironment() {
    const hour = new Date().getHours();
    const overlay = document.getElementById('time-overlay');
    if (!overlay) return;
    if (hour >= 6 && hour < 18) {
        overlay.className = 'absolute inset-0 pointer-events-none z-20 transition-colors duration-1000 time-day';
    } else if (hour >= 18 && hour < 20) {
        overlay.className = 'absolute inset-0 pointer-events-none z-20 transition-colors duration-1000 time-evening';
    } else {
        overlay.className = 'absolute inset-0 pointer-events-none z-20 transition-colors duration-1000 time-night';
    }
}

// Initialize environment lighting cycle
document.addEventListener('DOMContentLoaded', () => {
    updateEnvironment();
    setInterval(updateEnvironment, 60000);
});

// --- 5. PETTING INTERACTION & SWIRL TOUCH LOGIC ---
let touchTimer;
let isSwirling = false;

function initPettingControls() {
    const spriteContainer = document.getElementById('sprite-container');
    const hubSprite = document.getElementById('hub-sprite');
    if (!spriteContainer || !hubSprite) return;

    hubSprite.ondragstart = () => false;
    spriteContainer.style.touchAction = 'none';

    function startSwirl(e) {
        if (e.target.closest('#berry-bush')) return;
        e.preventDefault();
        isSwirling = true;
        touchTimer = setTimeout(() => {
            if (isSwirling && typeof gainHeart === 'function') gainHeart();
        }, 2000);
    }

    function stopSwirl() {
        isSwirling = false;
        clearTimeout(touchTimer);
    }

    spriteContainer.addEventListener('touchstart', startSwirl, { passive: false });
    spriteContainer.addEventListener('mousedown', startSwirl);
    window.addEventListener('touchend', stopSwirl);
    window.addEventListener('mouseup', stopSwirl);
    window.addEventListener('touchcancel', stopSwirl);
}

document.addEventListener('DOMContentLoaded', initPettingControls);