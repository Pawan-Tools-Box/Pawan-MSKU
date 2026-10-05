# Oakcraft Master SKU CRM
# One image that builds the app, applies database migrations on start, and serves it on port 3000.
FROM node:22-alpine
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
# db:setup is safe to run on every start: migrations apply once, seed data is only added when missing.
CMD ["sh", "-c", "npm run db:setup && npm start"]
