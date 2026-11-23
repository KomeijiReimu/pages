FROM oven/bun:1.3.13 AS bun

FROM node:22-slim
WORKDIR /usr/src/app
COPY --from=bun /usr/local/bin/bun /usr/local/bin/bun
COPY package.json bun.lock ./
RUN test "bun@$(bun --version)" = "$(node -p 'require("./package.json").packageManager')" \
    && bun install --frozen-lockfile
COPY . .
ENTRYPOINT ["node", "./quartz/bootstrap-cli.mjs"]
CMD ["build", "--serve", "--host", "0.0.0.0"]
