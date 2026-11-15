// Conversación con el rover: se le escribe o se le habla, y responde en texto grande que
// además se lee en alto. Las respuestas vienen de askRover() (LLM o modo de muestra).
import './chat_panel.css';
import { askRover, isLlmConfigured } from './llm_client.js';
import { createSpeech } from './speech.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * createRoverChat(container, { getSnapshot, onClose }) ->
 *   open(), close(), isOpen(), element
 * getSnapshot: estado de la caminata para el contexto del LLM (ver rover_context.js).
 */
export function createRoverChat(container, { getSnapshot, onClose }) {
  const speech = createSpeech();
  const history = [];
  let busy = false;
  let voiceOn = speech.canSpeak;

  const root = el('section', 'rover-chat');
  root.hidden = true;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-label', 'Conversación con el rover');

  const head = el('header', 'rover-chat-head');
  const mode = el('span', 'rover-chat-mode');
  const voiceToggle = el('button', 'rover-chat-voice');
  voiceToggle.type = 'button';
  const closeButton = el('button', 'rover-chat-close', 'Cerrar · Esc');
  closeButton.type = 'button';
  head.append(el('span', 'rover-chat-name', 'Rover'), mode, el('span', 'rover-chat-spacer'), voiceToggle, closeButton);

  const answer = el('p', 'rover-chat-answer');
  answer.setAttribute('aria-live', 'polite');
  const source = el('div', 'rover-chat-source');
  const heard = el('div', 'rover-chat-heard');

  const form = el('form', 'rover-chat-form');
  const micButton = el('button', 'rover-chat-mic', '🎙 Hablar');
  micButton.type = 'button';
  const input = el('input', 'rover-chat-input');
  input.type = 'text';
  input.placeholder = 'Pregúntale algo sobre Marte o sobre tu caminata…';
  input.autocomplete = 'off';
  input.maxLength = 300;
  const send = el('button', 'btn-primary rover-chat-send', 'Enviar');
  send.type = 'submit';
  const another = el('button', 'rover-chat-another', 'Cuéntame otra cosa');
  another.type = 'button';
  form.append(micButton, input, send, another);
  root.append(head, answer, source, heard, form);
  container.append(root);

  if (!speech.canListen) {
    micButton.disabled = true;
    micButton.title = 'Este navegador no reconoce voz; escribe tu pregunta.';
  }

  function renderMode(last) {
    mode.textContent = isLlmConfigured() && last !== 'mock' ? 'LLM conectado' : 'Modo de muestra · sin LLM';
    mode.classList.toggle('is-mock', !(isLlmConfigured() && last !== 'mock'));
    voiceToggle.textContent = voiceOn ? '🔊 Voz activada' : '🔇 Voz apagada';
    voiceToggle.hidden = !speech.canSpeak;
  }

  async function ask(question) {
    if (busy) return;
    busy = true;
    root.classList.add('is-busy');
    heard.textContent = question ? `Tú: ${question}` : '';
    answer.textContent = '…';
    source.textContent = '';
    try {
      const reply = await askRover({ question, history, snapshot: getSnapshot() });
      if (question) history.push({ role: 'user', content: question });
      history.push({ role: 'assistant', content: reply.text });
      answer.textContent = reply.text;
      source.textContent = [
        reply.source ? `Fuente: ${reply.source}` : '',
        reply.error ? 'El LLM no respondió; esta respuesta sale de los datos de muestra.' : '',
      ].filter(Boolean).join(' · ');
      renderMode(reply.mode);
      if (voiceOn) speech.speak(reply.text);
    } finally {
      busy = false;
      root.classList.remove('is-busy');
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = '';
    ask(question);
  });
  another.addEventListener('click', () => ask(''));

  micButton.addEventListener('click', async () => {
    if (speech.isListening()) {
      speech.stopListening();
      return;
    }
    speech.cancelSpeech();
    micButton.classList.add('is-listening');
    micButton.textContent = '● Escuchando…';
    heard.textContent = 'Te escucho…';
    try {
      const text = await speech.listen({ onPartial: (partial) => { heard.textContent = `Tú: ${partial}`; } });
      if (text) ask(text);
      else heard.textContent = 'No te oí. Prueba otra vez o escribe la pregunta.';
    } catch (error) {
      heard.textContent = error.message;
    } finally {
      micButton.classList.remove('is-listening');
      micButton.textContent = '🎙 Hablar';
    }
  });

  voiceToggle.addEventListener('click', () => {
    voiceOn = !voiceOn;
    if (!voiceOn) speech.cancelSpeech();
    renderMode();
  });

  // Esc cierra la conversación esté donde esté el foco, y esa pulsación no llega a
  // nadie más (si llegara, el modo a pie la tomaría por "abrir el menú").
  function onEscape(event) {
    if (event.code !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }

  function close() {
    if (root.hidden) return;
    root.hidden = true;
    window.removeEventListener('keydown', onEscape, true);
    speech.stopListening();
    speech.cancelSpeech();
    onClose?.();
  }
  closeButton.addEventListener('click', close);
  // Las teclas del chat no deben mover al astronauta ni abrir el menú.
  root.addEventListener('keydown', (event) => event.stopPropagation());
  root.addEventListener('keyup', (event) => event.stopPropagation());

  return {
    element: root,
    isOpen: () => !root.hidden,
    close,
    open() {
      if (!root.hidden) return;
      root.hidden = false;
      window.addEventListener('keydown', onEscape, true);
      renderMode();
      input.focus();
      // Saluda con un dato; así siempre hay algo que leer aunque no se pregunte nada.
      ask('');
    },
  };
}
