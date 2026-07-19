import { createServer } from './server';
import { DEFAULT_PORT } from '../net/protocol';

const port = Number(process.env.PORT ?? DEFAULT_PORT);
createServer({ port });
// eslint-disable-next-line no-console
console.log(`三国杀联机服务器已启动:ws://localhost:${port}`);
