// 背景音乐:优先循环播放用户自备的 /audio/bgm.mp3(官方 BGM 版权归游卡,
// 请自备并仅个人使用);文件不存在时,用 WebAudio 现场合成一段
// 五声音阶(宫调)的古筝风循环作为兜底,无需任何音频资源。
// 必须在用户手势(点击)之后调用 startBgm,否则浏览器会拦截自动播放。

let playing = false;
let audioEl: HTMLAudioElement | null = null;
let ctx: AudioContext | null = null;
let schedTimer: ReturnType<typeof setInterval> | null = null;
let nextNoteTime = 0;
let stepIdx = 0;

// A 宫五声(A B D E G)两个八度
const SCALE = [220, 246.94, 293.66, 329.63, 392, 440, 493.88, 587.33, 659.25];
// 32 步旋律,-1 为休止;步长 ~0.45s,舒缓不抢戏
const PATTERN = [
  5, -1, 4, 3, 2, -1, 3, 2, 0, -1, 1, 2, 3, -1, 2, -1,
  5, -1, 4, 3, 7, -1, 5, 4, 3, -1, 2, 3, 1, -1, 0, -1,
];

// 拨弦音色:三角波 + 快起音指数衰减,叠一只轻微失谐的副振荡器
function pluck(at: number, freq: number, vol: number): void {
  if (!ctx) return;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, at);
  master.gain.exponentialRampToValueAtTime(vol, at + 0.02);
  master.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
  master.connect(ctx.destination);
  for (const [detune, amp] of [[0, 1], [4, 0.35]] as const) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    osc.detune.value = detune;
    const g = ctx.createGain();
    g.gain.value = amp;
    osc.connect(g);
    g.connect(master);
    osc.start(at);
    osc.stop(at + 1.5);
  }
}

function startSynth(): void {
  if (!playing || ctx) return;
  try {
    ctx = new AudioContext();
  } catch {
    return; // 无 WebAudio 环境:静音
  }
  nextNoteTime = ctx.currentTime + 0.15;
  stepIdx = 0;
  schedTimer = setInterval(() => {
    if (!ctx) return;
    while (nextNoteTime < ctx.currentTime + 0.7) {
      const st = PATTERN[stepIdx % PATTERN.length];
      if (st >= 0) pluck(nextNoteTime, SCALE[st], 0.11);
      if (stepIdx % 8 === 0) pluck(nextNoteTime, SCALE[0] / 2, 0.07); // 低音衬底
      stepIdx += 1;
      nextNoteTime += 0.45;
    }
  }, 200);
}

export function startBgm(): void {
  if (playing) return;
  playing = true;
  const el = new Audio('/audio/bgm.mp3');
  el.loop = true;
  el.volume = 0.35;
  el.addEventListener('error', () => {
    // 没有自备文件:回退到合成 BGM
    if (audioEl === el) audioEl = null;
    startSynth();
  });
  el.play().then(() => {
    audioEl = el;
  }).catch(() => {
    if (playing && !ctx) startSynth();
  });
}

export function stopBgm(): void {
  playing = false;
  if (audioEl) {
    audioEl.pause();
    audioEl = null;
  }
  if (schedTimer) {
    clearInterval(schedTimer);
    schedTimer = null;
  }
  if (ctx) {
    void ctx.close().catch(() => {});
    ctx = null;
  }
}

export function isBgmOn(): boolean {
  return playing;
}
