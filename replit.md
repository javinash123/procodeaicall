# NIJVOX - AI-Powered Calling Agent Platform

## Project Overview
NIJVOX is a complete SaaS platform for AI-powered calling agents with admin functionality, CRM/lead management, AI campaign creation with document-based training, bulk SMS, appointment scheduling, and subscription management.

## Recent Changes (March 20, 2026)
- ✅ Installed OpenAI SDK and created `server/openaiService.ts`
- ✅ Added `generateCallScript(input)` function that uses GPT-4o to generate professional AI calling scripts based on campaign goal, name, existing script, and additional context
- ✅ Added `generateTextResponse(prompt)` utility function for general OpenAI text generation
- ✅ Added POST `/api/campaigns/generate-script` API endpoint (authenticated)
- ✅ Added `campaignsApi.generateScript()` in `client/src/lib/api.ts`
- ✅ Added "Generate with AI" button in new campaign form (Agent tab → AI Calling Script field)
- ✅ Added "Generate with AI" button in edit campaign form (Agent tab → Script field)
- ✅ Both buttons show loading spinner while generating and populate the script textarea on success
- ✅ Uses OPENAI_API_KEY environment variable (already configured)

## Recent Changes (December 12, 2024)
- ✅ Successfully connected MongoDB database via MONGODB_URI secret
- ✅ Implemented full authentication system with session-based login
- ✅ Created comprehensive API endpoints for all features
- ✅ Built authentication UI with login/register forms
- ✅ Added database seeding with admin and test accounts
- ✅ Fixed MongoDB ObjectId to string conversion for frontend compatibility
- ✅ Integrated dashboard UI with real backend APIs
- ✅ Connected CRM leads management (create, view, delete)
- ✅ Connected campaigns management (create, view, delete)
- ✅ Connected appointments with calendar view
- ✅ Connected user profile and settings management
- ✅ Added admin user management UI with real data
- ✅ Fixed TypeScript errors in dashboard component
- ✅ Fixed nested anchor tag issue in auth page
- ✅ Added full edit functionality for leads with validation
- ✅ Added edit campaign dialog with all 3 tabs (basics, AI knowledge, configuration)
- ✅ Made voice selection functional (Rachel American, Drew British)
- ✅ Added campaign resume/pause toggle functionality
- ✅ Added campaign delete functionality
- ✅ Added comprehensive validation for leads (name required, phone required + format, email format)
- ✅ Added comprehensive validation for campaigns (name required, script required, calling hours validation)
- ✅ Fixed HTTP method mismatches (PATCH for updates)
- ✅ Implemented file upload for AI Knowledge tab in campaigns
- ✅ Added support for PDF, DOCX, TXT, and image uploads (up to 10MB)
- ✅ Files saved to /uploads directory and served statically
- ✅ Upload functionality works in both create and edit campaign dialogs
- ✅ Added lead-campaign association (leads can be linked to campaigns)
- ✅ Campaign selector in lead create/edit forms
- ✅ Campaign column and filter in leads table
- ✅ Delete confirmation dialogs for leads and campaigns
- ✅ Removed Settings from sidebar (available in account dropdown)
- ✅ Made calendar fully functional with dynamic dates and month navigation
- ✅ Added Schedule Meeting functionality from lead details
- ✅ Added appointment create/edit/delete dialogs with full CRUD
- ✅ Enhanced lead details Overview tab with campaign and company info
- ✅ Added Log Activity functionality in Activity & Logs tab (calls, emails, notes)
- ✅ Fixed Schedule tab to filter appointments by lead and added edit/delete actions

## Architecture
- **Frontend**: React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend**: Express.js with session-based authentication
- **Database**: MongoDB with Mongoose ODM
- **Authentication**: Passport.js with bcryptjs password hashing
- **Session Storage**: MongoDB session store

## Project Structure
```
├── client/src/
│   ├── pages/          # All page components
│   ├── components/     # Reusable UI components
│   ├── lib/           # API client and auth context
│   └── hooks/         # Custom React hooks
├── server/
│   ├── index.ts       # Express server setup
│   ├── routes.ts      # API route handlers
│   ├── storage.ts     # Database operations layer
│   ├── db.ts          # MongoDB models and connection
│   └── seed.ts        # Database seeding script
└── shared/
    └── schema.ts      # Shared TypeScript types and Zod schemas
```

## Database Models
1. **Users** - User accounts with role-based access (admin/user)
2. **Leads** - CRM contacts with history tracking
3. **Campaigns** - AI calling campaigns with knowledge base
4. **Appointments** - Calendar appointments linked to leads

## Test Accounts
Created via `npm run db:seed`:

### Admin Account
- Email: `admin@nijvox.com`
- Password: `admin123`
- Role: Admin (full access to user management)

### Test User Account
- Email: `test@example.com`
- Password: `test123`
- Role: User (standard access)

## User Preferences
- Web app only (no mobile)
- MongoDB as database
- Session-based authentication
- Role-based access control (Admin vs User)
- Document-based AI training for campaigns (PDF/DOCX uploads)

## Features Implemented
### ✅ Completed
- Frontend prototype with all pages and UI components
- MongoDB integration with Mongoose
- Authentication system (login, register, logout)
- Session management with secure cookies
- User management API (CRUD operations)
- API client library with type-safe endpoints
- CRM/Leads management UI with full CRUD
- Campaign creation and management
- Appointment scheduling and calendar view
- User profile and settings management
- Admin user management dashboard

### 📋 Pending
- Document upload for AI training (PDF/DOCX)
- Bulk SMS functionality
- Payment/subscription integration
- AI calling integration

## Environment Variables
Required secrets (configured in Replit Secrets):
- `MONGODB_URI` - MongoDB connection string

## Development Scripts
```bash
npm run dev        # Start development server
npm run db:seed    # Seed database with test accounts
npm run build      # Build for production
npm run start      # Start production server
```

## API Endpoints
All endpoints are prefixed with `/api`

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/logout` - Logout user
- `GET /api/auth/me` - Get current user

### Users (Admin only)
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

### Leads
- `GET /api/leads` - Get user's leads
- `GET /api/leads/:id` - Get lead by ID
- `POST /api/leads` - Create new lead
- `PUT /api/leads/:id` - Update lead
- `DELETE /api/leads/:id` - Delete lead
- `POST /api/leads/:id/history` - Add history item to lead

### Campaigns
- `GET /api/campaigns` - Get user's campaigns
- `GET /api/campaigns/:id` - Get campaign by ID
- `POST /api/campaigns` - Create new campaign
- `PUT /api/campaigns/:id` - Update campaign
- `DELETE /api/campaigns/:id` - Delete campaign

### Appointments
- `GET /api/appointments` - Get user's appointments
- `GET /api/appointments/:id` - Get appointment by ID
- `POST /api/appointments` - Create new appointment
- `PUT /api/appointments/:id` - Update appointment
- `DELETE /api/appointments/:id` - Delete appointment

### Settings
- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update user settings
- `PUT /api/settings/password` - Change password

## Next Steps
1. Implement document upload for AI campaign training (PDF/DOCX parsing)
2. Add bulk SMS functionality with message templates
3. Integrate payment/subscription system (Stripe)
4. Build AI calling integration with voice synthesis
5. Add real-time call monitoring and analytics
6. Implement advanced lead scoring and automation
