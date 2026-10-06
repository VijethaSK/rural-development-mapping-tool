# Rural Development Mapping Tool (RDMT)

Full-stack web application to monitor rural development. Public can view schools and roads and report issues. Admin can log in to manage issues and CRUD schools/roads.

## Tech Stack
- Frontend: React + TypeScript + Tailwind + React Router + React-Leaflet
- Backend: Node.js + Express + TypeScript
- Database: MongoDB (fallback to in-memory for dev)
- Auth: JWT (admin only)

## Getting Started

1. Install dependencies:
```
npm install
```

2. Start dev servers (frontend and backend):
```
npm start
```

Backend runs on `http://localhost:4000`, Frontend on `http://localhost:5173`.

### Environment
Copy `backend/.env.example` to `backend/.env` and set values if using a real MongoDB. Without `MONGODB_URI`, local development may use an in-memory database. Normal server startup never seeds demo data.

### Development Demo Accounts

The repeatable development seed creates clearly marked synthetic accounts and uses reserved `.invalid` email domains. These accounts and their shared password are for local/demo use only:

- Admin: `demo_admin` / `DemoAccess2026!`
- PDO/member accounts: `demo_pdo_north`, `demo_pdo_central`, `demo_pdo_east`, `demo_member_schools` / `DemoAccess2026!`

To run or rerun the idempotent demo seed, explicitly run `npm --prefix backend run seed` from the project root (or `npm run seed` from `backend`). This command connects to the database configured for that process and writes demo fixtures. Review the target before running it. Neither development nor production server startup runs the seed, and `SEED_DEMO_DATA` has no effect on startup or seed selection. Production startup only connects to the configured database and starts the HTTP server.

### Seed
The development fixture creates one fictional Karnataka Panchayat with 34 roads, 18 schools, 3 healthcare facilities, 4 water facilities, 78 synthetic complaints, 12 assignments, and 2 saved multi-stop routes. Records are upserted by stable demo identifiers, so rerunning the seed updates the fixture instead of duplicating it. All names and credentials are marked as demo data; no personal contact details are included.
