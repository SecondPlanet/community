# deploy/ — self-hosting notes

Everything in this directory belongs to the single node Community Edition.

| File | Purpose |
| --- | --- |
| `nginx.conf` | Web server configuration: serves the SPA, proxies `/api` to the API and `/<bucket>` to the object storage. |
| `api-entrypoint.sh` | Entry point of the API container. |
| `migration-entrypoint.sh` | Entry point of the one-shot migration container: `prisma migrate deploy`, first-boot seed, CMS defaults. |
| `backup.sh` | Dumps the database and the object storage into `backups/<timestamp>/`. |
| `community-stack.test.mjs` | Asserts that the Compose stack stays a community single node stack. |

## Start

```bash
cp .env.example .env      # fill in the secrets, every secret is empty on purpose
docker compose up -d
docker compose logs -f api
```

The web server listens on `http://localhost:8080` (change `WEB_PORT` in `.env`).
The API, the database and Redis are reachable inside the Compose network only.

## Backups

```bash
bash deploy/backup.sh          # writes to backups/<UTC timestamp>/
```

`mysql.sql` is a consistent dump (`--single-transaction`), `objects/` is a copy
of the public object storage bucket. Restore the database with:

```bash
docker compose exec -T mysql sh -ec \
  'MYSQL_PWD="$MYSQL_PASSWORD" mysql -u"$MYSQL_USER" "$MYSQL_DATABASE"' < mysql.sql
```

The private bucket (hackathon attachments) is not part of the backup because it
holds personal data — copy it separately if you need it.

## HTTPS

The stack serves plain HTTP. Put a reverse proxy in front of the web server
(nginx, Caddy, Traefik …) and terminate TLS there. Set `PUBLIC_URL` in `.env`
to the `https://` address so CORS, password reset links and the public object
storage URL point to the right origin.

## Changing the object storage bucket

The public URL of an object is signed with the bucket name, and `nginx.conf`
routes the bucket path to the storage server. If you rename `MINIO_BUCKET` or
`MINIO_PRIVATE_BUCKET` in `.env`, update the two `location` blocks in
`nginx.conf` as well.

## 端口暴露提示

`docker-compose.yml` 默认把 MySQL (3306) 和对象存储 (9000/9001) 映射到宿主机，便于本地调试。
生产部署时建议删除这些 `ports:` 映射（容器网络内互访即可），或用防火墙限制来源。
