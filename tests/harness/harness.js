// Harnais reproduisant le cycle de vie d'un widget Übersicht :
//   state = initialState ; init(dispatch) ; command(dispatch) toutes les
//   refreshFrequency ms ; dispatch(event) -> state = updateState(event, state)
//   puis render(state, dispatch). Exposé sur window.__harness pour Playwright.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import * as widget from 'widget-entry';

const container = document.getElementById('widget');
if (typeof widget.className === 'string') {
  const style = document.createElement('style');
  style.textContent = `#widget { ${widget.className} }`;
  document.head.appendChild(style);
} else if (widget.className && typeof widget.className === 'object') {
  Object.assign(container.style, widget.className);
}

const root = createRoot(container);
const harness = window.__harness = {
  state: widget.initialState !== undefined ? widget.initialState : { output: '' },
  events: [],
  errors: [],
  renders: 0,
  ready: false,
};

let rendering = false;
function paint() {
  const draw = () => {
    try {
      root.render(widget.render(harness.state, dispatch));
      harness.renders += 1;
    } catch (err) {
      harness.errors.push(String((err && err.stack) || err));
    }
  };
  // Rendu synchrone hors des gestionnaires React pour des assertions déterministes.
  if (rendering) draw();
  else {
    rendering = true;
    try { flushSync(draw); } catch (_) { draw(); } finally { rendering = false; }
  }
}

function dispatch(event) {
  harness.events.push(event && event.type);
  try {
    harness.state = typeof widget.updateState === 'function'
      ? widget.updateState(event, harness.state)
      : harness.state;
  } catch (err) {
    harness.errors.push(String((err && err.stack) || err));
  }
  // Übersicht re-rend après chaque événement ; on diffère pour sortir d'un éventuel rendu en cours.
  queueMicrotask(paint);
}

harness.dispatch = dispatch;
harness.runCommand = () => {
  if (typeof widget.command === 'function') {
    try { return Promise.resolve(widget.command(dispatch)).catch((e) => harness.errors.push(String(e))); }
    catch (err) { harness.errors.push(String(err)); }
  }
  return Promise.resolve();
};
harness.exportsList = Object.keys(widget);

window.addEventListener('error', (e) => harness.errors.push(String(e.message)));
window.addEventListener('unhandledrejection', (e) => harness.errors.push(String(e.reason)));

paint();
if (typeof widget.init === 'function') {
  try { widget.init(dispatch); } catch (err) { harness.errors.push(String(err)); }
}
harness.runCommand();
if (typeof widget.refreshFrequency === 'number' && widget.refreshFrequency > 0) {
  setInterval(harness.runCommand, widget.refreshFrequency);
}
harness.ready = true;
