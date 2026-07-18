# Multi-stage build (fixed 2026-07-18): the previous single-stage image installed with
# --omit=dev and then ran `npm run build` — but tsc is a devDependency, so the image
# could never build. Stage 1 installs everything and compiles; stage 2 ships only
# production deps + dist.

FROM node:20-alpine AS build
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci && npx prisma generate
COPY . .
RUN npm run build

FROM node:20-alpine
RUN apk add --no-cache openssl
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev && npx prisma generate && npm cache clean --force
COPY --from=build /app/dist ./dist
EXPOSE 3001
CMD ["npm", "start"]
