# Docker Setup

## Services

- `frontend`: production build served by Nginx on `http://localhost:8080`
- `backend`: Node/Express API on `http://localhost:5001`
- `mongodb`: MongoDB database on `mongodb://localhost:27017`

## Start the stack

```bash
docker compose up --build
```

## Run in background

```bash
docker compose up --build -d
```

## Stop the stack

```bash
docker compose down
```

## Remove containers and database volume

```bash
docker compose down -v
```

## Environment notes

- The compose file injects a working default `MONGODB_URI` for containers.
- The frontend is built with `VITE_API_URL=/api` and proxies API traffic to the backend through Nginx.
- For real API keys or contract secrets, replace the placeholder backend environment values with your own before production use.

## Endpoints

- Frontend: `http://localhost:8080`
- Backend API: `http://localhost:5001`
- Backend health check: `http://localhost:5001/api/health/live`

## Rebuild after code changes

```bash
docker compose up --build
```
