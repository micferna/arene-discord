# --- Étape build : installe tout et compile le client (Vite) ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json ./client/
COPY server/package.json ./server/
RUN npm install
COPY . .
RUN npm run build

# --- Étape runtime : Node léger qui sert le jeu + l'API + le WebSocket ---
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
# dépendances serveur uniquement (express, ws, dotenv)
COPY server/package.json ./server/
RUN cd server && npm install --omit=dev
COPY server ./server
COPY --from=build /app/client/dist ./client/dist
EXPOSE 3001
CMD ["node", "server/index.js"]
