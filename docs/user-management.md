# User Management Features

## Overview

This document provides information about the user management features in the Expense App, including profile management and password reset functionality.

## Profile Management

Users can update their profile information through the application. This includes:

- Updating personal information (name, email)
- Changing password

### API Endpoints for Profile Management

#### Update Profile

- **Endpoint:** PUT `/api/v1/auth/updateprofile`
- **Authentication:** Required (JWT token)
- **Description:** Updates user's name and email
- **Request Body:**
  ```json
  {
    "name": "Updated Name",
    "email": "updated@example.com"
  }
  ```

#### Update Password

- **Endpoint:** PUT `/api/v1/auth/updatepassword`
- **Authentication:** Required (JWT token)
- **Description:** Updates user's password
- **Request Body:**
  ```json
  {
    "currentPassword": "current-password",
    "newPassword": "new-password"
  }
  ```

## Password Reset Functionality

The application includes a "forgot password" feature, allowing users to reset their password if they forget it.

### Process Flow

1. User requests a password reset by providing their email address
2. System generates a unique token and sends a password reset link to the user's email
3. User clicks the link and enters a new password
4. System validates the token and updates the user's password

### API Endpoints for Password Reset

#### Forgot Password

- **Endpoint:** POST `/api/v1/auth/forgotpassword`
- **Authentication:** Not required
- **Description:** Initiates the password reset process
- **Request Body:**
  ```json
  {
    "email": "user@example.com"
  }
  ```

#### Reset Password

- **Endpoint:** PUT `/api/v1/auth/resetpassword/:resettoken`
- **Authentication:** Not required (uses reset token)
- **Description:** Resets the user's password using a valid reset token
- **Request Body:**
  ```json
  {
    "password": "new-password"
  }
  ```

## Email Configuration

The password reset functionality uses Nodemailer with Gmail to send emails. The following environment variables need to be configured:

```
EMAIL_USERNAME=your-gmail-account@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
FROM_NAME=Expense App
FROM_EMAIL=noreply@expenseapp.com
```

**Important Notes:**

- For Gmail, you need to use an "App Password" instead of your regular account password.
- To generate an App Password:
  1. Enable 2-Step Verification for your Google account
  2. Go to https://myaccount.google.com/apppasswords
  3. Generate a new app password for "Mail" and "Other" (name it "Expense App")
  4. Use the generated password in your `.env` file

## Security Considerations

- Password reset tokens expire after 10 minutes
- Tokens are hashed before being stored in the database
- Password reset links are sent only to the email address registered in the system
- All passwords are hashed using bcrypt before being stored in the database
