FROM node:carbon

WORKDIR /usr/src/app

RUN git clone https://github.com/linuxsimba/textbelt .

RUN npm install

RUN touch server/torlist


EXPOSE 9090

CMD ["npm", "start"]


