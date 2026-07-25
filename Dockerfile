FROM node:22-alpine

RUN addgroup app && adduser app -G app -D
WORKDIR /home/app
USER app

COPY --chown=app:app package*.json ./
RUN npm i --omit=dev && rm -r ~/.npm || true

COPY --chown=app:app . ./

ENV APIFY_LOG_LEVEL=INFO

CMD npm start --silent
