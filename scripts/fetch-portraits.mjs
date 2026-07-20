#!/usr/bin/env node
// 从 Wikimedia Commons 下载武将的公有领域历史画像到 public/generals/。
// 只接受许可为公有领域(Public domain / PD / CC0)的文件,并生成 CREDITS.md 记录来源。
// 用法:npm run portraits [-- --force]
// 需要在能访问 commons.wikimedia.org 的网络环境下运行。

import { mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';

const OUT_DIR = path.resolve(process.cwd(), 'public/generals');
const WIDTH = 480; // 下载的缩略图宽度,足够 62~180px 的展示
const FORCE = process.argv.includes('--force');
const API = process.env.SGS_COMMONS_API ?? 'https://commons.wikimedia.org/w/api.php';

// 每名武将:优先尝试的候选文件名(历史画像),找不到则用检索词在 Commons 搜索
const GENERALS = [
  { id: 'liubei', name: '刘备', candidates: ['Liu Bei Tang.jpg', 'Liu Bei scth.jpg'], search: 'Liu Bei portrait Sancai Tuhui' },
  { id: 'guanyu', name: '关羽', candidates: ['Guan Yu scth.jpg', 'Guan Yu Sancai Tuhui.jpg'], search: 'Guan Yu portrait Sancai Tuhui' },
  { id: 'caocao', name: '曹操', candidates: ['Cao Cao scth.jpg', 'Cao Cao Portrait.jpg'], search: 'Cao Cao portrait Sancai Tuhui' },
  { id: 'simayi', name: '司马懿', candidates: ['Sima Yi Scth.jpg', 'Sima Yi scth.jpg'], search: 'Sima Yi portrait Sancai Tuhui' },
  { id: 'sunquan', name: '孙权', candidates: ['Sun Quan Tang.jpg', 'Sun Quan scth.jpg'], search: 'Sun Quan portrait Tang dynasty' },
  { id: 'ganning', name: '甘宁', candidates: ['Gan Ning Qing illustration.jpg'], search: 'Gan Ning illustration Romance of the Three Kingdoms' },
  { id: 'diaochan', name: '貂蝉', candidates: ['Diaochan Qing dynasty illustration.jpg', 'Diau Charn.jpg'], search: 'Diaochan illustration Qing dynasty' },
  { id: 'huatuo', name: '华佗', candidates: ['Hua Tuo.jpg', 'Huatuo.jpg', 'Hua To.jpg'], search: 'Hua Tuo portrait Qing dynasty' },
  { id: 'xiahoudun', name: '夏侯惇', candidates: ['Xiahou Dun Qing illustration.jpg'], search: 'Xiahou Dun illustration Romance of the Three Kingdoms' },
  { id: 'zhangliao', name: '张辽', candidates: ['Zhang Liao Qing illustration.jpg'], search: 'Zhang Liao illustration Romance of the Three Kingdoms' },
  { id: 'xuchu', name: '许褚', candidates: ['Xu Chu Qing illustration.jpg'], search: 'Xu Chu illustration Romance of the Three Kingdoms' },
  { id: 'guojia', name: '郭嘉', candidates: ['Guo Jia Qing illustration.jpg'], search: 'Guo Jia illustration Romance of the Three Kingdoms' },
  { id: 'zhenji', name: '甄姬', candidates: ['Empress Zhen.jpg'], search: 'Lady Zhen illustration Qing dynasty' },
  { id: 'zhangfei', name: '张飞', candidates: ['Zhang Fei Qing illustration.jpg'], search: 'Zhang Fei illustration Romance of the Three Kingdoms' },
  { id: 'zhugeliang', name: '诸葛亮', candidates: ['Zhuge Liang scth.jpg', 'Zhuge Liang Tang.jpg'], search: 'Zhuge Liang portrait Sancai Tuhui' },
  { id: 'zhaoyun', name: '赵云', candidates: ['Zhao Yun Qing illustration.jpg'], search: 'Zhao Yun illustration Romance of the Three Kingdoms' },
  { id: 'machao', name: '马超', candidates: ['Ma Chao Qing illustration.jpg'], search: 'Ma Chao illustration Romance of the Three Kingdoms' },
  { id: 'huangyueying', name: '黄月英', candidates: [], search: 'Huang Yueying illustration Romance of the Three Kingdoms' },
  { id: 'lvmeng', name: '吕蒙', candidates: ['Lu Meng Qing illustration.jpg'], search: 'Lu Meng illustration Romance of the Three Kingdoms' },
  { id: 'huanggai', name: '黄盖', candidates: ['Huang Gai Qing illustration.jpg'], search: 'Huang Gai illustration Romance of the Three Kingdoms' },
  { id: 'zhouyu', name: '周瑜', candidates: ['Zhou Yu portrait.jpg'], search: 'Zhou Yu illustration Romance of the Three Kingdoms' },
  { id: 'daqiao', name: '大乔', candidates: [], search: 'Da Qiao illustration Qing dynasty' },
  { id: 'luxun', name: '陆逊', candidates: ['Lu Xun Qing illustration.jpg'], search: 'Lu Xun Three Kingdoms illustration' },
  { id: 'sunshangxiang', name: '孙尚香', candidates: ['Sun Shangxiang Qing illustration.jpg'], search: 'Sun Shangxiang illustration Romance of the Three Kingdoms' },
  { id: 'lvbu', name: '吕布', candidates: ['Lu Bu Qing illustration.jpg'], search: 'Lu Bu illustration Romance of the Three Kingdoms' },
];

const PD_PATTERN = /public\s*domain|^pd\b|pd-|cc0/i;

async function api(params) {
  const url = `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
  const res = await fetch(url, { headers: { 'user-agent': 'sgs-portrait-fetcher/1.0 (personal game project)' } });
  if (!res.ok) throw new Error(`Commons API HTTP ${res.status}`);
  return res.json();
}

function pageInfo(page) {
  const info = page?.imageinfo?.[0];
  if (!info) return null;
  const meta = info.extmetadata ?? {};
  const license = meta.LicenseShortName?.value ?? meta.License?.value ?? '';
  const artist = (meta.Artist?.value ?? '').replace(/<[^>]*>/g, '').trim();
  return {
    title: page.title,
    license,
    artist,
    thumbUrl: info.thumburl ?? info.url,
    pageUrl: info.descriptionurl,
    isPd: PD_PATTERN.test(license),
  };
}

async function lookupByTitle(title) {
  const data = await api({
    action: 'query',
    titles: `File:${title}`,
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(WIDTH),
  });
  const pages = Object.values(data.query?.pages ?? {});
  if (pages.length === 0 || pages[0].missing !== undefined) return null;
  return pageInfo(pages[0]);
}

async function searchPd(query) {
  const data = await api({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrnamespace: '6',
    gsrlimit: '10',
    prop: 'imageinfo',
    iiprop: 'url|extmetadata',
    iiurlwidth: String(WIDTH),
  });
  const pages = Object.values(data.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  for (const page of pages) {
    if (!/\.(jpe?g|png)$/i.test(page.title ?? '')) continue;
    const info = pageInfo(page);
    if (info?.isPd) return info;
  }
  return null;
}

async function download(url, file) {
  const res = await fetch(url, { headers: { 'user-agent': 'sgs-portrait-fetcher/1.0 (personal game project)' } });
  if (!res.ok) throw new Error(`下载失败 HTTP ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const credits = [];
  let ok = 0;

  for (const g of GENERALS) {
    const out = path.join(OUT_DIR, `${g.id}.jpg`);
    if (!FORCE && await exists(out)) {
      console.log(`跳过 ${g.name}(${g.id}.jpg 已存在,--force 可覆盖)`);
      continue;
    }
    try {
      let info = null;
      for (const title of g.candidates) {
        const found = await lookupByTitle(title);
        if (found?.isPd) {
          info = found;
          break;
        }
      }
      if (!info) info = await searchPd(g.search);
      if (!info) {
        console.warn(`✗ ${g.name}:未找到公有领域画像,请手动放置 ${g.id}.jpg`);
        continue;
      }
      await download(info.thumbUrl, out);
      ok++;
      credits.push(`- ${g.name}(${g.id}.jpg):[${info.title}](${info.pageUrl}),许可:${info.license}${info.artist ? `,作者:${info.artist}` : ''}`);
      console.log(`✓ ${g.name} ← ${info.title}(${info.license})`);
    } catch (e) {
      console.warn(`✗ ${g.name}:${e.message}`);
    }
  }

  if (credits.length > 0) {
    const header = '# 武将画像来源\n\n以下图片来自 Wikimedia Commons,均为公有领域(Public Domain)历史画像:\n\n';
    await writeFile(path.join(OUT_DIR, 'CREDITS.md'), header + credits.join('\n') + '\n');
  }
  console.log(`\n完成:${ok}/${GENERALS.length} 张已下载到 public/generals/。`);
  console.log('请打开游戏确认画像是否合适;不满意可删除对应 jpg 回退到内置矢量头像,或手动替换。');
}

main().catch((e) => {
  console.error(`执行失败:${e.message}`);
  console.error('请确认当前网络能访问 commons.wikimedia.org 后重试。');
  process.exit(1);
});
