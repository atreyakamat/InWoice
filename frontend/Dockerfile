FROM node:18-alpine

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install --silent

COPY . .

# Build step (Optional: For production use Nginx)
# For simple homelab use, let's run the dev server or build & serve
RUN npm run build
RUN npm install -g serve

EXPOSE 3000
CMD ["serve", "-s", "build", "-l", "3000"]
