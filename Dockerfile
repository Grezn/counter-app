FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
# 使用 lockfile 固定 dependencies，讓 CI / EC2 重建 image 可重現。
# Vue/Vite 只在 build 階段使用，build 完會移除 dev dependencies。
RUN npm ci

# .dockerignore 會避免秘密、Terraform state 和不必要檔案被打進 image。
# --chown 讓非 root 的 node 使用者也能讀取 app 檔案。
COPY --chown=node:node . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 3000

USER node

CMD ["npm", "start"]
