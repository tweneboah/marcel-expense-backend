# Expense Tracking Application

A MERN-Stack application for AussenDienst GmbH to manage and track travel expenses for sales representatives.

## Features

- User authentication with role-based access control
- CRUD operations for expense management
- Google Maps integration for route calculation
- Automatic expense calculation based on predefined rates
- Visual dashboards for expense analytics
- Export functionality for reports (PDF, CSV)
- Responsive design for all devices

## Tech Stack

- **MongoDB**: Document database for flexible data storage
- **Express.js**: Backend API framework
- **React.js**: Frontend UI library
- **Node.js**: JavaScript runtime environment
- **Google Maps API**: For route calculations and address autocompletion

## Getting Started

### Prerequisites

- Node.js (latest LTS version)
- MongoDB
- Google Maps API key

### Installation

1. Clone the repository

   ```
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies

   ```
   npm install
   ```

3. Configure environment variables
   Create a `.env` file in the root directory and add:

   ```
   PORT=5000
   MONGODB_URI=<your-mongodb-uri>
   JWT_SECRET=<your-jwt-secret>
   GOOGLE_MAPS_API_KEY=<your-google-maps-api-key>
   ```

4. Start the development server
   ```
   npm run dev
   ```

## API Endpoints

- Authentication: `/api/auth`
- Users: `/api/users`
- Expenses: `/api/expenses`
- Categories: `/api/categories`
- Reports: `/api/reports`

## License

This project is for internal use only by AussenDienst GmbH.
