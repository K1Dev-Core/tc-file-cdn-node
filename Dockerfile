FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p public/uploads data && chown -R node:node /app
USER node
ENV NODE_ENV=production
EXPOSE 3002
CMD ["npm", "start"]
