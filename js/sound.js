// Keyron Sound — efeitos sonoros sintetizados localmente via Web Audio API.
// Nenhum arquivo de áudio é carregado: o "som de sabre passando no ar" é gerado
// na hora com ruído filtrado (varredura de frequência) + um zumbido grave discreto.
const KeyronSound = (() => {
  'use strict';

  let ctx = null;

  function getContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) ctx = new AudioCtx();
    return ctx;
  }

  function noiseBuffer(context, duration) {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function swoosh({ rise = false, volume = 1 } = {}) {
    const context = getContext();
    if (!context) return;
    if (context.state === 'suspended') context.resume().catch(() => null);

    const duration = 0.42;
    const now = context.currentTime;

    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer(context, duration);

    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(rise ? 420 : 1500, now);
    filter.frequency.exponentialRampToValueAtTime(rise ? 1700 : 320, now + duration);

    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.5 * volume, now + duration * 0.22);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    const hum = context.createOscillator();
    hum.type = 'sine';
    hum.frequency.setValueAtTime(rise ? 150 : 210, now);
    hum.frequency.exponentialRampToValueAtTime(rise ? 260 : 120, now + duration);

    const humGain = context.createGain();
    humGain.gain.setValueAtTime(0.0001, now);
    humGain.gain.exponentialRampToValueAtTime(0.06 * volume, now + duration * 0.3);
    humGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(filter).connect(noiseGain).connect(context.destination);
    hum.connect(humGain).connect(context.destination);

    noise.start(now);
    hum.start(now);
    noise.stop(now + duration + 0.02);
    hum.stop(now + duration + 0.02);
  }

  function playLock() { swoosh({ rise: false }); }
  function playUnlock() { swoosh({ rise: true }); }

  return Object.freeze({ playLock, playUnlock });
})();
