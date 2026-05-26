FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# 使用 lockfile 固定 production dependencies，讓 CI / EC2 重建 image 可重現。
RUN npm ci --omit=dev

# .dockerignore 會避免秘密、Terraform state 和不必要檔案被打進 image。
# --chown 讓非 root 的 node 使用者也能讀取 app 檔案。
COPY --chown=node:node . .

EXPOSE 3000

USER node

CMD ["npm", "start"]
