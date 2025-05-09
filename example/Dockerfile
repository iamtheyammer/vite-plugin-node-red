# Compile nodes
FROM node:lts-alpine3.20 AS build

COPY package.json /project/package.json
COPY yarn.lock /project/yarn.lock
COPY .yarnrc.yml /project/.yarnrc.yml
COPY plugin/ /project/plugin

WORKDIR /project
RUN corepack enable
RUN yarn

COPY . /project
RUN yarn build

# Run Node-RED
FROM nodered/node-red

# Copy in compiled nodes
COPY --from=build /project/dist /nodes-out

# Add custom nodes
WORKDIR /usr/src/node-red
RUN npm install /nodes-out --unsafe-perm --no-update-notifier --no-fund --only=production
