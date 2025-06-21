FROM node:18-alpine AS base
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install --omit=dev

#RUN mkdir auth
#RUN mkdir clients
#RUN mkdir utilities
#
#COPY ./auth/auth.js /auth
#COPY ./auth/cdp_api_key.json /auth
#COPY ./clients/influxClient.js /clients
#COPY ./utilities/calculations.js /utilities
#COPY ./utilities/responseParser.js /utilities

COPY ./auth ./auth
COPY ./clients ./clients
COPY ./utilities ./utilities


COPY CdpClient.js ./
COPY CdpClientImpl.js ./
COPY CdpClientMock.js ./
COPY tradebot.js ./
COPY config.json ./

CMD [ "node", "tradebot.js" ]
