import numpy as np  # type: ignore
import random

BRAIN_SIZE = 256
MEMORY_SIZE = 64
ATTENTION_WINDOW = 32
PLANNING_HORIZON = 8


class ImprovedCTRNN:
    def __init__(self, size=BRAIN_SIZE):
        self.size = size
        self.voltages = np.zeros(size)
        self.adaptation = np.zeros(size)
        self.time_constants = np.random.uniform(2.0, 10.0, size)
        self.biases = np.random.uniform(-1.0, 1.0, size)
        self.weights = np.random.uniform(-1.0, 1.0, (size, size))
        self.compress_weights = np.random.uniform(-0.5, 0.5, (MEMORY_SIZE, 19))
        self.compressed_memory = np.zeros(MEMORY_SIZE)
        self.voltage_history = []
        self.attention_weights = np.random.uniform(-0.5, 0.5, (size, ATTENTION_WINDOW))
        self.thinking_mode = 0
        self.mode_switch_threshold = 0.7
        self.ltm_trace = np.zeros(size)
        self.ltm_decay = 0.999
        self._last_outputs = np.full(size, 0.5)
        self._prev_motor = np.array([0.5, 0.5])

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
            history = [np.zeros(self.size)] * (
                ATTENTION_WINDOW - len(history)
            ) + history
        history_matrix = np.array(history).T
        scores = self.attention_weights * history_matrix
        scores = np.clip(scores, -10, 10)
        threshold = np.mean(np.abs(scores), axis=1, keepdims=True) * 1.5
        scores[np.abs(scores) < threshold] = -20
        exp_scores = np.exp(scores - np.max(scores, axis=1, keepdims=True))
        attention = exp_scores / (np.sum(exp_scores, axis=1, keepdims=True) + 1e-8)
        return np.sum(history_matrix * attention, axis=1)

    def get_outputs(self, uncertainty=None):
        active_voltages = np.clip(self.voltages - (self.adaptation * 1.5), -50, 50)
        if uncertainty is not None:
            self.thinking_mode = 1 if uncertainty > self.mode_switch_threshold else 0
        if self.thinking_mode == 0:
            return 1.0 / (1.0 + np.exp(-active_voltages))
        else:
            return 1.0 / (1.0 + np.exp(-self.sparse_attention(active_voltages)))

    def tick(
        self,
        dt,
        sensors,
        uncertainty=None,
        use_planning=False,
        precomputed_net_input=None,
    ):
        compressed = self.compress_sensors(sensors)
        outputs = self.get_outputs(uncertainty)
        network_input = (
            precomputed_net_input + self.biases
            if precomputed_net_input is not None
            else np.dot(self.weights, outputs) + self.biases
        )
        total_input = network_input.copy()
        sensor_gain = 50.0
        inject_size = min(self.size, len(compressed))
        total_input[:inject_size] += compressed[:inject_size] * sensor_gain
        if sensors is not None:
            sensor_inject_size = min(self.size, len(sensors))
            total_input[:sensor_inject_size] += (
                sensors[:sensor_inject_size] * sensor_gain
            )
        derivative = (-self.voltages + total_input) / self.time_constants
        self.voltages = np.clip(self.voltages + derivative * dt, -100, 100)
        self.adaptation += (outputs * 0.1 - self.adaptation * 0.05) * dt
        self.ltm_trace = self.ltm_trace * self.ltm_decay + outputs * (
            1 - self.ltm_decay
        )
        self.voltage_history.append(self.voltages.copy())
        if len(self.voltage_history) > ATTENTION_WINDOW:
            self.voltage_history.pop(0)
        self._last_outputs = outputs
        self._prev_motor = (
            0.7 * getattr(self, "_prev_motor", np.array([0.5, 0.5]))
            + 0.3 * outputs[-2:]
        )
        return outputs


def crossover(b1, b2):
    child = ImprovedCTRNN(b1.size)
    child.weights = np.where(
        np.random.rand(*b1.weights.shape) < 0.5, b1.weights, b2.weights
    )
    child.biases = np.where(
        np.random.rand(*b1.biases.shape) < 0.5, b1.biases, b2.biases
    )
    child.time_constants = np.where(
        np.random.rand(*b1.time_constants.shape) < 0.5,
        b1.time_constants,
        b2.time_constants,
    )
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
    nb.compress_weights = np.clip(
        brain.compress_weights + np.random.normal(0, 0.1, brain.compress_weights.shape),
        -1,
        1,
    )
    nb.attention_weights = np.clip(
        brain.attention_weights
        + np.random.normal(0, 0.05, brain.attention_weights.shape),
        -1,
        1,
    )
    nb.biases = np.clip(
        brain.biases * 0.99
        + np.random.normal(0, 0.05, brain.biases.shape)
        * (np.random.rand(*brain.biases.shape) < 0.1),
        -1.5,
        1.5,
    )
    return nb
