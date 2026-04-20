// Web Audio API sound engine
"use strict";
import { bus } from './state.js';

let ctx = null;
let masterGain = null;
let thrustNode = null;
let ambientNode = null;
let muted = false;

function getCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = ctx.createGain();
    masterGain.gain.value = 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    masterGain.connect(filter);
    filter.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function oneShot(freq, type, dur, vol = 0.3) {
  if (muted) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.3, c.currentTime + dur);
  g.gain.setValueAtTime(vol, c.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
  osc.connect(g); g.connect(masterGain);
  osc.start(); osc.stop(c.currentTime + dur);
}

function startThrust() {
  if (muted || thrustNode) return;
  const c = getCtx();
  const bufSize = c.sampleRate * 0.5;
  const buf = c.createBuffer(1, bufSize, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1) * 0.7;
  const src = c.createBufferSource();
  src.buffer = buf; src.loop = true;
  const g = c.createGain(); g.gain.value = 0.18;
  const filt = c.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.value = 120; filt.Q.value = 2;
  src.connect(filt); filt.connect(g); g.connect(masterGain);
  src.start();
  thrustNode = { src, g };
}

function stopThrust() {
  if (!thrustNode) return;
  thrustNode.g.gain.exponentialRampToValueAtTime(0.001, getCtx().currentTime + 0.2);
  setTimeout(() => { try { thrustNode.src.stop(); } catch {} thrustNode = null; }, 250);
}

function startAmbient() {
  if (muted || ambientNode) return;
  const c = getCtx();
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = 'sine'; osc.frequency.value = 38;
  g.gain.value = 0.08;
  osc.connect(g); g.connect(masterGain);
  osc.start();
  ambientNode = { osc, g };
}

function stopAmbient() {
  if (!ambientNode) return;
  try { ambientNode.osc.stop(); } catch {}
  ambientNode = null;
}

export const Audio = {
  init() {
    bus.on('ship:thrust:start', () => startThrust());
    bus.on('ship:thrust:stop',  () => stopThrust());
    bus.on('ship:land',    () => { oneShot(300, 'sine',     1.2, 0.4); oneShot(400, 'triangle', 0.8, 0.25); });
    bus.on('ship:jump',    () => { oneShot(60,  'sine',     2.5, 0.5); oneShot(120, 'sine',     1.8, 0.3);  });
    bus.on('weapon:fire',  () => oneShot(220, 'square',   0.15, 0.25));
    bus.on('tower:build',  () => { oneShot(440, 'triangle', 0.3, 0.3); oneShot(660, 'triangle', 0.2, 0.2); });
    bus.on('tower:fire',   () => oneShot(180, 'square',   0.1,  0.15));
    bus.on('mech:move',    () => oneShot(80,  'triangle', 0.12, 0.1));
    bus.on('mode:changed', d => {
      stopAmbient();
      if (d.mode === 'space') startAmbient();
    });
    startAmbient();
  },

  toggleMute() {
    muted = !muted;
    if (masterGain) masterGain.gain.value = muted ? 0 : 0.4;
    return muted;
  },

  beep(freq = 440) { oneShot(freq, 'sine', 0.2, 0.3); }
};
