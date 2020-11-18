FROM alpine AS builder
WORKDIR /server
RUN apk add --no-cache build-base wget git boost-dev
RUN mkdir nlohmann && cd nlohmann && wget https://raw.githubusercontent.com/nlohmann/json/develop/single_include/nlohmann/json.hpp
RUN git clone https://github.com/zaphoyd/websocketpp websocket
RUN mv websocket/websocketpp ./
COPY server/main.cpp .
RUN g++ -std=c++0x -I . -pthread  -Wall -Wcast-align  -lpthread -lrt -lboost_system -lboost_thread -lboost_random -lboost_atomic -lpthread -lboost_system  main.cpp -o server

FROM alpine
RUN apk add --no-cache boost
COPY --from=builder /server/server /usr/bin/
CMD server

