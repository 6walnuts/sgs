# 单容器部署:构建前端后由联机服务器同端口托管页面与 WebSocket
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
ENV PORT=8081
EXPOSE 8081
CMD ["npm", "run", "server"]
