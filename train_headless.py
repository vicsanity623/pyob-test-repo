"""
train_headless.py — Headless evolution runner for GitHub Actions.
Identical simulation logic to vb.py, zero pygame dependency.
Runs at max CPU speed for --minutes duration, then saves:
  - evolved_core_brain.pkl  (continuity — loaded by next run)
  - brain.json              (read by index.html GitHub Pages viewer)
"""

import numpy as np
import pickle
import os
import time
import random
import json
import argparse
import copy

# ==========================================
# 1. CONFIGURATION & MAGIC NUMBERS
# ==========================================
BRAIN_SIZE = 256
MEMORY_SIZE = 64
ATTENTION_WINDOW = 32
PLANNING_HORIZON = 8
BRAIN_TICK_EVERY = 2
MAX_PLANNERS_PER_TICK = 5

COUNCIL_SIZE = 5          # Number of Top agents to keep (Top-K Elitism)
FOOD_RADIUS_SQ = 6.25     # 2.5 squared
POISON_RADIUS_SQ = 4.0    # 2.0 squared
PREDATOR_RADIUS_SQ = 4.0  # 2.0 squared
MOTOR_SCALE = 1.4         # Speed multiplier

_plan_budget = [MAX_PLANNERS_PER_TICK]

# ==========================================
# 2. THE BRAIN (CTRNN)
# ==========================================
class ImprovedCTRNN:
    def __init__(self, size=BRAIN_SIZE):
        self.size = size
        self.voltages = np.zeros(size)
        self.adaptation = np.zeros(size)
        self.time_constants = np.random.uniform(2.0, 10.0, size)
        self.biases = np.random.uniform(-1.0, 1.0, size)
        self.weights = np.random.uniform(-1.0, 1.0, (size, size))

        # Token-wise compression (projects sensory input to compact memory)
        self.compress_weights = np.random.uniform(-0.5, 0.5, (MEMORY_SIZE, 19))
        self.compressed_memory = np.zeros(MEMORY_SIZE)

        # Sparse attention over past voltage states
        self.voltage_history = []
        self.attention_weights = np.random.uniform(-0.5, 0.5, (size, ATTENTION_WINDOW))

        # Dual-mode state (0 = fast/intuitive, 1 = slow/deliberate)
        self.thinking_mode = 0
        self.mode_switch_threshold = 0.7

        # Long-term memory traces
        self.ltm_trace = np.zeros(size)
        self.ltm_decay = 0.999

        # Planning buffer
        self.plan_buffer = []

        # Cached outputs for throttled ticking
        self._last_outputs = np.full(size, 0.5)

    def compress_sensors(self, sensors):
        if sensors is None:
            sensors = np.zeros(19)
        compressed = np.tanh(np.dot(self.compress_weights, sensors))
        self.compressed_memory = 0.9 * self.compressed_memory + 0.1 * compressed
        return self.compressed_memory

    def sparse_attention(self, current_voltages):
        if len(self.voltage_history) < 2:
            return current_voltages
        history = self.voltage_history[-ATTENTION_WINDOW:]
        if len(history) < ATTENTION_WINDOW:
            history = [np.zeros(self.size)] * (ATTENTION_WINDOW - len(history)) + history
        history_matrix = np.array(history).T
        scores = self.attention_weights * history_matrix
        scores = np.clip(scores, -10, 10)
        threshold = np.mean(np.abs(scores), axis=1, keepdims=True) * 1.5
        scores[np.abs(scores) < threshold] = -20
        exp_scores = np.exp(scores - np.max(scores, axis=1, keepdims=True))
        attention = exp_scores / (np.sum(exp_scores, axis=1, keepdims=True) + 1e-8)
        attended = np.sum(history_matrix * attention, axis=1)
        return attended

    def get_outputs(self, uncertainty=None):
        active_voltages = np.clip(self.voltages - (self.adaptation * 1.5), -50, 50)
        if uncertainty is not None:
            self.thinking_mode = 1 if uncertainty > self.mode_switch_threshold else 0
        if self.thinking_mode == 0:
            outputs = 1.0 / (1.0 + np.exp(-active_voltages))
        else:
            attended = self.sparse_attention(active_voltages)
            outputs = 1.0 / (1.0 + np.exp(-attended))
        return outputs

    def forward_plan(self, env_copy_func, steps=PLANNING_HORIZON):
        plans = []
        current_state = self.voltages.copy()
        original_mode = self.thinking_mode
        self.thinking_mode = 0
        for action_variation in np.linspace(-0.5, 0.5, 3):
            sim_voltages = current_state.copy()
            total_reward = 0
            for step in range(steps):
                self.voltages = sim_voltages
                outputs = self.get_outputs()
                motor = outputs[-2:] + action_variation
                total_reward += np.random.randn() * 0.1
                sim_derivative = (-sim_voltages + self.biases) / self.time_constants
                sim_voltages = sim_voltages + sim_derivative * 0.1
                self.voltages = current_state
            plans.append((action_variation, total_reward))
        self.thinking_mode = original_mode
        best_action = max(plans, key=lambda x: x[1])[0]
        return best_action

    def tick(self, dt, sensors, uncertainty=None, use_planning=False, precomputed_net_input=None):
        compressed = self.compress_sensors(sensors)
        outputs = self.get_outputs(uncertainty)
        if precomputed_net_input is not None:
            network_input = precomputed_net_input + self.biases
        else:
            network_input = np.dot(self.weights, outputs) + self.biases
        total_input = network_input.copy()
        sensor_gain = 50.0 
        inject_size = min(self.size, len(compressed))
        total_input[:inject_size] += compressed[:inject_size] * sensor_gain
        if sensors is not None:
            sensor_inject_size = min(self.size, len(sensors))
            total_input[:sensor_inject_size] += sensors[:sensor_inject_size] * sensor_gain
        derivative = (-self.voltages + total_input) / self.time_constants
        self.voltages = np.clip(self.voltages + derivative * dt, -100, 100)
        self.adaptation += (outputs * 0.1 - self.adaptation * 0.05) * dt
        self.ltm_trace = self.ltm_trace * self.ltm_decay + outputs * (1 - self.ltm_decay)
        self.voltage_history.append(self.voltages.copy())
        if len(self.voltage_history) > ATTENTION_WINDOW * 2:
            self.voltage_history = self.voltage_history[-ATTENTION_WINDOW:]
        if use_planning and np.random.rand() < 0.05 and _plan_budget[0] > 0:
            _plan_budget[0] -= 1
            action_bias = self.forward_plan(None)
            outputs[-2:] += action_bias
        
        # Save the raw outputs for internal state
        self._last_outputs = outputs
        
        # Only smooth the final movement (last 2 outputs) to keep 
        # internal neural logic sharp while making movement fluid.
        final_motor = 0.7 * getattr(self, '_prev_motor', np.array([0.5, 0.5])) + 0.3 * outputs[-2:]
        self._prev_motor = final_motor
        
        return outputs


# ==========================================
# 3. THE WORLD ENVIRONMENT (VECTORIZED)
# ==========================================
class Environment:
    def __init__(self, king_gen, max_health=150):
        self.gen = king_gen
        self.max_health = max_health
        self.agent_pos = np.array([25.0, 25.0])
        self.num_food = 10
        self.num_poison = 3
        
        # VECTORIZED ARRAYS (Massive performance boost)
        self.food_positions = np.random.uniform(7.5, 42.5, (self.num_food, 2))
        self.food_vels = np.random.uniform(-0.2, 0.2, (self.num_food, 2)) if self.gen > 200 else np.zeros((self.num_food, 2))
        self.poison_positions = np.random.uniform(7.5, 42.5, (self.num_poison, 2))
        self.poison_vels = np.random.uniform(-0.15, 0.15, (self.num_poison, 2)) if self.gen > 200 else np.zeros((self.num_poison, 2))
        
        self.enemy_pos = np.array([2.5, 2.5])
        self.health = float(max_health)
        self.food_count = 0
        self.ticks = 0
        self.wall_contact_count = 0
        self.food_visible = True
        self.predator_active = (self.gen >= 500)
        self.last_food_time = 0

    def get_sensors(self):
        self.food_visible = (self.ticks % 300) < 240

        def norm_vec_dist(target):
            dx, dy = target[0] - self.agent_pos[0], target[1] - self.agent_pos[1]
            dist = np.sqrt(dx*dx + dy*dy) + 0.001
            return [dx / dist, dy / dist], dist

        if self.food_visible:
            # Vectorized distance calculation
            dists_sq = np.sum((self.food_positions - self.agent_pos)**2, axis=1)
            nearest_idx = np.argmin(dists_sq)
            food_s, food_dist = norm_vec_dist(self.food_positions[nearest_idx])
            
            # AMPLIFY signal if close
            if food_dist < 10:
                food_s[0] *= 2.0
                food_s[1] *= 2.0
        else:
            food_s, food_dist = [0.0, 0.0], 50.0

        p_dists_sq = np.sum((self.poison_positions - self.agent_pos)**2, axis=1)
        pois_s, pois_dist = norm_vec_dist(self.poison_positions[np.argmin(p_dists_sq)])
        center_s, center_dist = norm_vec_dist([25.0, 25.0])

        f_prox = max(0.0, 1.0 - (food_dist / 50.0))
        p_prox = max(0.0, 1.0 - (pois_dist / 50.0))
        c_prox = max(0.0, 1.0 - (center_dist / 50.0))

        w_l = (10.0 - self.agent_pos[0])/10.0 if self.agent_pos[0] < 10 else 0
        w_r = (self.agent_pos[0] - 40.0)/10.0 if self.agent_pos[0] > 40 else 0
        w_t = (10.0 - self.agent_pos[1])/10.0 if self.agent_pos[1] < 10 else 0
        w_b = (self.agent_pos[1] - 40.0)/10.0 if self.agent_pos[1] > 40 else 0

        pain = 1.0 if (self.agent_pos[0]<=0.5 or self.agent_pos[0]>=49.5 or
                       self.agent_pos[1]<=0.5 or self.agent_pos[1]>=49.5) else 0.0
        hunger = (100.0 - self.health) / 100.0
        osc = np.sin(self.ticks * 0.2)

        if self.predator_active:
            enem_s, enem_dist = norm_vec_dist(self.enemy_pos)
            e_prox = max(0.0, 1.0 - (enem_dist / 50.0))
        else:
            enem_s, e_prox = [0.0, 0.0], 0.0

        return np.array([
            food_s[0], food_s[1], pois_s[0], pois_s[1],
            w_l, w_r, w_t, w_b,
            hunger, osc, enem_s[0], enem_s[1], pain,
            f_prox, p_prox, center_s[0], center_s[1], c_prox, e_prox
        ])

    def update(self, motor_output, brain=None):
        self.ticks += 1
        dx, dy = (motor_output[0]-0.5)*MOTOR_SCALE, (motor_output[1]-0.5)*MOTOR_SCALE
        new_pos = self.agent_pos + [dx, dy]
        hit_wall = (new_pos[0]<=0.5 or new_pos[0]>=49.5 or new_pos[1]<=0.5 or new_pos[1]>=49.5)
        
        if hit_wall:
            self.wall_contact_count += 1
            dx, dy = 0, 0 
        
        self.agent_pos = np.clip(self.agent_pos + [dx, dy], 0.1, 49.9)
        if np.isnan(self.agent_pos).any():
            self.agent_pos = np.array([25.0, 25.0])
            
        if self.predator_active:
            dir_e = self.agent_pos - self.enemy_pos
            dist = np.sqrt(dir_e[0]**2 + dir_e[1]**2) + 0.01
            self.enemy_pos += (dir_e / dist) * 0.325

        base_drain = 0.02 + (self.max_health / 10000.0) 
        wall_penalty = self.max_health * 0.10 if hit_wall else base_drain
        self.health -= wall_penalty

        ate_food = False
        
        # VECTORIZED FOOD COLLISION
        f_dists_sq = np.sum((self.food_positions - self.agent_pos)**2, axis=1)
        eaten_mask = f_dists_sq < FOOD_RADIUS_SQ
        num_eaten = np.sum(eaten_mask)
        if num_eaten > 0:
            self.health = min(100, self.health + (45 * num_eaten))
            self.food_count += num_eaten
            self.last_food_time = self.ticks
            self.food_positions[eaten_mask] = np.random.uniform(7.5, 42.5, (num_eaten, 2))
            ate_food = True
            
        # VECTORIZED POISON COLLISION
        self.poison_positions += self.poison_vels
        out_of_bounds = (self.poison_positions < 0) | (self.poison_positions > 50)
        self.poison_vels[out_of_bounds] *= -1
        
        p_dists_sq = np.sum((self.poison_positions - self.agent_pos)**2, axis=1)
        poisoned_mask = p_dists_sq < POISON_RADIUS_SQ
        num_poisoned = np.sum(poisoned_mask)
        if num_poisoned > 0:
            self.health -= 70 * num_poisoned
            self.poison_positions[poisoned_mask] = np.random.uniform(7.5, 42.5, (num_poisoned, 2))
            
        pred_dist_sq = np.sum((self.agent_pos - self.enemy_pos)**2)
        killed = (self.health <= 0 or (self.predator_active and pred_dist_sq < PREDATOR_RADIUS_SQ))
        
        if brain is not None and self.ticks % BRAIN_TICK_EVERY == 0:
            uncertainty = max(0, (100 - self.health) / 100) * 0.4
            uncertainty += min(1.0, self.wall_contact_count / 50) * 0.3
            uncertainty += 0.3 if (self.ticks - self.last_food_time) > 200 else 0.0
            brain.tick(0.1, self.get_sensors(), uncertainty,
                       use_planning=(uncertainty > 0.6),
                       precomputed_net_input=getattr(brain, '_batched_net_in', None))
        return not killed, ate_food


# ==========================================
# 4. GENETIC REPRODUCTION & MUTATION
# ==========================================
def crossover(b1, b2):
    """Sexual Reproduction: Splices two brains together"""
    child = ImprovedCTRNN(b1.size)
    
    # Binary crossover for weights and biases
    w_mask = np.random.rand(*b1.weights.shape) < 0.5
    child.weights = np.where(w_mask, b1.weights, b2.weights)
    
    b_mask = np.random.rand(*b1.biases.shape) < 0.5
    child.biases = np.where(b_mask, b1.biases, b2.biases)
    
    tc_mask = np.random.rand(*b1.time_constants.shape) < 0.5
    child.time_constants = np.where(tc_mask, b1.time_constants, b2.time_constants)
    
    # Pass down Attention and Compression intact to prevent breaking deep circuits
    child.compress_weights = b1.compress_weights.copy() if random.random() < 0.5 else b2.compress_weights.copy()
    child.attention_weights = b1.attention_weights.copy() if random.random() < 0.5 else b2.attention_weights.copy()
    
    return child

def deepseek_style_mutate(brain):
    """Asexual Reproduction: Adds noise to existing brain"""
    nb = ImprovedCTRNN(brain.size)
    
    mutation_rate = 0.2 if np.random.rand() < 0.05 else 0.05
    mask = np.random.rand(*brain.weights.shape) < mutation_rate
    nb.weights = np.clip(brain.weights * 0.995 + np.random.normal(0, 0.15, brain.weights.shape) * mask, -3.0, 3.0)
    
    tc_mask = np.random.rand(brain.size) < 0.1
    nb.time_constants = np.clip(brain.time_constants + np.random.normal(0, 0.2, brain.size) * tc_mask, 1.0, 15.0)

    if np.random.rand() < 0.1:
        nb.compress_weights = np.clip(brain.compress_weights + np.random.normal(0, 0.1, brain.compress_weights.shape), -1, 1)
    
    if np.random.rand() < 0.15:
        nb.attention_weights = np.clip(brain.attention_weights + np.random.normal(0, 0.05, brain.attention_weights.shape), -1, 1)
        
    bias_mask = np.random.rand(*brain.biases.shape) < 0.1
    nb.biases = np.clip(brain.biases * 0.99 + np.random.normal(0, 0.05, brain.biases.shape) * bias_mask, -1.5, 1.5)
    
    nb.ltm_trace = brain.ltm_trace.copy()
    nb.compressed_memory = brain.compressed_memory.copy()
    return nb


# ==========================================
# 5. SAVE + EXPORT
# ==========================================
SAVE_FILE = "evolved_core_brain.pkl"

def save_and_export(council, gen, max_health):
    # Sort council just in case, best is at the end [-1]
    council.sort(key=lambda x: x[0])
    best_score, best_brain = council[-1]
    best_food = getattr(best_brain, '_last_food_score', 0)

    with open(SAVE_FILE, "wb") as f:
        pickle.dump({'council': council, 'generation': gen, 'max_health': max_health}, f)
    print(f"[+] Saved {SAVE_FILE} (Council Size: {len(council)})")

    # Export JSON of ONLY the absolute best agent for browser viewer
    data = {
        "meta": {
            "score": int(best_score),
            "generation": gen,
            "food": best_food,
            "max_health": max_health,
            "brain_size": best_brain.size,
            "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        },
        "weights": best_brain.weights.tolist(),
        "biases": best_brain.biases.tolist(),
        "time_constants": best_brain.time_constants.tolist(),
        "compress_weights": best_brain.compress_weights.tolist(),
        "attention_weights": best_brain.attention_weights.tolist(),
        "ltm_trace": best_brain.ltm_trace.tolist(),
        "compressed_memory": best_brain.compressed_memory.tolist(),
    }
    with open("brain.json", "w") as f:
        json.dump(data, f, separators=(',', ':'))
    print(f"[+] Exported brain.json (gen={gen}, score={int(best_score)})")


# ==========================================
# 6. MAIN EVOLUTION LOOP
# ==========================================
COLS, ROWS = 10, 10
NUM_AGENTS = COLS * ROWS

def main():
    parser = argparse.ArgumentParser(description="Headless CTRNN evolution trainer")
    parser.add_argument("--minutes", type=int, default=390, help="Wall-clock minutes to run")
    args = parser.parse_args()

    deadline = time.time() + args.minutes * 60
    next_log = time.time() + 60
    next_save = time.time() + 1800

    # Load existing Council (Top-K Elitism) or start fresh
    if os.path.exists(SAVE_FILE):
        with open(SAVE_FILE, "rb") as f:
            data = pickle.load(f)
        
        k_gen = data.get('generation', 1)
        k_max_health = data.get('max_health', 150)
        
        # Backwards compatibility check
        if 'council' in data:
            council = data['council']
        else:
            print("[*] Upgrading old save file to Council System...")
            k_brain = data['brain']
            k_score = data.get('score', 0)
            # Create a fake initial council out of the single saved brain
            council = [(k_score * (0.95 ** i), copy.deepcopy(k_brain)) for i in range(COUNCIL_SIZE)]
            council.sort(key=lambda x: x[0])
            
        print(f"[+] Loaded Council. Best Score: {int(council[-1][0])}, Gen: {k_gen}")
    else:
        print("[+] No saved brain found — starting fresh evolution.")
        k_gen, k_max_health = 1, 150
        base_brain = ImprovedCTRNN(BRAIN_SIZE)
        council = [(0, copy.deepcopy(base_brain)) for _ in range(COUNCIL_SIZE)]

    # Generate initial population based on the council
    brains = []
    for _ in range(NUM_AGENTS):
        b1, b2 = random.choice(council)[1], random.choice(council)[1]
        child = crossover(b1, b2)
        brains.append(deepseek_style_mutate(child))
        
    envs = [Environment(k_gen, k_max_health) for _ in range(NUM_AGENTS)]

    steps_total = 0
    deaths_this_run = 0
    cycles_this_run = 0

    print(f"[*] Running headless evolution for {args.minutes} min ({NUM_AGENTS} agents, vectorized physics)...")

    while time.time() < deadline:
        _plan_budget[0] = MAX_PLANNERS_PER_TICK

        # 1. High-speed Batch Math
        all_w = np.array([b.weights for b in brains])
        all_o = np.array([b._last_outputs for b in brains])
        all_net_in = np.matmul(all_w, all_o[..., np.newaxis]).squeeze(-1)

        # 2. Combined Agent Loop
        for i in range(NUM_AGENTS):
            brains[i]._batched_net_in = all_net_in[i]
            motor_to_use = getattr(brains[i], '_prev_motor', brains[i]._last_outputs[-2:])
            
            alive, _ = envs[i].update(motor_to_use, brain=brains[i])
            
            if not alive:
                deaths_this_run += 1
                
                # --- Periodic Score Decay (Once per full population wipe) ---
                if deaths_this_run % NUM_AGENTS == 0:
                    for idx in range(len(council)):
                        council[idx] = (council[idx][0] * 0.995, council[idx][1]) # Decay 0.5%
                
                # --- Scoring Logic ---
                dx_c = envs[i].agent_pos[0] - 25.0
                dy_c = envs[i].agent_pos[1] - 25.0
                dist_from_center = np.sqrt(dx_c**2 + dy_c**2)
                center_bonus = max(0, (25.0 - dist_from_center) * 2.0)
                
                score = (envs[i].ticks * 0.1) + (envs[i].food_count * 8000) + center_bonus - (envs[i].wall_contact_count * 200)
                if envs[i].food_count == 0:
                    score = min(score, 10) 
                
                # Store food stat for web viewer
                brains[i]._last_food_score = envs[i].food_count
                
                # --- Top-K Elitism (The Council) ---
                lowest_council_score = council[0][0]
                if score > lowest_council_score:
                    council[0] = (score, copy.deepcopy(brains[i]))
                    council.sort(key=lambda x: x[0]) # Re-sort so [0] is lowest, [-1] is highest
                    
                    k_gen += 1
                    k_max_health = min(500, k_max_health + 3)
                    cycles_this_run += 1
                
                # --- Advanced Reproduction (Crossover + Mutate) ---
                r = np.random.rand()
                if r < 0.70:
                    # 70%: Sexual Reproduction (Cross two council members + Mutate)
                    b1 = random.choice(council)[1]
                    b2 = random.choice(council)[1]
                    child = crossover(b1, b2)
                    brains[i] = deepseek_style_mutate(child)
                elif r < 0.90:
                    # 20%: Asexual Reproduction (Direct clone of absolute best + Mutate)
                    brains[i] = deepseek_style_mutate(council[-1][1])
                else:
                    # 10%: Random Immigrant (Pure diversity)
                    brains[i] = ImprovedCTRNN(BRAIN_SIZE) 
                
                envs[i] = Environment(k_gen, k_max_health)

        steps_total += 1

        # Periodic Logging
        now = time.time()
        if now >= next_log:
            elapsed_min = (now - (deadline - args.minutes * 60)) / 60
            remaining_min = (deadline - now) / 60
            best_score = int(council[-1][0])
            print(f"[{elapsed_min:5.1f}m elapsed | {remaining_min:5.1f}m left] "
                  f"Cycle={k_gen} BestScore={best_score} MaxHP={k_max_health} "
                  f"Steps={steps_total:,} NewKings={cycles_this_run}")
            next_log = now + 60

        # Checkpoint Save
        if now >= next_save:
            print("[~] Checkpoint save...")
            save_and_export(council, k_gen, k_max_health)
            next_save = now + 1800

    # Final Save
    print(f"\n[+] Run complete. Total steps: {steps_total:,} | New kings this run: {cycles_this_run}")
    save_and_export(council, k_gen, k_max_health)


if __name__ == "__main__":
    main()