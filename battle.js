// ============================================================================
// BATTLE ENGINE & COMBAT SYSTEM (battle.js)
// ============================================================================

// (Spawn pools and battle state variables are loaded globally from global.js)

// --- ELEMENTAL TYPE BADGE RENDERER ---
function updateTypeBadge(elementId, typeKey) {
    const badge = document.getElementById(elementId);
    if (!badge) return;
    const typeInfo = TYPE_DATABASE[typeKey] || TYPE_DATABASE.normal;
    badge.innerText = `${typeInfo.name} ${typeInfo.icon}`;
    badge.className = `text-[9px] px-2 py-0.5 rounded-full font-black uppercase shadow-md ${typeInfo.bg}`;
}

// --- OFFICIAL 18-TYPE EFFECTIVENESS CALCULATOR ---
function getTypeMultiplier(moveTypeKey, defenderTypeKey) {
    const moveInfo = TYPE_DATABASE[moveTypeKey] || TYPE_DATABASE.normal;
    const defenderInfo = TYPE_DATABASE[defenderTypeKey] || TYPE_DATABASE.normal;

    if (moveInfo.superVs.includes(defenderTypeKey)) return 2.0; // 2x Super Effective!
    if (defenderInfo.weakVs && !defenderInfo.weakVs.includes(moveTypeKey) && moveTypeKey !== 'normal') {
        if (moveTypeKey === defenderTypeKey) return 0.5; // Same type resistance
    }
    if (moveTypeKey === 'normal') return 1.0;
    return 1.0;
}

// --- DYNAMIC MOVESET DISPATCHER ---
function updateBattleMoveButtons() {
    const pType = gameState.type || 'grass';
    const typeData = TYPE_DATABASE[pType] || TYPE_DATABASE.grass;

    // Slot 0 (Physical Basic)
    const btn0 = document.getElementById('btn-move-0');
    if (btn0) {
        document.getElementById('move-name-0').innerText = typeData.moves[0].name;
        document.getElementById('move-type-0').innerText = typeData.moves[0].desc;
        btn0.disabled = false;
    }

    // Slot 1 (Status Debuff with 4-Turn Cooldown Engine)
    const btn1 = document.getElementById('btn-move-1');
    if (btn1) {
        if (statusCooldown > 0) {
            btn1.disabled = true;
            document.getElementById('move-name-1').innerText = `⏳ ${typeData.moves[1].name} (${statusCooldown})`;
            document.getElementById('move-type-1').innerText = `Cooldown (${statusCooldown}T)`;
        } else {
            btn1.disabled = false;
            document.getElementById('move-name-1').innerText = typeData.moves[1].name;
            document.getElementById('move-type-1').innerText = typeData.moves[1].desc;
        }
    }

    // Slot 2 (Lv. 7 Elemental Special)
    const btn2 = document.getElementById('btn-move-2');
    if (btn2) {
        if (gameState.level >= 7) {
            btn2.disabled = false;
            document.getElementById('move-name-2').innerText = typeData.moves[2].name;
            document.getElementById('move-type-2').innerText = typeData.moves[2].desc;
        } else {
            btn2.disabled = true;
            document.getElementById('move-name-2').innerText = `🔒 ${typeData.moves[2].name}`;
            document.getElementById('move-type-2').innerText = "Unlocks Lv. 7";
        }
    }

    // Slot 3 (Lv. 13 Elemental Ultimate)
    const btn3 = document.getElementById('btn-move-3');
    if (btn3) {
        if (gameState.level >= 13) {
            btn3.disabled = false;
            document.getElementById('move-name-3').innerText = typeData.moves[3].name;
            document.getElementById('move-type-3').innerText = typeData.moves[3].desc;
        } else {
            btn3.disabled = true;
            document.getElementById('move-name-3').innerText = `🔒 ${typeData.moves[3].name}`;
            document.getElementById('move-type-3').innerText = "Unlocks Lv. 13";
        }
    }
}

function setAttackButtonsDisabled(disabled) {
    if (disabled) {
        const btns = document.querySelectorAll('#move-grid button');
        btns.forEach(btn => { btn.disabled = true; });
    } else {
        updateBattleMoveButtons();
    }
}

function setBattleLog(msg) {
    const logEl = document.getElementById('battle-log');
    if (logEl) logEl.innerText = msg;
}

// --- STAGE NAVIGATOR FUNCTION ---
function changeStage(delta) {
    let targetStage = gameState.currentStage + delta;
    if (targetStage >= 1 && targetStage <= gameState.maxStage) {
        gameState.currentStage = targetStage;
        updateHub();
        enterBattle(); // Re-rolls an enemy matching the chosen stage!
    }
}

function updateStageNavigatorUI() {
    const stageText = document.getElementById('stage-indicator');
    const stageMax = document.getElementById('stage-max-indicator');
    const btnPrev = document.getElementById('btn-prev-stage');
    const btnNext = document.getElementById('btn-next-stage');

    if (stageText && stageMax) {
        let isBossStage = (gameState.currentStage % 5 === 0);
        stageText.innerText = isBossStage ? `👑 BOSS STAGE ${gameState.currentStage}` : `STAGE ${gameState.currentStage}`;
        stageText.className = isBossStage ? "text-xs font-black text-pink-400 animate-pulse tracking-wider" : "text-xs font-black text-yellow-400 tracking-wider";
        stageMax.innerText = `(Max: ${gameState.maxStage})`;
        
        // Disable buttons at boundaries
        if (btnPrev) btnPrev.disabled = (gameState.currentStage <= 1);
        if (btnNext) btnNext.disabled = (gameState.currentStage >= gameState.maxStage);
    }
}

// --- ENTER BATTLE ---
function enterBattle() {
    if(gameState.hearts <= 1) {
        showModal(`${gameState.name} is too sad to battle!`); return;
    }
    if(gameState.hearts <= 3 && Math.random() > 0.5) {
        showModal(`${gameState.name} refused to battle!`); return;
    }

    showScreen('battle-screen');
    enemyLevel = gameState.currentStage;

    // --- BOSS CHECK (Every 5 Levels) ---
    isBoss = (enemyLevel % 5 === 0);

    // --- COMPOUND EXPONENTIAL ENEMY SCALING ---
    let levelDiff = Math.max(0, enemyLevel - 3);
    eMaxHp = Math.floor(60 * Math.pow(1.085, levelDiff));
    enemyAttack = Math.floor(6 * Math.pow(1.07, levelDiff));
    enemyDefense = Math.floor(4 * Math.pow(1.06, levelDiff));

    if (isBoss) {
        eMaxHp = Math.floor(eMaxHp * 2.5);
        enemyAttack = Math.floor(enemyAttack * 1.3);
        enemyDefense = Math.floor(enemyDefense * 1.5);
    }

    eHp = eMaxHp;
    pHp = gameState.maxHp;
    
    // Reset Battle Stats & Cooldowns for New Encounter
    battleDamageDealt = 0;
    battleDamageReceived = 0;
    statusCooldown = 0;
    setAttackButtonsDisabled(false);

    // --- CALCULATE & DISPLAY BATTLE CP BADGES ---
    let playerCP = (gameState.maxHp || 0) + (gameState.attack || 0) + (gameState.defense || 0) + (gameState.spAtk || 0) + (gameState.spDef || 0) + (gameState.speed || 0);
    let enemyCP = eMaxHp + Math.floor(enemyAttack * 1.5) + Math.floor(enemyDefense * 1.5) + Math.floor(enemyLevel * 2);

    const playerCpEl = document.getElementById('battle-player-cp');
    const enemyCpEl = document.getElementById('battle-enemy-cp');
    if (playerCpEl) playerCpEl.innerText = `CP ${formatNumber(playerCP)}`;
    if (enemyCpEl) enemyCpEl.innerText = `CP ${formatNumber(enemyCP)}`;

    updateStageNavigatorUI();

    // Update Player Type & Enemy Type Badges
    updateTypeBadge('player-type-badge', gameState.type || 'grass');

    const allTypes = Object.keys(TYPE_DATABASE);
    // Deterministic fallback type matching the stage
    enemyType = allTypes[(enemyLevel * 3) % allTypes.length];
    updateTypeBadge('enemy-type-badge', enemyType);

    // --- STAGE-LOCKED SPAWN ENGINE (100% PERSISTENT PER STAGE) ---
    let wildId;
    if (enemyLevel === 100) {
        wildId = 150; // 👑 LEVEL 100 FINAL BOSS: MEWTWO
        isBoss = true;
    } else if (enemyLevel === 90) {
        wildId = 151; // 🌟 LEVEL 90 MYTHICAL BOSS: MEW
        isBoss = true;
    } else if (enemyLevel === 80) {
        wildId = 146; // 🔥 LEVEL 80 BOSS: MOLTRES
        isBoss = true;
    } else if (enemyLevel === 70) {
        wildId = 145; // ⚡ LEVEL 70 BOSS: ZAPDOS
        isBoss = true;
    } else if (enemyLevel === 60) {
        wildId = 144; // ❄️ LEVEL 60 BOSS: ARTICUNO
        isBoss = true;
    } else if (isBoss) {
        // Boss stages are deterministically locked to a specific evolved Pokémon!
        let bossIndex = (enemyLevel * 7) % EVOLVED_BOSS_IDS.length;
        wildId = EVOLVED_BOSS_IDS[bossIndex];
    } else {
        // Regular stages are permanently locked to a specific Base Pokémon!
        let baseIndex = (enemyLevel * 13 + 5) % BASE_POKEMON_IDS.length;
        wildId = BASE_POKEMON_IDS[baseIndex];
    }

    document.getElementById('enemy-sprite').src = `assets/sprites/${wildId}_animated.gif`;
    document.getElementById('enemy-sprite').onerror = function() {
        this.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/versions/generation-v/black-white/animated/${wildId}.gif`;
    };

    enemyBaseName = isBoss ? "👑 BOSS" : "Wild Pokemon";
    document.getElementById('enemy-name').innerText = `${enemyBaseName} (Lv. ${enemyLevel})`;
    
    currentWildData = { id: wildId, name: "Wild Pokemon", level: enemyLevel };

    fetch(`https://pokeapi.co/api/v2/pokemon/${wildId}`)
        .then(res => res.json())
        .then(data => {
            let capitalized = data.name.charAt(0).toUpperCase() + data.name.slice(1);
            enemyBaseName = isBoss ? `👑 BOSS ${capitalized}` : `Wild ${capitalized}`;
            currentWildData.name = capitalized;
            document.getElementById('enemy-name').innerText = `${enemyBaseName} (Lv. ${enemyLevel})`;
            
            if (data.types && data.types[0]) {
                enemyType = data.types[0].type.name.toLowerCase();
                if (!TYPE_DATABASE[enemyType]) enemyType = 'normal';
                updateTypeBadge('enemy-type-badge', enemyType);
            }
        })
        .catch(err => console.log(err));

    document.getElementById('battle-player-sprite').src = document.getElementById('hub-sprite').src;
    document.getElementById('battle-player-name').innerText = `${gameState.name} (Lv. ${gameState.level})`;

    // Update Pokeball badge in battle
    const pbBadge = document.getElementById('pokeball-count-badge');
    if (pbBadge) pbBadge.innerText = gameState.pokeballs || 0;

    setBattleLog(isBoss ? `⚠️ WARNING: A POWERFUL BOSS APPEARED!` : `A wild foe appeared!`);
    updateHealthBars();
}

// --- CATCH MECHANIC ---
function throwPokeBall() {
    if (!gameState.pokeballs || gameState.pokeballs <= 0) {
        showModal("Out of Pokéballs!", "You don't have any Pokéballs left! Win boss battles to find more.");
        return;
    }

    setAttackButtonsDisabled(true);
    gameState.pokeballs--;
    const pbBadge = document.getElementById('pokeball-count-badge');
    if (pbBadge) pbBadge.innerText = gameState.pokeballs;

    setBattleLog(`You threw a Pokéball at ${enemyBaseName}!`);
    if (navigator.vibrate) navigator.vibrate([30, 100, 30]);

    setTimeout(() => {
        // Higher catch rate when enemy HP is low! (Up to 85% chance)
        let hpMissingPercent = (eMaxHp - eHp) / eMaxHp;
        let catchChance = 0.25 + (hpMissingPercent * 0.60);
        if (isBoss) catchChance *= 0.6; // Bosses are harder to catch

        if (Math.random() < catchChance) {
            // SUCCESSFUL CATCH!
            setBattleLog(`Gotcha! ${enemyBaseName} was caught! 🎉`);
            
            // --- FRESH LEVEL 1 COMPANION WITH RNG STAT VARIATION ---
            let cleanName = currentWildData.name.replace('Wild ', '').replace('👑 BOSS ', '');
            
            // Individual RNG rolls (Base Stat IV variation)
            let rollHp = 38 + Math.floor(Math.random() * 9);      // 38 - 46 HP
            let rollAtk = 4 + Math.floor(Math.random() * 5);      // 4 - 8 Attack
            let rollDef = 4 + Math.floor(Math.random() * 5);      // 4 - 8 Defense
            let rollSpAtk = 5 + Math.floor(Math.random() * 5);    // 5 - 9 Sp. Atk
            let rollSpDef = 5 + Math.floor(Math.random() * 5);    // 5 - 9 Sp. Def
            let rollSpd = 4 + Math.floor(Math.random() * 5);      // 4 - 8 Speed
            let rollCrit = parseFloat((4.5 + Math.random() * 1.5).toFixed(2)); // 4.50% - 6.00% Crit

            let caughtPokemon = {
                id: currentWildData.id,
                name: cleanName,
                type: enemyType || 'normal',
                level: 1,
                maxHp: rollHp,
                attack: rollAtk,
                defense: rollDef,
                spAtk: rollSpAtk,
                spDef: rollSpDef,
                speed: rollSpd,
                critRate: rollCrit,
                xp: 0,
                maxXp: 50
            };

            if (!gameState.roster) gameState.roster = [];
            gameState.roster.push(caughtPokemon);

            let totalPower = rollHp + rollAtk + rollDef + rollSpAtk + rollSpDef + rollSpd;

            setTimeout(() => {
                let catchCard = `
                    <div class='bg-gray-900/80 p-3.5 rounded-xl border border-indigo-500/40 text-left text-xs space-y-1.5 mt-2 shadow-inner'>
                        <div class='flex justify-between items-center pb-1 border-b border-gray-700'>
                            <span class='font-bold text-white text-sm'>${caughtPokemon.name}</span>
                            <span class='text-yellow-400 font-black'>Lv. 1 Baseline</span>
                        </div>
                        <div class='grid grid-cols-2 gap-2 text-gray-300 pt-1'>
                            <div>💚 HP: <strong class='text-green-400'>${rollHp}</strong></div>
                            <div>⚡ SPD: <strong class='text-yellow-400'>${rollSpd}</strong></div>
                            <div>❤️ ATK: <strong class='text-red-400'>${rollAtk}</strong></div>
                            <div>💜 SP.ATK: <strong class='text-purple-400'>${rollSpAtk}</strong></div>
                            <div>💙 DEF: <strong class='text-blue-400'>${rollDef}</strong></div>
                            <div>🔮 SP.DEF: <strong class='text-indigo-400'>${rollSpDef}</strong></div>
                        </div>
                        <div class='pt-2 border-t border-gray-700 text-center text-orange-400 font-bold'>
                            Total Base Power: ⚡${totalPower} CP
                        </div>
                    </div>
                `.trim();

                showModal("🎉 POKÉMON CAUGHT!", catchCard, [40, 80, 40]);
                endBattle(true);
            }, 1000);
        } else {
            // FAILED CATCH
            setBattleLog(`Oh no! ${enemyBaseName} broke free!`);
            setTimeout(enemyTurn, 1000);
        }
    }, 1200);
}

// (spawnFloatingText & triggerHitReaction are loaded from effects.js)

// --- PLAYER ATTACK ---
function playerAttack(slot = 0) {
    setAttackButtonsDisabled(true);

    const pType = gameState.type || 'grass';
    const typeData = TYPE_DATABASE[pType] || TYPE_DATABASE.normal;
    
    // Support string fallbacks for unit tests
    let moveIndex = (typeof slot === 'number') ? slot : (slot === 'growl' ? 1 : (slot === 'vinewhip' ? 2 : (slot === 'leechseed' || slot === 'razorleaf' ? 3 : 0)));
    const move = typeData.moves[moveIndex];

    // --- 1. MISS CHANCE (0.5% Chance to Miss) ---
    if (typeof slot === 'number' && Math.random() < 0.005) {
        setBattleLog(`💨 ${gameState.name}'s ${move.name} MISSED!`);
        spawnFloatingText('enemy-sprite-wrapper', '💨 MISSED!', 'heal');
        setTimeout(enemyTurn, 1000);
        return;
    }

    let multiplier = (move.type === 'physical' || move.type === 'status') ? 1.0 : getTypeMultiplier(pType, enemyType);
    let typeEffectText = "";
    
    if (multiplier === 2.0) {
        typeEffectText = " 🔥 SUPER EFFECTIVE (2x)!";
        const fx = document.getElementById('elemental-fx');
        if (fx) {
            fx.classList.remove('hidden');
            setTimeout(() => fx.classList.add('hidden'), 450);
        }
        if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
    } else if (multiplier === 0.5) {
        typeEffectText = " 💧 Not very effective (0.5x)...";
    }

    // --- 2. CRITICAL HIT CALCULATION ---
    let isCrit = (typeof slot === 'number') && (move.type !== 'status') && ((Math.random() * 100) < (gameState.critRate || 5.0));

    // --- COOLDOWN TRACKING ---
    if (move.type === 'status') {
        statusCooldown = 4;
    } else if (statusCooldown > 0) {
        statusCooldown--;
    }

    let damage = 0;

    if (move.type === 'status') {
        // --- SLOT 1: STATUS DEBUFF ---
        enemyAttack = Math.max(1, enemyAttack - 2);
        enemyDefense = Math.max(0, enemyDefense - 4);
        setBattleLog(`${gameState.name} used ${move.name}! Enemy stats were shredded! (4T Cooldown)`);

    } else if (move.type === 'special') {
        // --- SLOT 2: ELEMENTAL SPECIAL ---
        let defenseMitigation = Math.floor(enemyDefense / 5);
        let baseDmg = Math.max(1, Math.floor(gameState.spAtk * move.power) - defenseMitigation);
        let rawDmg = isCrit ? Math.floor(baseDmg * 1.75) : baseDmg;
        damage = Math.max(1, Math.floor(rawDmg * multiplier));
        eHp -= damage;
        setBattleLog(`${isCrit ? '💥 CRIT! ' : ''}${move.name} hit for ${damage} Sp. Dmg!${typeEffectText}`);

    } else if (move.type === 'ultimate') {
        // --- SLOT 3: ULTIMATE MOVE ---
        let defenseMitigation = Math.floor(enemyDefense / 6);
        let baseDmg = Math.max(1, Math.floor((gameState.attack + gameState.spAtk) * move.power * 0.7) - defenseMitigation);
        let rawDmg = isCrit ? Math.floor(baseDmg * 1.75) : baseDmg;
        damage = Math.max(1, Math.floor(rawDmg * multiplier));
        
        if (pType === 'grass' || pType === 'poison') {
            let heal = Math.max(1, Math.floor(damage * 0.5));
            pHp = Math.min(gameState.maxHp, pHp + heal);
            setBattleLog(`${isCrit ? '💥 CRIT! ' : ''}${move.name} dealt ${damage} dmg & drained ${heal} HP!${typeEffectText}`);
        } else {
            setBattleLog(`${isCrit ? '💥 CRIT! ' : ''}${move.name} blasted foe for ${damage} Damage!${typeEffectText}`);
        }
        eHp -= damage;

    } else {
        // --- SLOT 0: BASIC PHYSICAL ATTACK ---
        let defenseMitigation = Math.floor(enemyDefense / 4);
        let baseDmg = Math.max(1, gameState.attack - defenseMitigation);
        damage = isCrit ? Math.floor(baseDmg * 1.75) : baseDmg;
        eHp -= damage;
        setBattleLog(`${isCrit ? '💥 CRIT! ' : ''}${gameState.name} used ${move.name} for ${damage} damage!`);
    }

    // Accumulate damage
    if (damage > 0) {
        battleDamageDealt += damage;
    }

    // --- TRIGGER FLOATING TEXT & REACTION ---
    if (move.type !== 'status') {
        triggerHitReaction('enemy-sprite');
        spawnFloatingText('enemy-sprite-wrapper', `-${damage}`, isCrit ? 'crit' : ((multiplier === 2.0) ? 'super' : 'damage'));

        if (isCrit) {
            setTimeout(() => spawnFloatingText('enemy-sprite-wrapper', '💥 CRITICAL HIT!', 'crit'), 120);
        } else if (multiplier === 2.0) {
            setTimeout(() => spawnFloatingText('enemy-sprite-wrapper', '🔥 SUPER EFFECTIVE!', 'super'), 120);
        } else if (multiplier === 0.5) {
            setTimeout(() => spawnFloatingText('enemy-sprite-wrapper', '💧 RESISTED (0.5x)', 'damage'), 120);
        }

        if (move.type === 'ultimate' && (pType === 'grass' || pType === 'poison')) {
            let healAmt = Math.max(1, Math.floor(damage * 0.5));
            spawnFloatingText('player-sprite-wrapper', `+${healAmt} HP`, 'heal');
        }
    } else {
        spawnFloatingText('enemy-sprite-wrapper', '🔻 STATS DROP', 'crit');
    }

    updateHealthBars();

    if (eHp <= 0) {
        setBattleLog(`${enemyBaseName} fainted!`);
        setTimeout(() => endBattle(true), 800);
        return;
    }

    setTimeout(enemyTurn, 1000);
}

// --- ENEMY TURN ---
function enemyTurn() {
    const pType = gameState.type || 'grass';
    const eTypeData = TYPE_DATABASE[enemyType] || TYPE_DATABASE.normal;

    // --- ENEMY MISS CHANCE (0.5% Chance) ---
    if (Math.random() < 0.005) {
        setBattleLog(`💨 ${enemyBaseName}'s attack MISSED!`);
        spawnFloatingText('player-sprite-wrapper', '💨 DODGED!', 'heal');
        setAttackButtonsDisabled(false);
        return;
    }

    // Pick a Real Named Move based on Enemy Level
    let availableMoveCount = enemyLevel >= 13 ? 4 : (enemyLevel >= 7 ? 3 : 2);
    let moveIndex = Math.floor(Math.random() * availableMoveCount);
    let chosenMove = eTypeData.moves[moveIndex];

    // Base Damage & Enemy Crit (3% chance)
    let isEnemyCrit = (Math.random() * 100) < 3.0;
    let baseDamage = Math.max(1, enemyAttack - Math.floor(gameState.defense / 4));
    if (chosenMove.type === 'special' || chosenMove.type === 'ultimate') {
        baseDamage = Math.floor(baseDamage * (chosenMove.power || 1.35));
    }
    if (isEnemyCrit) {
        baseDamage = Math.floor(baseDamage * 1.5); // 1.5x enemy crit
    }

    // 18-Type Matchup against Player
    let enemyMultiplier = getTypeMultiplier(enemyType, pType);
    let damage = baseDamage;
    let enemyEffectText = "";

    if (enemyMultiplier === 2.0) {
        damage = Math.max(1, Math.floor(baseDamage * 1.4));
        enemyEffectText = " 🔥 Super effective on you!";
    } else if (enemyMultiplier === 0.5) {
        damage = Math.max(1, Math.floor(baseDamage * 0.7));
        enemyEffectText = " 🛡️ You resisted the hit!";
    }

    pHp -= damage;
    battleDamageReceived += damage;
    setBattleLog(`${isEnemyCrit ? '💥 CRIT! ' : ''}${enemyBaseName} used ${chosenMove.name} for ${damage} damage!${enemyEffectText}`);
    
    // Player Hit Reaction & Floating Text
    triggerHitReaction('battle-player-sprite');
    spawnFloatingText('player-sprite-wrapper', `-${damage}`, isEnemyCrit ? 'crit' : ((enemyMultiplier === 2.0) ? 'super' : 'damage'));
    
    if (isEnemyCrit) {
        setTimeout(() => spawnFloatingText('player-sprite-wrapper', '💥 CRITICAL HIT!', 'crit'), 120);
    } else if (enemyMultiplier === 2.0) {
        setTimeout(() => spawnFloatingText('player-sprite-wrapper', '🔥 SUPER EFFECTIVE!', 'super'), 120);
    } else if (enemyMultiplier === 0.5) {
        setTimeout(() => spawnFloatingText('player-sprite-wrapper', '🛡️ RESISTED!', 'heal'), 120);
    }

    updateHealthBars();

    if (pHp <= 0) {
        setBattleLog(`${gameState.name} fainted!`);
        setTimeout(() => endBattle(false), 800);
    } else {
        setAttackButtonsDisabled(false);
    }
}

function updateHealthBars() {
    let playerPercent = Math.max(0, (pHp / gameState.maxHp) * 100);
    let enemyPercent = Math.max(0, (eHp / eMaxHp) * 100);

    const playerHpBar = document.getElementById('player-hp');
    const enemyHpBar = document.getElementById('enemy-hp');

    if (playerHpBar) playerHpBar.style.width = `${playerPercent}%`;
    if (enemyHpBar) enemyHpBar.style.width = `${enemyPercent}%`;

    const playerHpText = document.getElementById('player-hp-text');
    if (playerHpText) {
        playerHpText.innerText = `${formatNumber(Math.max(0, pHp))} / ${formatNumber(gameState.maxHp)} HP`;
    }

    const enemyHpText = document.getElementById('enemy-hp-text');
    if (enemyHpText) {
        enemyHpText.innerText = `${formatNumber(Math.max(0, eHp))} / ${formatNumber(eMaxHp)} HP`;
    }
}

// --- END BATTLE (VICTORY / DEFEAT / REWARDS) ---
function endBattle(won) {
    if(won) {
        let beatenStage = gameState.currentStage;
        let isNewRecord = (gameState.currentStage === gameState.maxStage);

        // Advance stage if player beat their highest unlocked stage
        if (isNewRecord) {
            gameState.maxStage++;
            gameState.currentStage++; 
        }

        // 1. Calculate Dynamic Stage-Scaled XP (50% XP for Replay Farming!)
        let baseStageXp = Math.floor(10 + (beatenStage * 2.5));
        let replayTag = "";

        if (!isNewRecord) {
            baseStageXp = Math.max(5, Math.floor(baseStageXp * 0.5)); // <-- 50% XP for Replaying Old Stages!
            replayTag = " <span class='text-[10px] text-yellow-300'>(Replay: 50% XP)</span>";
        }

        let multiplier = (gameState.hearts <= 1) ? 0 : (gameState.hearts <= 3 ? 0.5 : (gameState.hearts <= 5 ? 2 : 3));
        let earnedXp = Math.floor(baseStageXp * multiplier);

        // 2. Calculate Loot Drops (XL Slicers & Jackpots Locked to First-Time Clears Only!)
        let drops = [];
        if (!gameState.pokeballs) gameState.pokeballs = 0;
        if (!gameState.items) gameState.items = { hpXL: 0, atkXL: 0, defXL: 0, spAtkXL: 0, spDefXL: 0, speedXL: 0, critXL: 0 };

        const xlKeys = Object.keys(XL_ITEM_CONFIG);

        if (isBoss) {
            if (isNewRecord) {
                // --- 👑 FIRST TIME BOSS VICTORY JACKPOT (ONE-TIME REWARD) ---
                let isMilestoneBoss = (beatenStage % 25 === 0);
                let bossBalls = isMilestoneBoss ? (Math.floor(Math.random() * 3) + 3) : (Math.floor(Math.random() * 2) + 1);
                let bossBerries = Math.floor(Math.random() * 3) + 3;

                gameState.berries += bossBerries;
                gameState.pokeballs += bossBalls;

                drops.push(`<span class='text-pink-400 font-bold'>+${bossBerries} 🍓 Berries</span>`);
                drops.push(`<span class='text-red-400 font-bold'>+${bossBalls} 🔴 Pokéballs</span>`);

                // ONE-TIME Guaranteed XL Stat Slicer!
                let randomXL = xlKeys[Math.floor(Math.random() * xlKeys.length)];
                gameState.items[randomXL] = (gameState.items[randomXL] || 0) + 1;
                drops.push(`<span class='text-yellow-400 font-bold'>+1 ${XL_ITEM_CONFIG[randomXL].icon} ${XL_ITEM_CONFIG[randomXL].name} (First Clear!)</span>`);

                if (isMilestoneBoss) {
                    let bonusXL = xlKeys[Math.floor(Math.random() * xlKeys.length)];
                    gameState.items[bonusXL] = (gameState.items[bonusXL] || 0) + 1;
                    drops.push(`<span class='text-yellow-400 font-bold'>+1 ${XL_ITEM_CONFIG[bonusXL].icon} ${XL_ITEM_CONFIG[bonusXL].name}</span>`);
                }
            } else {
                // --- 🔄 BOSS REPLAY (NO XL SLICERS • NO LOOT JACKPOT) ---
                // Only a small farm chance for 1 berry (No XL items allowed!)
                if (Math.random() < 0.35) {
                    gameState.berries += 1;
                    drops.push(`<span class='text-pink-400 font-bold'>+1 🍓 Berry</span>`);
                }
            }
        } else {
            // --- REGULAR WILD STAGES ---
            if (Math.random() < 0.45) {
                let foundBerries = Math.floor(Math.random() * 2) + 1;
                gameState.berries += foundBerries;
                drops.push(`<span class='text-pink-400 font-bold'>+${foundBerries} 🍓 Berry</span>`);
            }
            if (Math.random() < 0.11) {
                gameState.pokeballs += 1;
                drops.push(`<span class='text-red-400 font-bold'>+1 🔴 Pokéball</span>`);
            }
            // Lucky wild XL Slicer drop ONLY on first-time clears!
            if (isNewRecord && Math.random() < 0.10) {
                let luckyXL = xlKeys[Math.floor(Math.random() * xlKeys.length)];
                gameState.items[luckyXL] = (gameState.items[luckyXL] || 0) + 1;
                drops.push(`<span class='text-yellow-400 font-bold'>+1 ${XL_ITEM_CONFIG[luckyXL].icon} ${XL_ITEM_CONFIG[luckyXL].name}</span>`);
            }
        }

        let lootText = drops.length > 0 ? drops.join(" <span class='text-gray-500'>•</span> ") : "<span class='text-gray-400'>None</span>";

        // 3. Assemble Rich Victory Card with Combat Analytics
        let title = isBoss ? `👑 BOSS CLEARED!` : `🏆 VICTORY!`;
        let progressMsg = isNewRecord 
            ? `<span class='text-yellow-400 font-black'>🌟 Stage ${gameState.maxStage} Unlocked!</span>` 
            : `<span class='text-gray-400'>🔄 Stage ${beatenStage} Cleared</span>`;

        let victoryCard = `
            <div class='bg-gray-900/80 p-4 rounded-xl border border-gray-700 text-left text-sm space-y-2 mt-2 shadow-inner'>
                <div>⚡ <strong class='text-white'>XP Gained:</strong> <span class='text-green-400 font-bold'>+${formatNumber(earnedXp)} XP</span> <span class='text-[10px] text-gray-400'>(${multiplier}x Mood)</span>${replayTag}</div>
                <div>🎁 <strong class='text-white'>Loot:</strong> ${lootText}</div>
                <div>⚔️ <strong class='text-white'>Combat:</strong> <span class='text-orange-400 font-bold'>${formatNumber(battleDamageDealt)}</span> Dealt • <span class='text-blue-400 font-bold'>${formatNumber(battleDamageReceived)}</span> Taken</div>
                <div class='pt-2 border-t border-gray-800'>${progressMsg}</div>
            </div>
        `.trim();

        updateHub();
        showModal(title, victoryCard, [40, 60, 40]);
        
        // Switch to hub FIRST, then trigger XP animation
        showScreen('hub-screen');
        setTimeout(() => addXP(baseStageXp), 300);
    } else {
        // --- RICH DEFEAT CARD ---
        gameState.hearts = Math.max(0, gameState.hearts - 2); 
        updateHub();

        let defeatCard = `
            <div class='bg-gray-900/80 p-4 rounded-xl border border-red-900/60 text-left text-sm space-y-2.5 mt-2 shadow-inner'>
                <div class='text-gray-300'>${gameState.name} was overwhelmed on <strong class='text-yellow-400'>Stage ${gameState.currentStage}</strong>!</div>
                <div>⚔️ <strong class='text-white'>Combat:</strong> <span class='text-orange-400 font-bold'>${formatNumber(battleDamageDealt)}</span> Dealt • <span class='text-red-400 font-bold'>${formatNumber(battleDamageReceived)}</span> Taken</div>
                <div class='pt-2 border-t border-gray-800 text-xs text-red-400 font-semibold'>💔 Lost 2 Hearts (Feed berries or pet to recover!)</div>
            </div>
        `.trim();

        showModal("💀 BLACKED OUT...", defeatCard, [80, 80]);
        showScreen('hub-screen');
    }
}