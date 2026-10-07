# Shilp Backend

Express API for admin authentication, projects, and image uploads. Project records are stored in MongoDB and uploaded image bytes are stored in the MongoDB GridFS `projectMedia` bucket.

## Setup

Copy `.env.example` to `.env`, configure `MONGODB_URI` and `API_PUBLIC_URL`, and set a random `JWT_SECRET` (at least 32 characters), then run `npm install` and `npm run dev`. The API listens on port 8081 and creates no sample projects. On first visit to the admin login page, create the single administrator account; its password is stored in MongoDB as a bcrypt hash. Registration is disabled once that account exists. Add project records from the admin panel.

## Routes

- `GET /api/auth/setup` reports whether first-time administrator setup is required.
- `POST /api/auth/register` creates the one-time administrator account; `POST /api/auth/login`, `POST /api/auth/logout`, and `GET /api/auth/check` manage its session.
- `GET /api/projects` supports `type`, `search`, `limit`, and `skip`; public responses include active projects only.
- `GET /api/projects/:id` returns an active project publicly and permits archived records to authenticated admins.
- `POST /api/projects`, `PUT /api/projects/:id`, and `DELETE /api/projects/:id` require the HTTP-only session cookie. Delete archives instead of removing the record.
- `POST /api/upload` requires authentication and stores one JPG, PNG, WebP, or GIF up to 8 MB in GridFS.
- `GET /api/uploads/:id` streams a stored image for public project pages.

MongoDB and GridFS are the source of truth for project data and uploaded media. Set `API_PUBLIC_URL` to the reachable backend origin in production.

## Deploying to Vercel

Set the Vercel project root directory to `shilp_backend`. Vercel serves the Express app through `api/[...path].js`; do not configure a custom `npm start` command for the deployment.

Add these environment variables in the Vercel project settings for each environment you deploy:

- `MONGODB_URI`: the production MongoDB connection string. Ensure the database allows connections from Vercel.
- `JWT_SECRET`: a random secret at least 32 characters long.
- `API_PUBLIC_URL`: the deployed backend's HTTPS origin, without a trailing slash.
- `ADMIN_ORIGIN`: the deployed admin site's exact HTTPS origin, without a trailing slash.
- `COOKIE_SECURE`: set to `true` for HTTPS deployments.

Redeploy after changing environment variables. Opening the backend root URL should return a small JSON health response; API endpoints remain under `/api`. The health response checks that the function is running, while API requests also require a reachable MongoDB database. If the health URL works but API requests fail, check the Vercel function logs and allow database connections from Vercel in your MongoDB network settings.