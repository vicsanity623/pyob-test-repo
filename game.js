// Game State
let gameState = {
    id: 1, name: 'Bulbasaur', level: 5, xp: 0, maxXp: 100, 
    hearts: 2, attack: 10, defense: 10, maxHp: 50,
    berries: 5, lastInteraction: Date.now(),
    type: 'grass',
    moves: ['tackle', 'vineWhip'] // Starting moves
};

// Move Database
const moveDB = {
    tackle: { name: 'Tackle', type: 'normal', power: 10, color: 'bg-gray-500' },
    vineWhip: { name: 'Vine Whip', type: 'grass', power: 15, color: 'bg-green-600' },
    ember: { name: 'Ember', type: 'fire', power: 15, color: 'bg-red-500' },
    waterGun: { name: 'Water Gun', type: 'water', power: 15, color: 'bg-blue-500' }
};

// Type Effectiveness chart
function getTypeMultiplier(attackType, defendType) {
    if (attackType === 'fire' && defendType === 'grass') return 2;
    if (attackType === 'water' && defendType === 'fire') return 2;
    if (attackType === 'grass' && defendType === 'water') return 2;
    if (attackType === 'grass' && defendType === 'fire') return 0.5;
    if (attackType === 'fire' && defendType === 'water') return 0.5;
    if (attackType === 'water' && defendType === 'grass') return 0.5;
    return 1; // Normal damage
}

let enemyCurrentType = 'normal'; // Default fallback

// Heart Depletion Interval (Loses 1 heart every 60 seconds)
setInterval(() => {
    if (gameState.hearts > 0 && !document.getElementById('hub-screen').classList.contains('hidden')) {
        gameState.hearts--;
        gameState.lastInteraction = Date.now();
        updateHub();
    }
}, 60000);

// UI Elements
const screens = ['loading-screen', 'main-menu', 'intro-screen', 'hub-screen', 'battle-screen', 'evo-screen'];
function showScreen(id) {
    screens.forEach(s => document.getElementById(s).classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// Boot Sequence
window.onload = () => {
    setTimeout(() => {
        document.getElementById('loading-bar').style.width = '100%';
        setTimeout(() => {
            if(localStorage.getItem('pokeSave')) document.getElementById('btn-continue').classList.remove('hidden');
            showScreen('main-menu');
        }, 800);
    }, 500);
};

// Start or Continue
function startGame(isNew) {
    if(!isNew && localStorage.getItem('pokeSave')) {
        gameState = JSON.parse(localStorage.getItem('pokeSave'));
        
        // Backward compatibility for old saves
        if (gameState.berries === undefined) gameState.berries = 5;
        if (!gameState.lastInteraction) gameState.lastInteraction = Date.now();

        // Calculate offline heart depletion (1 heart lost per minute offline)
        let minutesOffline = Math.floor((Date.now() - gameState.lastInteraction) / 60000);
        if (minutesOffline > 0) {
            gameState.hearts = Math.max(0, gameState.hearts - minutesOffline);
            gameState.lastInteraction = Date.now();
        }

        updateHub();
        showScreen('hub-screen');
    } else {
        showScreen('intro-screen');
    }
}

// Story Sequence
let storyStep = 0;
const storyLines = [
    "Welcome to the world of Pokemon! Your dream to become a Master begins now.",
    "I am the Professor. I'm gifting you this Bulbasaur to start your journey!",
    "Take good care of it. Feed it, pet it, and battle to grow stronger!"
];
function nextStory() {
    storyStep++;
    if(storyStep >= storyLines.length) {
        updateHub();
        showScreen('hub-screen');
    } else {
        document.getElementById('story-text').innerText = storyLines[storyStep];
    }
}

// Update Hub UI
function updateHub() {
    document.getElementById('hub-name').innerText = gameState.name;
    document.getElementById('hub-level').innerText = gameState.level;
    document.getElementById('xp-bar').style.width = `${(gameState.xp / gameState.maxXp) * 100}%`;
    document.getElementById('hub-sprite').src = `assets/sprites/${gameState.id}_animated.gif`;
    
    // Fallback if script wasn't run or running on GH pages without assets downloaded:
    document.getElementById('hub-sprite').onerror = function() {
        this.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${gameState.id}.gif`;
    };

    // Draw Hearts
    let heartsHtml = '';
    for(let i=0; i<10; i++) {
        heartsHtml += `<span class="text-xl ${i < gameState.hearts ? 'text-red-500' : 'text-gray-600'}">♥</span>`;
    }
    document.getElementById('heart-container').innerHTML = heartsHtml;
    
    // Update Berries
    if(document.getElementById('berry-count')) {
        document.getElementById('berry-count').innerText = gameState.berries;
    }
    
    gameState.lastInteraction = Date.now();
    localStorage.setItem('pokeSave', JSON.stringify(gameState));
}

// Custom Native-feeling Modal & Vibration System
function showModal(title, text, vibratePattern = [50]) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-desc').innerText = text;
    
    const modal = document.getElementById('custom-modal');
    const content = document.getElementById('modal-content');
    
    modal.classList.remove('hidden');
    // Tiny delay to allow CSS to animate
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95');
        content.classList.add('scale-100');
    }, 10);

    // Trigger iPhone haptics if supported
    if (navigator.vibrate) {
        navigator.vibrate(vibratePattern);
    }
}

function closeModal() {
    const modal = document.getElementById('custom-modal');
    const content = document.getElementById('modal-content');
    
    modal.classList.add('opacity-0');
    content.classList.remove('scale-100');
    content.classList.add('scale-95');
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

// --- PETTING SWIRL MECHANIC ---
let touchTimer;
let isSwirling = false;
const spriteContainer = document.getElementById('sprite-container');
const hubSprite = document.getElementById('hub-sprite');

// Prevent image dragging which breaks touch on mobile
hubSprite.ondragstart = () => false;
spriteContainer.style.touchAction = 'none'; // Prevents page scrolling while swirling

function startSwirl(e) {
    e.preventDefault();
    isSwirling = true;
    touchTimer = setTimeout(() => {
        if(isSwirling) gainHeart();
    }, 2000); // Reduced to 2 seconds so it feels more responsive
}

function stopSwirl() {
    isSwirling = false;
    clearTimeout(touchTimer);
}

spriteContainer.addEventListener('touchstart', startSwirl, {passive: false});
spriteContainer.addEventListener('mousedown', startSwirl);
window.addEventListener('touchend', stopSwirl);
window.addEventListener('mouseup', stopSwirl);
window.addEventListener('touchcancel', stopSwirl);

function gainHeart() {
    if(gameState.hearts < 10) {
        gameState.hearts++;
        const effect = document.getElementById('swirl-effect');
        const sprite = document.getElementById('hub-sprite');
        effect.classList.add('animate-swirl');
        sprite.classList.add('flash-white');
        
        setTimeout(() => {
            effect.classList.remove('animate-swirl');
            sprite.classList.remove('flash-white');
            updateHub();
        }, 1000);
    }
}

function feedBerry() { 
    if (gameState.berries > 0) {
        if (gameState.hearts < 10) {
            gameState.berries--;
            gainHeart();
        } else {
            showModal(`${gameState.name} is completely full and happy!`);
        }
    } else {
        showModal("You don't have any berries left! Win battles to find more.");
    }
}

// --- XP AND MOOD SYSTEM ---
function addXP(baseXp) {
    let multiplier = 0;
    if (gameState.hearts <= 1) multiplier = 0; 
    else if (gameState.hearts <= 3) multiplier = 0.5; 
    else if (gameState.hearts <= 5) multiplier = 2; 
    else multiplier = 3; 

    if (multiplier === 0) {
        showModal(`${gameState.name} is in a bad mood and refuses! Pet it or feed it.`);
        updateHub();
        return;
    }

    let gainedXp = Math.floor(baseXp * multiplier);
    let newTotalXp = gameState.xp + gainedXp;

    if (newTotalXp >= gameState.maxXp) {
        // Step 1: Animate the bar visually to 100%
        document.getElementById('xp-bar').style.width = '100%';
        
        // Step 2: Wait 600ms for the CSS transition to finish, THEN level up
        setTimeout(() => {
            let leftoverXp = newTotalXp - gameState.maxXp;
            levelUp(leftoverXp); // Pass the overflow XP into the next level
        }, 600);
    } else {
        // Normal XP gain without leveling up
        gameState.xp = newTotalXp;
        updateHub();
    }
}

function levelUp(leftoverXp = 0) {
    gameState.level++;
    gameState.xp = leftoverXp; // Keep the extra XP earned
    gameState.maxXp = Math.floor(gameState.maxXp * 1.5);
    
    // Stat gains based on mood
    let statBuff = gameState.hearts >= 5 ? 1.10 : (gameState.hearts >= 3 ? 1.05 : 1.0);
    gameState.attack = Math.floor(gameState.attack * statBuff);
    gameState.defense = Math.floor(gameState.defense * statBuff);

    // Instantly snap XP bar back to 0 without animation
    let xpBar = document.getElementById('xp-bar');
    xpBar.style.transition = 'none';
    xpBar.style.width = '0%';

    // Wait 50ms, then turn animations back on and apply the new stats/leftover XP
    setTimeout(() => {
        xpBar.style.transition = 'all 0.5s ease';
        updateHub(); // This animates the bar to the leftover XP amount
        
        if (gameState.level > 10 && Math.random() > 0.5 && gameState.id === 1) {
            triggerEvolution(2, 'Ivysaur');
        } else {
            showModal(`${gameState.name} grew to Level ${gameState.level}!`);
        }
    }, 50);
}

// --- BATTLE SYSTEM ---
let battleInterval;
let eHp = 100;
let pHp = gameState.maxHp;

function enterBattle() {
    if(gameState.hearts <= 1) {
        showModal(`${gameState.name} is too sad to battle!`); return;
    }
    if(gameState.hearts <= 3 && Math.random() > 0.5) {
        showModal(`${gameState.name} refused to battle!`); return;
    }

    showScreen('battle-screen');
    eHp = 100; pHp = gameState.maxHp;
    
    // Load Wild Pokemon
    let wildId = Math.floor(Math.random() * 150) + 1;
    document.getElementById('enemy-sprite').src = `assets/sprites/${wildId}_animated.gif`;
    document.getElementById('enemy-sprite').onerror = function() {
        this.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${wildId}.gif`;
    };
    
    // Fetch Correct Name Dynamically
    document.getElementById('enemy-name').innerText = "Wild Pokemon"; // Temp fallback
    enemyCurrentType = 'normal'; 
    fetch(`https://pokeapi.co/api/v2/pokemon/${wildId}`)
        .then(res => res.json())
        .then(data => {
            let capitalized = data.name.charAt(0).toUpperCase() + data.name.slice(1);
            document.getElementById('enemy-name').innerText = "Wild " + capitalized;
            if(data.types.length > 0) enemyCurrentType = data.types[0].type.name;
        })
        .catch(err => console.log(err));

    // Generate Move Buttons based on what the Player knows
    let movesHtml = '';
    gameState.moves.forEach(moveId => {
        let move = moveDB[moveId];
        movesHtml += `<button onclick="playerAttack('${moveId}')" class="${move.color} rounded-xl font-bold text-xl text-white shadow-lg active:scale-95 transition-transform border-2 border-white/20 hover:brightness-110">${move.name}</button>`;
    });
    document.getElementById('battle-moves-ui').innerHTML = movesHtml;
    document.getElementById('battle-player-sprite').src = document.getElementById('hub-sprite').src;
    document.getElementById('battle-player-name').innerText = gameState.name;
    
    updateHealthBars();

    // AI Enemy Spamming Attacks
    battleInterval = setInterval(() => {
        pHp -= Math.floor(Math.random() * 5) + 2;
        updateHealthBars();
        if(pHp <= 0) endBattle(false);
    }, 1200);
}

function playerAttack(moveId) {
    let move = moveDB[moveId];
    let baseDmg = move.power + Math.floor(gameState.attack / 2);
    let multiplier = getTypeMultiplier(move.type, enemyCurrentType);
    
    let totalDmg = Math.floor(baseDmg * multiplier);

    if(gameState.hearts >= 5 && Math.random() < 0.05) totalDmg = 999;
    
    eHp -= totalDmg;
    updateHealthBars();
    
    const pSprite = document.getElementById('battle-player-sprite');
    const eSprite = document.getElementById('enemy-sprite');

    pSprite.classList.remove('anim-lunge');
    void pSprite.offsetWidth;
    pSprite.classList.add('anim-lunge');

    setTimeout(() => {
        eSprite.classList.remove('anim-shake', 'flash-white');
        void eSprite.offsetWidth;
        eSprite.classList.add('anim-shake', 'flash-white');
        if (navigator.vibrate) navigator.vibrate([50, 50]);

        let fct = document.createElement('div');
        fct.className = 'floating-text';
        fct.innerText = totalDmg >= 999 ? "KO!" : `-${totalDmg}`;
        
        if (multiplier > 1) { fct.innerText += "\nSuper!"; fct.classList.add('text-super'); }
        if (multiplier < 1) { fct.innerText += "\nWeak"; fct.classList.add('text-weak'); }
        
        document.getElementById('battle-screen').appendChild(fct);

        setTimeout(() => {
            fct.remove();
            eSprite.classList.remove('flash-white');
            if(eHp <= 0) endBattle(true);
        }, 1000);
    }, 150);
}

function updateHealthBars() {
    document.getElementById('player-hp').style.width = `${Math.max(0, (pHp/gameState.maxHp)*100)}%`;
    document.getElementById('enemy-hp').style.width = `${Math.max(0, (eHp/100)*100)}%`;
}

function endBattle(won) {
    clearInterval(battleInterval);
    if(won) {
        let lootMsg = "You won!";
        if (Math.random() < 0.40) {
            let foundBerries = Math.floor(Math.random() * 2) + 1; 
            gameState.berries += foundBerries;
            lootMsg += ` And found ${foundBerries} 🍓 Berry!`;
        }
        showModal(lootMsg);
        
        // Switch to hub FIRST, then trigger the XP animation
        showScreen('hub-screen');
        setTimeout(() => addXP(50), 300); // Small delay to let screen transition finish
    } else {
        showModal("You blacked out...");
        gameState.hearts = Math.max(0, gameState.hearts - 2); 
        updateHub();
        showScreen('hub-screen');
    }
}

// --- EVOLUTION SYSTEM ---
function triggerEvolution(newId, newName) {
    showScreen('evo-screen');
    document.getElementById('evo-old-name').innerText = gameState.name;
    document.getElementById('evo-sprite').src = document.getElementById('hub-sprite').src;
    
    setTimeout(() => {
        gameState.id = newId;
        gameState.name = newName;
        gameState.attack += 20;
        gameState.defense += 20;
        document.getElementById('evo-sprite').classList.remove('brightness-0', 'animate-pulse');
        document.getElementById('evo-sprite').src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${newId}.gif`;
        
        setTimeout(() => {
            showModal(`Your Pokemon evolved into ${newName}!`);
            updateHub();
            showScreen('hub-screen');
        }, 2000);
    }, 3000);
}
