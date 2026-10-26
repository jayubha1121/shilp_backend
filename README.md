# Shilp Backend

Express API for admin authentication, projects, project-tree entries, job openings, blogs, page banners, and image uploads. Records are stored in MongoDB and uploaded image bytes are stored in the MongoDB GridFS `projectMedia` bucket.

## Setup

Copy `.env.example` to `.env`, configure `MONGODB_URI` and `API_PUBLIC_URL`, and set a random `JWT_SECRET` (at least 32 characters), then run `npm install` and `npm run dev`. The API listens on port 8081 and creates no sample projects. On first visit to the admin login page, create the single administrator account; its password is stored in MongoDB as a bcrypt hash. Registration is disabled once that account exists. Add project records from the admin panel.

## Routes

- `GET /api/auth/setup` reports whether first-time administrator setup is required.
- `POST /api/auth/register` creates the one-time administrator account; `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/check` manage its session.
- `GET /api/projects` supports `type`, `search`, `limit`, and `skip`; public responses include active projects only.
- `GET /api/projects/:id` returns an active project publicly and permits archived records to authenticated admins.
- `POST /api/projects`, `PUT /api/projects/:id`, and `DELETE /api/projects/:id` require the HTTP-only session cookie. Delete archives instead of removing the record.
- `GET /api/project-tree` supports `year`, `type`, `search`, `limit`, and `skip`; public responses include active project-tree entries only. Add `all=true` for the authenticated admin list.
- `GET /api/project-tree/:id` returns an active entry publicly and archived entries to authenticated admins.
- `POST /api/project-tree`, `PUT /api/project-tree/:id`, and `DELETE /api/project-tree/:id` require the HTTP-only session cookie. Delete archives instead of removing the entry.
- `GET /api/job-openings` returns active job openings publicly; add `all=true` for the authenticated admin list.
- `POST /api/job-openings`, `PUT /api/job-openings/:id`, and `DELETE /api/job-openings/:id` require the HTTP-only session cookie. Delete archives instead of removing the opening.
- `GET /api/blogs?limit=&skip=` returns `{data,total}` for published blogs only; `limit` defaults to 100 and is capped at 200. Add `all=true` for the authenticated admin list of all statuses.
- `GET /api/blogs/:slug` returns `{data}` for a published blog; an authenticated admin may also retrieve drafts.
- `POST /api/blogs`, `PUT /api/blogs/:id`, and `DELETE /api/blogs/:id` require the HTTP-only admin session cookie. Create/update accept title, unique lowercase hyphenated slug, HTML description, author, ISO `YYYY-MM-DD` date, status (`draft` or `published`), required cover `imageUrl` and `imageAlt`, and an unlimited `points` array (`title`, `subtitle`, HTML `content`, optional image URL/alt text). Delete permanently removes the record.
- Blog description and point HTML is sanitized to a safe formatting/link allowlist on input and output. The API JSON body limit remains 1 MB; pagination applies to blogs, while all points on each blog are preserved.
- `GET /api/page-banners` returns the configured desktop and mobile banners for public pages.
- `PUT /api/page-banners/:page` requires the HTTP-only session cookie and saves uploaded desktop/mobile images independently, so each replacement persists immediately; alternative text is saved on blur.
- `POST /api/upload` requires authentication and stores one JPG, PNG, WebP, or GIF up to 8 MB in GridFS.
- `GET /api/uploads/:id` streams a stored image for public project pages.

MongoDB and GridFS are the source of truth for project, job opening, page banner, and uploaded media data. Project Tree and Job Openings start empty and are populated through the admin; no sample records are inserted. Page banners are managed for the homepage and company pages, plus the Residential/Plotted section story banners, Commercial banner, and Blog index (`blog`) banner. Residential and Plotted side images remain static; individual project detail banners remain managed by the Projects editor. Set `API_PUBLIC_URL` to the reachable backend origin in production.

## Deploying to Vercel

The backend project is `https://shilp-backend-dusky.vercel.app`. In its Vercel environment variables, set:

- `MONGODB_URI`: production MongoDB connection string. Allow connections from Vercel in MongoDB Network Access.
- `JWT_SECRET`: random secret, at least 32 characters.
- `API_PUBLIC_URL`: `https://shilp-backend-dusky.vercel.app`
- `ADMIN_ORIGIN`: `https://shilp-admin-omega.vercel.app,https://shilp-website.vercel.app` (both frontend origins, no spaces).
- `COOKIE_SECURE`: `true`.

The admin project is `https://shilp-admin-omega.vercel.app`. Set `BACKEND_URL` to `https://shilp-backend-dusky.vercel.app` and `NEXT_PUBLIC_SITE_URL` to `https://shilp-website.vercel.app`.

The public website project is `https://shilp-website.vercel.app`. Set both `BACKEND_URL` and `NEXT_PUBLIC_API_URL` to `https://shilp-backend-dusky.vercel.app`.

Add each variable in the matching Vercel project's Settings → Environment Variables for Production, then redeploy that project. For the backend, deploy the backend repository with its repository root as the Vercel Root Directory; do not set a custom `npm start` command. The `/` and `/api/health` URLs should return JSON. Nested API paths such as `/api/auth/setup`, `/api/projects/<id>`, `/api/blogs/<slug>`, and `/api/uploads/<id>` are routed by dedicated serverless handlers. Project image URLs saved from local development are converted to the production API host in responses.