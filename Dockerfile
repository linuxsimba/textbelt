FROM node:carbon

WORKDIR /usr/src/app

COPY package*.json ./

RUN npm install

COPY . .

RUN touch server/torlist


EXPOSE 9090

CMD ["npm", "start"]


