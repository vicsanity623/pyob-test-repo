"""
train_headless.py — Headless evolution runner for GitHub Actions.
Identical simulation logic to vb.py, zero pygame dependency.
Runs at max CPU speed for --minutes duration, then saves:
  - evolved_core_brain.pkl  (continuity — loaded by next run)
  - brain.json              (read by index.html GitHub Pages viewer)
"""

import numpy as np  # type: ignore
import pickle
import os
import time
import random
import json
import argparse
import copy
from brain_module import ImprovedCTRNN

# ==========================================
# 1. CONFIGURATION & MAGIC NUMBERS
# ==========================================
BRAIN_SIZE = 256
MEMORY_SIZE = 64
ATTENTION_WINDOW = 32
PLANNING_HORIZON = 8
BRAIN_TICK_EVERY = 2
MAX_PLANNERS_PER_TICK = 5

COUNCIL_SIZE = 5  # Number of Top agents to keep (Top-K Elitism)
WORLD_SIZE = 250.0  # Expanded 5x from original 50x50
FOOD_RADIUS_SQ = 16.0  # 4.0 squared collision
POISON_RADIUS_SQ = 16.0  # 4.0 squared collision
PREDATOR_KILL_SQ = 16.0  # 4.0 squared collision
PREDATOR_AGGRO = 80.0  # Detection Radius for Predator
MOTOR_SCALE = 3.0  # Adjusted speed for larger world

_plan_budget = [MAX_PLANNERS_PER_TICK]


# ==========================================
# 3. THE OPEN WORLD ENVIRONMENT (250x250)
# ==========================================
class Environment:
    def __init__(self, king_gen, max_health=150):
        self.gen = king_gen
        self.max_health = max_health
        self.agent_pos = np.array([WORLD_SIZE / 2, WORLD_SIZE / 2])
        self.num_food = 40
        self.num_poison = 10

        self.food_positions = np.random.uniform(
            10.0, WORLD_SIZE - 10.0, (self.num_food, 2)
        )
        self.food_vels = (
            np.random.uniform(-0.2, 0.2, (self.num_food, 2))
            if self.gen > 200
            else np.zeros((self.num_food, 2))
        )
        self.poison_positions = np.random.uniform(
            10.0, WORLD_SIZE - 10.0, (self.num_poison, 2)
        )
        self.poison_vels = (
            np.random.uniform(-0.15, 0.15, (self.num_poison, 2))
            if self.gen > 200
            else np.zeros((self.num_poison, 2))
        )

        self.enemy_pos = np.array([20.0, 20.0])
        self.health = float(max_health)
        self.food_count = 0
        self.ticks = 0
        self.wall_contact_count = 0
        self.children_spawned = 0
        self.food_visible = True
        self.predator_active = self.gen >= 500
        self.last_food_time = 0
        self._already_reproduced = False

    def get_sensors(self):
        self.food_visible = (self.ticks % 300) < 240

        def norm_vec_dist(target):
            dx, dy = target[0] - self.agent_pos[0], target[1] - self.agent_pos[1]
            dist = np.sqrt(dx * dx + dy * dy) + 0.001
            return [dx / dist, dy / dist], dist

        if self.food_visible:
            dists_sq = np.sum((self.food_positions - self.agent_pos) ** 2, axis=1)
            nearest_idx = np.argmin(dists_sq)
            food_s, food_dist = norm_vec_dist(self.food_positions[nearest_idx])
            if food_dist < 25.0:
                food_s[0] *= 2.0
                food_s[1] *= 2.0
        else:
            food_s, food_dist = [0.0, 0.0], WORLD_SIZE

        p_dists_sq = np.sum((self.poison_positions - self.agent_pos) ** 2, axis=1)
        pois_s, pois_dist = norm_vec_dist(self.poison_positions[np.argmin(p_dists_sq)])
        center_s, center_dist = norm_vec_dist([WORLD_SIZE / 2, WORLD_SIZE / 2])

        f_prox = max(0.0, 1.0 - (food_dist / WORLD_SIZE))
        p_prox = max(0.0, 1.0 - (pois_dist / WORLD_SIZE))
        c_prox = max(0.0, 1.0 - (center_dist / WORLD_SIZE))

        ax, ay = self.agent_pos
        w_l = max(0.0, (50.0 - ax) / 50.0)
        w_r = max(0.0, (ax - (WORLD_SIZE - 50.0)) / 50.0)
        w_t = max(0.0, (50.0 - ay) / 50.0)
        w_b = max(0.0, (ay - (WORLD_SIZE - 50.0)) / 50.0)

        pain = (
            1.0
            if (
                ax <= 1.0
                or ax >= WORLD_SIZE - 1.0
                or ay <= 1.0
                or ay >= WORLD_SIZE - 1.0
            )
            else 0.0
        )
        hunger = (self.max_health - self.health) / self.max_health
        osc = np.sin(self.ticks * 0.2)

        if self.predator_active:
            enem_s, enem_dist = norm_vec_dist(self.enemy_pos)
            e_prox = max(0.0, 1.0 - (enem_dist / WORLD_SIZE))
        else:
            enem_s, e_prox = [0.0, 0.0], 0.0

        return np.array(
            [
                food_s[0],
                food_s[1],
                pois_s[0],
                pois_s[1],
                w_l,
                w_r,
                w_t,
                w_b,
                hunger,
                osc,
                enem_s[0],
                enem_s[1],
                pain,
                f_prox,
                p_prox,
                center_s[0],
                center_s[1],
                c_prox,
                e_prox,
            ]
        )

    def update(self, motor_output, brain=None):
        self.ticks += 1
        dx, dy = (
            (motor_output[0] - 0.5) * MOTOR_SCALE,
            (motor_output[1] - 0.5) * MOTOR_SCALE,
        )
        new_pos = self.agent_pos + [dx, dy]
        hit_wall = (
            new_pos[0] <= 1.0
            or new_pos[0] >= WORLD_SIZE - 1.0
            or new_pos[1] <= 1.0
            or new_pos[1] >= WORLD_SIZE - 1.0
        )

        if hit_wall:
            self.wall_contact_count += 1
            dx, dy = -dx * 0.5, -dy * 0.5
            self.health -= 2.0

        self.agent_pos = np.clip(self.agent_pos + [dx, dy], 1.0, WORLD_SIZE - 1.0)

        if self.predator_active:
            dir_e = self.agent_pos - self.enemy_pos
            dist = np.sqrt(dir_e[0] ** 2 + dir_e[1] ** 2) + 0.01
            if dist < PREDATOR_AGGRO:
                self.enemy_pos += (dir_e / dist) * 1.8
            else:
                self.enemy_pos += np.random.uniform(-1.0, 1.0, 2)
            self.enemy_pos = np.clip(self.enemy_pos, 5.0, WORLD_SIZE - 5.0)

        base_drain = 0.02 + (self.max_health / 10000.0)
        self.health -= base_drain

        if self.food_count >= 5 and not hasattr(self, "_already_reproduced"):
            self.children_spawned += 1
            self.health = min(
                self.max_health, self.health + 100
            )  # Healing reward for reproducing
            self._already_reproduced = True

        ate_food = False
        f_dists_sq = np.sum((self.food_positions - self.agent_pos) ** 2, axis=1)
        eaten_mask = f_dists_sq < FOOD_RADIUS_SQ
        num_eaten = np.sum(eaten_mask)
        if num_eaten > 0:
            self.health = min(self.max_health, self.health + (45 * num_eaten))
            self.food_count += num_eaten
            self.last_food_time = self.ticks
            self.food_positions[eaten_mask] = np.random.uniform(
                10.0, WORLD_SIZE - 10.0, (num_eaten, 2)
            )
            ate_food = True

        self.poison_positions += self.poison_vels
        out_of_bounds = (self.poison_positions < 0) | (
            self.poison_positions > WORLD_SIZE
        )
        self.poison_vels[out_of_bounds] *= -1

        p_dists_sq = np.sum((self.poison_positions - self.agent_pos) ** 2, axis=1)
        poisoned_mask = p_dists_sq < POISON_RADIUS_SQ
        num_poisoned = np.sum(poisoned_mask)
        if num_poisoned > 0:
            self.health -= 70 * num_poisoned
            self.poison_positions[poisoned_mask] = np.random.uniform(
                10.0, WORLD_SIZE - 10.0, (num_poisoned, 2)
            )

        pred_dist_sq = np.sum((self.agent_pos - self.enemy_pos) ** 2)
        killed = self.health <= 0 or (
            self.predator_active and pred_dist_sq < PREDATOR_KILL_SQ
        )

        if brain is not None and self.ticks % BRAIN_TICK_EVERY == 0:
            uncertainty = (
                max(0, (self.max_health - self.health) / self.max_health) * 0.4
            )
            uncertainty += min(1.0, self.wall_contact_count / 50) * 0.3
            uncertainty += 0.3 if (self.ticks - self.last_food_time) > 200 else 0.0
            if self.predator_active and np.sqrt(pred_dist_sq) < PREDATOR_AGGRO:
                uncertainty += 0.5

            brain.tick(
                0.1,
                self.get_sensors(),
                uncertainty,
                use_planning=(uncertainty > 0.6),
                precomputed_net_input=getattr(brain, "_batched_net_in", None),
            )
        return not killed, ate_food


# ==========================================
# 4. GENETIC REPRODUCTION & MUTATION
# ==========================================
def crossover(b1, b2):
    child = ImprovedCTRNN(b1.size)
    w_mask = np.random.rand(*b1.weights.shape) < 0.5
    child.weights = np.where(w_mask, b1.weights, b2.weights)
    b_mask = np.random.rand(*b1.biases.shape) < 0.5
    child.biases = np.where(b_mask, b1.biases, b2.biases)
    tc_mask = np.random.rand(*b1.time_constants.shape) < 0.5
    child.time_constants = np.where(tc_mask, b1.time_constants, b2.time_constants)
    child.compress_weights = (
        b1.compress_weights.copy()
        if random.random() < 0.5
        else b2.compress_weights.copy()
    )
    child.attention_weights = (
        b1.attention_weights.copy()
        if random.random() < 0.5
        else b2.attention_weights.copy()
    )
    return child


def deepseek_style_mutate(brain):
    nb = ImprovedCTRNN(brain.size)
    mutation_rate = 0.2 if np.random.rand() < 0.05 else 0.05
    mask = np.random.rand(*brain.weights.shape) < mutation_rate
    nb.weights = np.clip(
        brain.weights * 0.995 + np.random.normal(0, 0.15, brain.weights.shape) * mask,
        -3.0,
        3.0,
    )
    tc_mask = np.random.rand(brain.size) < 0.1
    nb.time_constants = np.clip(
        brain.time_constants + np.random.normal(0, 0.2, brain.size) * tc_mask, 1.0, 15.0
    )
    if np.random.rand() < 0.1:
        nb.compress_weights = np.clip(
            brain.compress_weights
            + np.random.normal(0, 0.1, brain.compress_weights.shape),
            -1,
            1,
        )
    if np.random.rand() < 0.15:
        nb.attention_weights = np.clip(
            brain.attention_weights
            + np.random.normal(0, 0.05, brain.attention_weights.shape),
            -1,
            1,
        )
    bias_mask = np.random.rand(*brain.biases.shape) < 0.1
    nb.biases = np.clip(
        brain.biases * 0.99 + np.random.normal(0, 0.05, brain.biases.shape) * bias_mask,
        -1.5,
        1.5,
    )
    nb.ltm_trace = brain.ltm_trace.copy()
    nb.compressed_memory = brain.compressed_memory.copy()
    return nb


# ==========================================
# 5. SAVE + EXPORT
# ==========================================
SAVE_FILE = "evolved_core_brain.pkl"


def save_and_export(council, gen, max_health):
    council.sort(key=lambda x: x[0])
    best_score, best_brain = council[-1]
    best_food = getattr(best_brain, "_last_food_score", 0)
    best_kids = getattr(best_brain, "_last_child_score", 0)

    with open(SAVE_FILE, "wb") as f:
        pickle.dump(
            {"council": council, "generation": gen, "max_health": max_health}, f
        )
    print(f"[+] Saved {SAVE_FILE} (Council Size: {len(council)})")

    data = {
        "meta": {
            "score": int(best_score),
            "generation": int(gen),
            "food": int(best_food),
            "children": int(best_kids),
            "max_health": int(max_health),
            "brain_size": int(best_brain.size),
            "world_size": int(WORLD_SIZE),
            "exported_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
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
        json.dump(data, f, separators=(",", ":"))
    print(f"[+] Exported brain.json (gen={gen}, score={int(best_score)})")


# ==========================================
# 6. MAIN EVOLUTION LOOP
# ==========================================
COLS, ROWS = 10, 10
NUM_AGENTS = COLS * ROWS


def main():
    parser = argparse.ArgumentParser(description="Headless CTRNN evolution trainer")
    parser.add_argument(
        "--minutes", type=int, default=390, help="Wall-clock minutes to run"
    )
    args = parser.parse_args()

    deadline = time.time() + args.minutes * 60
    next_log = time.time() + 60
    next_save = time.time() + 1800

    if os.path.exists(SAVE_FILE):
        with open(SAVE_FILE, "rb") as f:
            data = pickle.load(f)
        k_gen = data.get("generation", 1)
        k_max_health = data.get("max_health", 150)

        if "council" in data:
            council = data["council"]
        else:
            k_brain = data["brain"]
            k_score = data.get("score", 0)
            council = [
                (k_score * (0.95**i), copy.deepcopy(k_brain))
                for i in range(COUNCIL_SIZE)
            ]
            council.sort(key=lambda x: x[0])

        print(f"[+] Loaded Council. Best Score: {int(council[-1][0])}, Gen: {k_gen}")
    else:
        print("[+] No saved brain found — starting fresh evolution.")
        k_gen, k_max_health = 1, 150
        base_brain = ImprovedCTRNN(BRAIN_SIZE)
        council = [(0, copy.deepcopy(base_brain)) for _ in range(COUNCIL_SIZE)]

    brains = []
    for _ in range(NUM_AGENTS):
        b1, b2 = random.choice(council)[1], random.choice(council)[1]
        child = crossover(b1, b2)
        brains.append(deepseek_style_mutate(child))

    envs = [Environment(k_gen, k_max_health) for _ in range(NUM_AGENTS)]

    steps_total = 0
    deaths_this_run = 0
    cycles_this_run = 0

    print(
        f"[*] Running headless evolution for {args.minutes} min ({NUM_AGENTS} agents, vectorized physics)..."
    )

    while time.time() < deadline:
        _plan_budget[0] = MAX_PLANNERS_PER_TICK
        all_w = np.array([b.weights for b in brains])
        all_o = np.array([b._last_outputs for b in brains])
        all_net_in = np.matmul(all_w, all_o[..., np.newaxis]).squeeze(-1)

        for i in range(NUM_AGENTS):
            brains[i]._batched_net_in = all_net_in[i]
            motor_to_use = getattr(
                brains[i], "_prev_motor", brains[i]._last_outputs[-2:]
            )

            alive, _ = envs[i].update(motor_to_use, brain=brains[i])

            if not alive:
                deaths_this_run += 1
                if deaths_this_run % NUM_AGENTS == 0:
                    for idx in range(len(council)):
                        council[idx] = (council[idx][0] * 0.995, council[idx][1])

                dx_c = envs[i].agent_pos[0] - (WORLD_SIZE / 2)
                dy_c = envs[i].agent_pos[1] - (WORLD_SIZE / 2)
                dist_from_center = np.sqrt(dx_c**2 + dy_c**2)
                center_bonus = max(0, ((WORLD_SIZE / 2) - dist_from_center) * 2.0)

                score = (
                    (envs[i].ticks * 0.1)
                    + (envs[i].food_count * 8000)
                    + (envs[i].children_spawned * 50000)
                    + center_bonus
                    - (envs[i].wall_contact_count * 10)
                )
                if envs[i].food_count == 0:
                    score = min(score, 10)

                brains[i]._last_food_score = envs[i].food_count
                brains[i]._last_child_score = envs[i].children_spawned

                lowest_council_score = council[0][0]
                if score > lowest_council_score:
                    council[0] = (score, copy.deepcopy(brains[i]))
                    council.sort(key=lambda x: x[0])
                    k_gen += 1
                    k_max_health = min(500, k_max_health + 3)
                    cycles_this_run += 1

                r = np.random.rand()
                if r < 0.70:
                    b1 = random.choice(council)[1]
                    b2 = random.choice(council)[1]
                    child = crossover(b1, b2)
                    brains[i] = deepseek_style_mutate(child)
                elif r < 0.90:
                    brains[i] = deepseek_style_mutate(council[-1][1])
                else:
                    brains[i] = ImprovedCTRNN(BRAIN_SIZE)

                envs[i] = Environment(k_gen, k_max_health)

        steps_total += 1
        now = time.time()

        if now >= next_log:
            elapsed_min = (now - (deadline - args.minutes * 60)) / 60
            remaining_min = (deadline - now) / 60
            best_score = int(council[-1][0])
            print(
                f"[{elapsed_min:5.1f}m elapsed | {remaining_min:5.1f}m left] "
                f"Cycle={k_gen} BestScore={best_score} MaxHP={k_max_health} "
                f"Steps={steps_total:,} NewKings={cycles_this_run}"
            )
            next_log = now + 60

        if now >= next_save:
            print("[~] Checkpoint save...")
            save_and_export(council, k_gen, k_max_health)
            next_save = now + 1800

    print(
        f"\n[+] Run complete. Total steps: {steps_total:,} | New kings this run: {cycles_this_run}"
    )
    save_and_export(council, k_gen, k_max_health)


if __name__ == "__main__":
    main()
