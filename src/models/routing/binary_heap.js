// Montículo binario mínimo para A* (M4). Guarda pares (prioridad, valor entero).

export function createMinHeap() {
  const priorities = [];
  const values = [];

  function swap(i, j) {
    const p = priorities[i];
    priorities[i] = priorities[j];
    priorities[j] = p;
    const v = values[i];
    values[i] = values[j];
    values[j] = v;
  }

  return {
    get size() {
      return values.length;
    },
    push(priority, value) {
      priorities.push(priority);
      values.push(value);
      let i = values.length - 1;
      while (i > 0) {
        const parent = (i - 1) >> 1;
        if (priorities[parent] <= priorities[i]) break;
        swap(i, parent);
        i = parent;
      }
    },
    // -> { priority, value } con la menor prioridad, o null si está vacío.
    pop() {
      const n = values.length;
      if (n === 0) return null;
      const top = { priority: priorities[0], value: values[0] };
      const lastPriority = priorities.pop();
      const lastValue = values.pop();
      if (n > 1) {
        priorities[0] = lastPriority;
        values[0] = lastValue;
        let i = 0;
        for (;;) {
          const left = 2 * i + 1;
          const right = left + 1;
          let smallest = i;
          if (left < n - 1 && priorities[left] < priorities[smallest]) smallest = left;
          if (right < n - 1 && priorities[right] < priorities[smallest]) smallest = right;
          if (smallest === i) break;
          swap(i, smallest);
          i = smallest;
        }
      }
      return top;
    },
  };
}
