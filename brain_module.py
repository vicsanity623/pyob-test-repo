import numpy as np  # type: ignore


class ImprovedCTRNN:
    def __init__(self, size=256):
        self.size = size
        self.voltages = np.zeros(size)
        self.adaptation = np.zeros(size)
        self.time_constants = np.random.uniform(2.0, 10.0, size)
        self.biases = np.random.uniform(-1.0, 1.0, size)
        self.weights = np.random.uniform(-1.0, 1.0, (size, size))
        self.compress_weights = np.random.uniform(-0.5, 0.5, (64, 19))
        self.compressed_memory = np.zeros(64)
        self.voltage_history = []
        self.attention_weights = np.random.uniform(-0.5, 0.5, (size, 32))
        self.thinking_mode = 0
        self.mode_switch_threshold = 0.7
        self.ltm_trace = np.zeros(size)
        self.ltm_decay = 0.999
        self.plan_buffer = []
        self._last_outputs = np.full(size, 0.5)
        self._prev_motor = np.array([0.5, 0.5])
        self._batched_net_in = None
        self._last_food_score = 0
        self._last_child_score = 0

    def compress_sensors(self, sensors):
        if sensors is None:
            sensors = np.zeros(19)
        compressed = np.tanh(np.dot(self.compress_weights, sensors))
        self.compressed_memory = 0.9 * self.compressed_memory + 0.1 * compressed
        return self.compressed_memory

    def sparse_attention(self, current_voltages):
        if len(self.voltage_history) < 2:
            return current_voltages
        history = self.voltage_history[-32:]
        if len(history) < 32:
            history = [np.zeros(self.size)] * (32 - len(history)) + history
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
        total_input = np.array(network_input, copy=True)
        total_input[: min(self.size, 64)] += compressed[: min(self.size, 64)] * 50.0
        if sensors is not None:
            total_input[: min(self.size, 19)] += sensors[: min(self.size, 19)] * 50.0
        derivative = (-self.voltages + total_input) / self.time_constants
        self.voltages = np.clip(self.voltages + derivative * dt, -100, 100)
        self.adaptation += (outputs * 0.1 - self.adaptation * 0.05) * dt
        self.ltm_trace = self.ltm_trace * self.ltm_decay + outputs * (
            1 - self.ltm_decay
        )
        self.voltage_history.append(self.voltages.copy())
        if len(self.voltage_history) > 64:
            self.voltage_history = self.voltage_history[-64:]
        self._last_outputs = outputs
        self._prev_motor = (
            0.7 * getattr(self, "_prev_motor", np.array([0.5, 0.5]))
            + 0.3 * outputs[-2:]
        )
        return outputs
