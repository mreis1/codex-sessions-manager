FROM node:20-alpine
WORKDIR /app

ENV VITE_HOST=0.0.0.0
ENV VITE_PORT=5172

RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5172
CMD ["pnpm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5172"]
