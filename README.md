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
Copy `backend/.env.example` to `backend/.env` and set values if using a real MongoDB. Without `MONGODB_URI`, backend uses an in-memory database and seeds sample data automatically.

### Development Demo Accounts

The repeatable development seed creates clearly marked synthetic accounts and uses reserved `.invalid` email domains. These accounts and their shared password are for local/demo use only:

- Admin: `demo_admin` / `DemoAccess2026!`
- PDO/member accounts: `demo_pdo_north`, `demo_pdo_central`, `demo_pdo_east`, `demo_member_schools` / `DemoAccess2026!`

To rerun the idempotent seed explicitly, run `npm --prefix backend run seed`. Development server startup also ensures the fixture exists. Production startup skips demo seeding unless explicitly run with the seed command or enabled through `SEED_DEMO_DATA=true`.

### Seed
The development fixture creates one fictional Karnataka Panchayat with 34 roads, 18 schools, 3 healthcare facilities, 4 water facilities, 78 synthetic complaints, 12 assignments, and 2 saved multi-stop routes. Records are upserted by stable demo identifiers, so rerunning the seed updates the fixture instead of duplicating it. All names and credentials are marked as demo data; no personal contact details are included.
