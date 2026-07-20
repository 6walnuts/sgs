// 卡牌语音:出牌/打出时报牌名。
// 音源优先级:1) /audio/cards/<性别>/<牌名>.ogg(基本牌与锦囊按使用者性别)
// → 2) /audio/cards/<牌名>.ogg(装备等无性别音效)
// → 3) 浏览器语音合成(Web Speech API)现场念牌名兜底。
// 内置音效复刻自 QSanguosha-v2 项目的官方素材,版权归游卡桌游,仅个人使用,
// 勿公开分发(见 public/audio/cards/SOURCES.md)。

let zhVoice: SpeechSynthesisVoice | null = null;
let voicesReady = false;

function pickVoice(): void {
  const vs = window.speechSynthesis?.getVoices() ?? [];
  zhVoice = vs.find((v) => v.lang.replace('_', '-').startsWith('zh')) ?? null;
  voicesReady = vs.length > 0;
}

if (typeof window !== 'undefined' && window.speechSynthesis) {
  pickVoice();
  window.speechSynthesis.addEventListener?.('voiceschanged', pickVoice);
}

function speak(text: string): void {
  const synth = window.speechSynthesis;
  if (!synth) return;
  if (!voicesReady) pickVoice();
  synth.cancel(); // 快节奏出牌时不排队,新牌名顶掉旧的
  const u = new SpeechSynthesisUtterance(text);
  if (zhVoice) u.voice = zhVoice;
  u.lang = 'zh-CN';
  u.rate = 1.15;
  u.volume = 0.9;
  synth.speak(u);
}

// url → 是否可用(false 后不再反复请求 404)
const fileKnown = new Map<string, boolean>();
let current: HTMLAudioElement | null = null;

function tryUrls(urls: string[], fallback: () => void): void {
  const next = urls.find((u) => fileKnown.get(u) !== false);
  if (next === undefined) {
    fallback();
    return;
  }
  const el = new Audio(next);
  el.volume = 0.8;
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    fileKnown.set(next, false);
    tryUrls(urls, fallback); // 该 url 已被记为不可用,自动试下一级
  };
  el.addEventListener('error', fail);
  el.play().then(() => {
    fileKnown.set(next, true);
    current?.pause(); // 顶掉上一条还没放完的
    current = el;
  }).catch(fail);
}

export function playCardVoice(cardName: string, label: string, gender: 'm' | 'f'): void {
  const g = gender === 'f' ? 'female' : 'male';
  tryUrls(
    [`/audio/cards/${g}/${cardName}.ogg`, `/audio/cards/${cardName}.ogg`],
    () => speak(label),
  );
}
