FROM node:alpine AS builder

WORKDIR /app

COPY frontend/package.json .
RUN npm install

COPY frontend/ .
RUN npm run build

FROM nginx:alpine

COPY --from=builder app/dist/yt-sync/* /usr/share/nginx/html/
COPY docker/frontend/nginx.conf /etc/nginx/conf.d/default.conf.template
CMD /bin/sh -c "sed s#==BACKEND_SERVER_URL==#\$BACKEND_SERVER_URL# /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"
