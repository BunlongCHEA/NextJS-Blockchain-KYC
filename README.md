# NextJS-Blockchain-KYC

Next.js 15 Web UI for the KYC Blockchain system.

## Setup

1. Clone this repository
2. Install dependencies: `npm install`
3. Copy environment variables: `cp .env.example .env.local` and fill in values
4. Run development server: `npm run dev`
5. Default admin login: username=`admin`, password=`admin123`
6. On first login, you will be forced to change your password

## Tech Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS + shadcn/ui
- NextAuth.js v5 (JWT)
- React Hook Form + Zod
- Zustand
- Axios

## Portals

- Admin/Internal Users: `/login/admin`
- Customers: `/login/customer`

## Roles

- `admin` — Full access
- `bank_admin` — Bank-level admin
- `bank_officer` — KYC review
- `auditor` — Read-only audit access
- `customer` — Customer portal only

