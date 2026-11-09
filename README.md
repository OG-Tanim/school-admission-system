# School Admission System

Monorepo scaffolding for the Onnorokom Projukti school admission assignment.

## Structure

- `backend/` — ASP.NET Core (.NET 10) minimal API with EF Core + PostgreSQL
- `frontend/` — React 19 + Vite

## Prerequisites

- .NET SDK 10+
- Node.js 20.19+ (or 22.12+)
- PostgreSQL 16+

## Backend

```bash
cd backend
dotnet restore
dotnet ef database update   # applies Migrations/ (install the CLI: dotnet tool install --global dotnet-ef)
dotnet run                  # http://localhost:8080
```

The API listens on `http://localhost:8080`. Override the database connection with the
`ConnectionStrings__DefaultConnection` environment variable:

```bash
ConnectionStrings__DefaultConnection="Host=localhost;Port=5432;Database=school_admission;Username=postgres;Password=postgres" dotnet run
```

Health check: `GET http://localhost:8080/health`.

## Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev                 # http://localhost:5173
```

`VITE_API_URL` controls the backend URL the frontend talks to.

## Status

Scaffolding only. The admission API endpoints, business logic, Docker setup, and tests
are not implemented yet.
