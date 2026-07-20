// 卡牌语音:出牌/打出时报牌名。
// 音源优先级:1) /audio/cards/<性别>/<牌名>.ogg(基本牌与锦囊按使用者性别)
// → 2) /audio/cards/<牌名>.ogg(装备等无性别音效)
// → 3) 浏览器语音合成(Web Speech API)现场念牌名兜底。
// 内置音效复刻自 QSanguosha-v2 项目的官方素材,版权归游卡桌游,仅个人使用,
// 勿公开分发(见 public/audio/cards/SOURCES.md)。

import { SKILL_VOICES } from './fxManifest';

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

// 技能语音:多台词随机挑一条;没有音源的技能念名字兜底
export function playSkillVoice(skill: string, label: string): void {
  const n = SKILL_VOICES[skill];
  if (!n) {
    speak(label);
    return;
  }
  const pick = n > 1 ? String(1 + Math.floor(Math.random() * n)) : '';
  tryUrls([`/audio/skills/${skill}${pick}.ogg`], () => speak(label));
}

// 阵亡语音:独立通道,不被后续出牌语音顶掉;界版沿用原版台词
let deathCh: HTMLAudioElement | null = null;

export function playDeathVoice(general: string): void {
  const base = general.startsWith('jie') ? general.slice(3) : general;
  const url = `/audio/deaths/${base}.ogg`;
  if (fileKnown.get(url) === false) return;
  const el = new Audio(url);
  el.volume = 0.9;
  el.addEventListener('error', () => fileKnown.set(url, false));
  el.play().then(() => {
    fileKnown.set(url, true);
    deathCh?.pause();
    deathCh = el;
  }).catch(() => fileKnown.set(url, false));
}

// 短音效(受伤/胜负):即发即忘,可与人声叠放
export function playSystemSound(name: string, volume = 0.55): void {
  const url = `/audio/system/${name}.ogg`;
  if (fileKnown.get(url) === false) return;
  const el = new Audio(url);
  el.volume = volume;
  el.addEventListener('error', () => fileKnown.set(url, false));
  el.play().then(() => fileKnown.set(url, true)).catch(() => fileKnown.set(url, false));
}
