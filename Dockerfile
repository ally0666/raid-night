FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=5173
EXPOSE 5173

CMD ["node", "server/prod.mjs"]
