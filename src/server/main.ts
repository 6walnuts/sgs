import { existsSync } from 'node:fs';
import path from 'node:path';
import { createServer } from './server';
import { DEFAULT_PORT } from '../net/protocol';

const port = Number(process.env.PORT ?? DEFAULT_PORT);
const dist = path.resolve(process.cwd(), 'dist');
const staticDir = existsSync(dist) ? dist : undefined;
createServer({ port, staticDir });
/* eslint-disable no-console */
if (staticDir) {
  console.log(`三国杀服务器已启动:http://localhost:${port}(页面与联机同端口)`);
} else {
  console.log(`三国杀联机服务器已启动:ws://localhost:${port}`);
  console.log('提示:先 npm run build 再启动,可在同端口直接提供游戏页面。');
}
