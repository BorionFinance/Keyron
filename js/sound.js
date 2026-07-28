// Keyron Sound — efeitos sonoros sintetizados localmente via Web Audio API.
// Nenhum arquivo de áudio é carregado: o "som de sabre passando no ar" é gerado
// na hora com ruído filtrado e grave (sem os agudos de "sopro") + duas camadas de
// zumbido grave (a "onda" característica do sabre de luz) sob a varredura.
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

    const duration = 0.52;
    const now = context.currentTime;
    const from = rise ? 150 : 640;
    const to = rise ? 640 : 150;

    // Ruído grave: dá o "ar passando" sem o silvo agudo, cortando tudo acima de ~900Hz.
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer(context, duration);

    const bandpass = context.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.value = 0.75;
    bandpass.frequency.setValueAtTime(from, now);
    bandpass.frequency.exponentialRampToValueAtTime(to, now + duration);

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 950;

    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.38 * volume, now + duration * 0.24);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Zumbido médio-grave (dente de serra): a "vibração elétrica" característica da lâmina.
    const hum = context.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.setValueAtTime(rise ? 90 : 145, now);
    hum.frequency.exponentialRampToValueAtTime(rise ? 145 : 68, now + duration);

    const humGain = context.createGain();
    humGain.gain.setValueAtTime(0.0001, now);
    humGain.gain.exponentialRampToValueAtTime(0.16 * volume, now + duration * 0.3);
    humGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    // Sub-grave (senoide): peso por baixo do zumbido, sem ficar estridente.
    const sub = context.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(rise ? 45 : 70, now);
    sub.frequency.exponentialRampToValueAtTime(rise ? 70 : 36, now + duration);

    const subGain = context.createGain();
    subGain.gain.setValueAtTime(0.0001, now);
    subGain.gain.exponentialRampToValueAtTime(0.12 * volume, now + duration * 0.3);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(bandpass).connect(lowpass).connect(noiseGain).connect(context.destination);
    hum.connect(humGain).connect(context.destination);
    sub.connect(subGain).connect(context.destination);

    noise.start(now);
    hum.start(now);
    sub.start(now);
    noise.stop(now + duration + 0.02);
    hum.stop(now + duration + 0.02);
    sub.stop(now + duration + 0.02);
  }

  function playLock() { swoosh({ rise: false }); }
  function playUnlock() { swoosh({ rise: true }); }

  return Object.freeze({ playLock, playUnlock });
})();
