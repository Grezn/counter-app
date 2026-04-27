FROM node:20-alpine

WORKDIR /app

COPY package.json ./

RUN npm install --omit=dev

COPY . .

ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ready || exit 1

CMD ["node", "server.js"]