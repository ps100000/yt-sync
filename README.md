# YT-Sync - A video synchronization webapp with minimal external JS 
![Overview of main page](readme-resources/main.png?raw=true "The application main page")

YT-Sync is a webapp allowing you to watch YouTube videos together in sync.\
It's build to use as few external JS resources and APIs as possible - only loading the needed API to embed, load and play videos.

It consists of a very simple Angular application, which can be easily extended with additional features and a websocket server written in C++.

The hole application can be quickly deployed using 2 Docker containers.\
One for the Angular app and one for the server.

| Similar commercial page | YT-Sync |
| - | - |
| ![Screenshot of UMatrix on a similar page. Showing the usage of multiple additional CDNs, trackers, advertisements, ...](readme-resources/commercial.png?raw=true "Resources loaded by similar applications for comparison") | ![Screenshot of UMatrix showing that only the resources used by the YT API are loaded by YT-Sync](readme-resources/minimal.png?raw=true "Resources loaded by YT-Sync") |

## Build & deploy Docker-container 
You can build the containers yourself by running

    docker build -t yt-sync-server:latest -f ./docker/server/Dockerfile .
    docker build -t yt-sync-frontend:latest -f ./docker/frontend/Dockerfile .

After that you can deploy the application using the following docker compose:

``` yaml
version: "2"
services:
  server:
    image: yt-sync-server:latest
    networks:
      backend:
        ipv4_address: 10.10.10.2
    restart: unless-stopped
  frontend:
    image: yt-sync-frontend:latest
    environment:
      - BACKEND_SERVER_URL=10.10.10.2:9002
    networks:
      backend:
    restart: unless-stopped
    depends_on:
      - server
networks:
  backend:
    driver: bridge
    ipam:
      config:
        - subnet: 10.10.10.0/24
          ip_range: 10.10.10.0/24
          gateway: 10.10.10.1
    internal: true
```
If you use a different network/IPs for your containers make sure to adapt  `BACKEND_SERVER_URL` accordingly.
