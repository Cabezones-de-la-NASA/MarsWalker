// Entrada del modo a pie: teclado y ratón.
//   WASD movimiento · ratón cámara · Shift correr · Space salto · E interactuar
//   V cambiar perspectiva · F subir o bajar de la camioneta · G traerla · T velocidad del tiempo
//   Tab telemetría completa · Esc menú (libera el cursor)

const MOVE_KEYS = {
  KeyW: [0, 1], ArrowUp: [0, 1],
  KeyS: [0, -1], ArrowDown: [0, -1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/**
 * createInput(domElement, { onInteract, onToggleView, onMenu }) ->
 *   state    { forward, right, run, jump }   forward y right de -1 a 1
 *   consumeLook() -> [dx_px, dy_px] del ratón desde la última llamada
 *   setEnabled(bool), requestPointerLock(), hasPointerLock(), dispose()
 */
export function createInput(domElement, {
  onInteract, onToggleView, onMenu, onPointerLockChange, onVehicle, onSummonVehicle, onTimeScale, onDetails,
}) {
  const pressed = new Set();
  const state = { forward: 0, right: 0, run: false, jump: false };
  let enabled = false;
  let lookX = 0;
  let lookY = 0;
  let dragging = false;

  function refresh() {
    let forward = 0;
    let right = 0;
    for (const code of pressed) {
      const move = MOVE_KEYS[code];
      if (move) {
        right += move[0];
        forward += move[1];
      }
    }
    state.forward = Math.max(-1, Math.min(1, forward));
    state.right = Math.max(-1, Math.min(1, right));
    state.run = pressed.has('ShiftLeft') || pressed.has('ShiftRight');
    state.jump = pressed.has('Space');
  }

  function onKeyDown(event) {
    if (!enabled || event.repeat) return;
    if (event.code === 'Escape') {
      onMenu?.();
      return;
    }
    if (event.code === 'KeyE') onInteract?.();
    if (event.code === 'KeyV') onToggleView?.();
    if (event.code === 'KeyF') onVehicle?.();
    if (event.code === 'KeyG') onSummonVehicle?.();
    if (event.code === 'KeyT') onTimeScale?.();
    if (event.code === 'Tab') {
      event.preventDefault();
      onDetails?.();
    }
    if (MOVE_KEYS[event.code] || event.code === 'Space') event.preventDefault();
    pressed.add(event.code);
    refresh();
  }

  function onKeyUp(event) {
    pressed.delete(event.code);
    refresh();
  }

  function onMouseMove(event) {
    if (!enabled) return;
    // Con el cursor capturado se mira moviendo el ratón; sin capturar, arrastrando.
    if (document.pointerLockElement === domElement || dragging) {
      lookX += event.movementX;
      lookY += event.movementY;
    }
  }

  function onMouseDown() {
    if (!enabled) return;
    dragging = true;
  }

  function onMouseUp() {
    dragging = false;
  }

  function onLockChange() {
    onPointerLockChange?.(document.pointerLockElement === domElement);
  }

  function onBlur() {
    pressed.clear();
    refresh();
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  document.addEventListener('mousemove', onMouseMove);
  domElement.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  document.addEventListener('pointerlockchange', onLockChange);

  return {
    state,
    consumeLook() {
      const look = [lookX, lookY];
      lookX = 0;
      lookY = 0;
      return look;
    },
    setEnabled(next) {
      enabled = next;
      if (!enabled) {
        pressed.clear();
        refresh();
        lookX = lookY = 0;
        if (document.pointerLockElement === domElement) document.exitPointerLock();
      }
    },
    requestPointerLock() {
      // Algunos navegadores rechazan la captura si no viene de un gesto: se ignora el fallo
      // y se puede seguir mirando arrastrando el ratón.
      try {
        const result = domElement.requestPointerLock?.();
        if (result?.catch) result.catch(() => {});
      } catch {
        // sin captura de cursor
      }
    },
    hasPointerLock: () => document.pointerLockElement === domElement,
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('mousemove', onMouseMove);
      domElement.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('pointerlockchange', onLockChange);
    },
  };
}
