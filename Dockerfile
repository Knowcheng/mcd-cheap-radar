FROM node:24-alpine
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3417
EXPOSE 3417
CMD ["node", "src/server.mjs"]
