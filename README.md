# TC File CDN

Small Node.js file API for the TC Newgen chat and other apps. It accepts any file type, stores uploaded bytes in `public/uploads`, and keeps file metadata in `data/`.

## Run locally

```sh
cp .env.example .env
# Set API_KEY to a long random secret in .env
npm install
npm run dev
```

The API starts at `http://localhost:3002`. Uploads are written into this project's `public/uploads/` folder.

## API

All API responses use JSON except the file download response. Upload and delete require `Authorization: Bearer <API_KEY>`. Downloads and file metadata are public to anyone with the file ID, so treat returned URLs as shareable links.

### Upload any file

`POST /v1/files` — `multipart/form-data`, field name `file`.

```sh
curl -X POST http://localhost:3002/v1/files \
  -H 'Authorization: Bearer replace-with-your-api-key' \
  -F 'file=@./photo.png'
```

Response:

```json
{
  "data": {
    "id": "8dfd269f-fc5f-4a66-a74e-68ca22f9008c",
    "filename": "photo.png",
    "mimeType": "image/png",
    "size": 12345,
    "uploadedAt": "2026-10-29T00:00:00.000Z",
    "url": "http://localhost:3002/v1/files/8dfd269f-fc5f-4a66-a74e-68ca22f9008c/download",
    "downloadUrl": "http://localhost:3002/v1/files/8dfd269f-fc5f-4a66-a74e-68ca22f9008c/download",
    "infoUrl": "http://localhost:3002/v1/files/8dfd269f-fc5f-4a66-a74e-68ca22f9008c"
  }
}
```

### Other routes

| Method | Path | Auth | Purpose |
| --- | --- | --- | --- |
| `GET` | `/healthz` | No | Health check |
| `POST` | `/v1/files` | API key | Upload one file |
| `GET` | `/v1/files/:id` | No | Get filename, type, size, and URLs |
| `GET` | `/v1/files/:id/download` | No | Download; supports byte ranges for media/resume |
| `DELETE` | `/v1/files/:id` | API key | Permanently delete the file and metadata |

Downloads always use `application/octet-stream`, `Content-Disposition: attachment`, and `X-Content-Type-Options: nosniff`. That allows arbitrary extensions without letting an uploaded HTML or script execute on the CDN origin. Downloads support `Range: bytes=...` for resumable and media-style clients.

### Connect from the chat app

Keep `API_KEY` on the server. Do not put it in browser JavaScript or a `NEXT_PUBLIC_` variable. In Next.js, add a server route that receives the browser's multipart upload and forwards it to this API with the bearer key. Store the returned `id`, `filename`, `mimeType`, `size`, and `downloadUrl` in the chat message record. Anyone who can read the chat can open the public download URL.

Set the chat app's server environment values:

```env
FILE_CDN_URL=https://files.example.com
FILE_CDN_API_KEY=the-same-secret-as-API_KEY
```

For small uploads, proxy the browser's request through a Next.js Route Handler so the secret stays on the server:

```ts
// app/api/files/route.ts
export async function POST(request: Request) {
  const incoming = await request.formData();
  const file = incoming.get('file');
  if (!(file instanceof File)) return Response.json({ error: { code: 'FILE_REQUIRED', message: 'Select a file' } }, { status: 400 });

  const outgoing = new FormData();
  outgoing.append('file', file, file.name);
  const upstream = await fetch(`${process.env.FILE_CDN_URL}/v1/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.FILE_CDN_API_KEY}` },
    body: outgoing,
    cache: 'no-store',
  });
  return Response.json(await upstream.json(), { status: upstream.status });
}
```

Serverless platforms may cap request body sizes, even when this file service allows larger files. For large files, either proxy from a persistent app server or add a short-lived, scoped upload-token flow before enabling direct browser uploads.

## Deploy

This is a regular long-running Node.js server, not a Vercel serverless function. Deploy it to a Node host with a **persistent writable disk/volume** mounted for this project. The uploaded bytes live in `public/uploads/`; the JSON sidecars in `data/` are needed to resolve IDs and names. If the host replaces its container without a persistent volume, files will be lost.

Set these production environment values:

```env
NODE_ENV=production
PORT=3002
BASE_URL=https://files.example.com
API_KEY=<long-random-secret>
CORS_ORIGINS=https://tc-newgen-chat.vercel.app
MAX_FILE_SIZE_MB=250
```

Put a domain or CDN proxy in front of the Node server and set `BASE_URL` to that public origin. The API's upload key must stay server-side. CORS only controls browser access; it does not replace the API key. Files are public by ID, and deletion can take up to one hour to clear from a caching proxy.

## Configuration

| Variable | Default | Description |
| --- | --- | --- |
| `PORT` | `3002` | HTTP port |
| `BASE_URL` | `http://localhost:<PORT>` | Public service origin used in returned URLs |
| `API_KEY` | Empty | Required for upload/delete; routes return `503` until configured |
| `CORS_ORIGINS` | Empty | Comma-separated browser origins; `*` permits any origin (API key is still required) |
| `MAX_FILE_SIZE_MB` | `250` | Maximum size per file, from 1 MB to 10 GB |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `RATE_LIMIT_MAX` | `60` | Requests allowed per IP in the window |
| `TRUST_PROXY` | `0` | Set to `1` only when deployed behind one trusted reverse proxy, so rate limits can use the client IP |

## Errors

Errors have a consistent shape and include a request ID for server-side diagnosis:

```json
{
  "error": {
    "code": "FILE_TOO_LARGE",
    "message": "File exceeds the configured size limit",
    "requestId": "..."
  }
}
```

Expected codes include `UNAUTHORIZED`, `UPLOADS_NOT_CONFIGURED`, `FILE_REQUIRED`, `FILE_TOO_LARGE`, `INVALID_FILE_ID`, `FILE_NOT_FOUND`, `INVALID_RANGE`, `RATE_LIMITED`, `STORAGE_FULL`, and `STORAGE_UNAVAILABLE`.
