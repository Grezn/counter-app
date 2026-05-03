FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
# 目前還沒有 package-lock.json，所以先用 npm install。
# 以後有 lockfile 後，可以改成：RUN npm ci --omit=dev
RUN npm install --omit=dev

# .dockerignore 會避免秘密、Terraform state、重複資料夾被打進 image。
# --chown 讓非 root 的 node 使用者也能讀取 app 檔案。
COPY --chown=node:node . .

EXPOSE 3000

USER node

CMD ["npm", "start"]
