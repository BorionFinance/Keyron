// Keyron Sound — efeitos originais sintetizados localmente via Web Audio API.
// Nenhum arquivo de áudio externo é carregado. Os sons usam movimentos curtos
// de energia sci-fi: “VWHOOM” ao abrir e “VRRRT” ao bloquear.
const KeyronSound = (() => {
  'use strict';

  let ctx = null;
  let output = null;

  function getContext() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;

    if (!ctx) {
      ctx = new AudioCtx();

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -20;
      compressor.knee.value = 18;
      compressor.ratio.value = 5;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.16;

      output = ctx.createGain();
      output.gain.value = 0.68;
      output.connect(compressor).connect(ctx.destination);
    }

    return ctx;
  }

  function resume(context) {
    if (context.state === 'suspended') context.resume().catch(() => null);
  }

  function noiseBuffer(context, duration) {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;

    for (let i = 0; i < length; i += 1) {
      const white = (Math.random() * 2) - 1;
      previous = (previous * 0.5) + (white * 0.5);
      data[i] = previous;
    }

    return buffer;
  }

  function envelope(context, source, start, attackEnd, sustainEnd, end, peak, sustain = peak * 0.65) {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), attackEnd);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), sustainEnd);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    source.connect(gain);
    return gain;
  }

  function playUnlock() {
    const context = getContext();
    if (!context || !output) return;
    resume(context);

    const now = context.currentTime + 0.012;
    const end = now + 0.68;

    // Impacto inicial curto: o “V” do VWHOOM.
    const ignition = context.createBufferSource();
    ignition.buffer = noiseBuffer(context, 0.09);

    const ignitionBand = context.createBiquadFilter();
    ignitionBand.type = 'bandpass';
    ignitionBand.Q.value = 1.1;
    ignitionBand.frequency.setValueAtTime(1250, now);
    ignitionBand.frequency.exponentialRampToValueAtTime(430, now + 0.085);

    const ignitionGain = context.createGain();
    ignitionGain.gain.setValueAtTime(0.0001, now);
    ignitionGain.gain.exponentialRampToValueAtTime(0.3, now + 0.006);
    ignitionGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    ignition.connect(ignitionBand).connect(ignitionGain).connect(output);

    // Corpo grave ascendente: faz o “WHOOM” crescer e abrir.
    const body = context.createOscillator();
    body.type = 'sawtooth';
    body.frequency.setValueAtTime(48, now);
    body.frequency.exponentialRampToValueAtTime(178, now + 0.23);
    body.frequency.exponentialRampToValueAtTime(104, now + 0.43);
    body.frequency.exponentialRampToValueAtTime(88, end);

    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.Q.value = 2.2;
    bodyFilter.frequency.setValueAtTime(380, now);
    bodyFilter.frequency.exponentialRampToValueAtTime(1850, now + 0.25);
    bodyFilter.frequency.exponentialRampToValueAtTime(620, end);

    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(0.0001, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.25, now + 0.055);
    bodyGain.gain.exponentialRampToValueAtTime(0.18, now + 0.28);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, end);
    body.connect(bodyFilter).connect(bodyGain).connect(output);

    // Segundo harmônico para deixar o movimento mais nítido em alto-falante de celular.
    const harmonic = context.createOscillator();
    harmonic.type = 'triangle';
    harmonic.frequency.setValueAtTime(96, now);
    harmonic.frequency.exponentialRampToValueAtTime(356, now + 0.23);
    harmonic.frequency.exponentialRampToValueAtTime(208, now + 0.44);
    harmonic.frequency.exponentialRampToValueAtTime(176, end);

    const harmonicBand = context.createBiquadFilter();
    harmonicBand.type = 'bandpass';
    harmonicBand.Q.value = 2.8;
    harmonicBand.frequency.setValueAtTime(480, now);
    harmonicBand.frequency.exponentialRampToValueAtTime(2200, now + 0.24);
    harmonicBand.frequency.exponentialRampToValueAtTime(900, end);

    const harmonicGain = context.createGain();
    harmonicGain.gain.setValueAtTime(0.0001, now);
    harmonicGain.gain.exponentialRampToValueAtTime(0.085, now + 0.07);
    harmonicGain.gain.exponentialRampToValueAtTime(0.055, now + 0.31);
    harmonicGain.gain.exponentialRampToValueAtTime(0.0001, end);
    harmonic.connect(harmonicBand).connect(harmonicGain).connect(output);

    // Varredura brilhante que sobe junto do corpo, sem virar som de vento.
    const sweep = context.createBufferSource();
    sweep.buffer = noiseBuffer(context, 0.52);

    const sweepBand = context.createBiquadFilter();
    sweepBand.type = 'bandpass';
    sweepBand.Q.value = 4.1;
    sweepBand.frequency.setValueAtTime(240, now + 0.01);
    sweepBand.frequency.exponentialRampToValueAtTime(2650, now + 0.24);
    sweepBand.frequency.exponentialRampToValueAtTime(760, now + 0.52);

    const sweepGain = context.createGain();
    sweepGain.gain.setValueAtTime(0.0001, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.13, now + 0.075);
    sweepGain.gain.exponentialRampToValueAtTime(0.075, now + 0.26);
    sweepGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
    sweep.connect(sweepBand).connect(sweepGain).connect(output);

    // Subgrave curto para dar peso sem prolongar o som.
    const sub = context.createOscillator();
    sub.type = 'sine';
    sub.frequency.setValueAtTime(38, now);
    sub.frequency.exponentialRampToValueAtTime(72, now + 0.2);
    sub.frequency.exponentialRampToValueAtTime(48, now + 0.46);
    const subGain = envelope(context, sub, now, now + 0.045, now + 0.25, now + 0.48, 0.19, 0.13);
    subGain.connect(output);

    ignition.start(now);
    body.start(now);
    harmonic.start(now);
    sweep.start(now);
    sub.start(now);

    ignition.stop(now + 0.1);
    body.stop(end + 0.02);
    harmonic.stop(end + 0.02);
    sweep.stop(now + 0.54);
    sub.stop(now + 0.5);
  }

  function playLock() {
    const context = getContext();
    if (!context || !output) return;
    resume(context);

    const now = context.currentTime + 0.01;
    const end = now + 0.46;

    // Núcleo descendente: retração rápida, o “VRRRT”.
    const retract = context.createOscillator();
    retract.type = 'sawtooth';
    retract.frequency.setValueAtTime(210, now);
    retract.frequency.exponentialRampToValueAtTime(54, end);

    const retractFilter = context.createBiquadFilter();
    retractFilter.type = 'lowpass';
    retractFilter.Q.value = 2.4;
    retractFilter.frequency.setValueAtTime(2300, now);
    retractFilter.frequency.exponentialRampToValueAtTime(260, end);

    const retractGain = context.createGain();
    retractGain.gain.setValueAtTime(0.0001, now);
    retractGain.gain.exponentialRampToValueAtTime(0.2, now + 0.025);
    retractGain.gain.exponentialRampToValueAtTime(0.14, now + 0.18);
    retractGain.gain.exponentialRampToValueAtTime(0.0001, end);
    retract.connect(retractFilter).connect(retractGain).connect(output);

    // Tremulação de amplitude para formar o “rrr” sem alongar o efeito.
    const tremolo = context.createOscillator();
    tremolo.type = 'square';
    tremolo.frequency.setValueAtTime(38, now);
    tremolo.frequency.exponentialRampToValueAtTime(18, end);

    const tremoloDepth = context.createGain();
    tremoloDepth.gain.setValueAtTime(0.055, now);
    tremoloDepth.gain.exponentialRampToValueAtTime(0.012, end);
    tremolo.connect(tremoloDepth).connect(retractGain.gain);

    // Rasgo elétrico descendente, com corte seco no final.
    const cut = context.createBufferSource();
    cut.buffer = noiseBuffer(context, 0.41);

    const cutBand = context.createBiquadFilter();
    cutBand.type = 'bandpass';
    cutBand.Q.value = 3.8;
    cutBand.frequency.setValueAtTime(2800, now);
    cutBand.frequency.exponentialRampToValueAtTime(180, end);

    const cutGain = context.createGain();
    cutGain.gain.setValueAtTime(0.0001, now);
    cutGain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    cutGain.gain.exponentialRampToValueAtTime(0.085, now + 0.16);
    cutGain.gain.exponentialRampToValueAtTime(0.0001, end);
    cut.connect(cutBand).connect(cutGain).connect(output);

    // Pequeno impacto final para transmitir “energia cortada”.
    const stopClick = context.createOscillator();
    stopClick.type = 'sine';
    stopClick.frequency.setValueAtTime(86, end - 0.07);
    stopClick.frequency.exponentialRampToValueAtTime(42, end);

    const stopGain = context.createGain();
    stopGain.gain.setValueAtTime(0.0001, end - 0.075);
    stopGain.gain.exponentialRampToValueAtTime(0.13, end - 0.06);
    stopGain.gain.exponentialRampToValueAtTime(0.0001, end);
    stopClick.connect(stopGain).connect(output);

    retract.start(now);
    tremolo.start(now);
    cut.start(now);
    stopClick.start(end - 0.08);

    retract.stop(end + 0.02);
    tremolo.stop(end + 0.02);
    cut.stop(end + 0.02);
    stopClick.stop(end + 0.01);
  }

  function prime() {
    const context = getContext();
    if (context) resume(context);
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', prime, { once: true, passive: true });
    document.addEventListener('keydown', prime, { once: true });
  }

  return Object.freeze({ playLock, playUnlock, prime });
})();
