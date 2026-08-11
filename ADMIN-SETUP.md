# Admin Setup Guide

## How to Set Up Admin Access

By default, all new users are assigned the **user** role. To make a user an admin, you need to update the database directly.

### Method 1: Using Backend Dashboard (Recommended)

1. Click on "View Backend & Manage User Roles" button
2. Navigate to the **Table Editor**
3. Select the **user_roles** table
4. Find the user you want to make admin
5. Change their `role` from `user` to `admin`
6. Save the changes

### Method 2: Using SQL Query

1. Open the Backend Dashboard
2. Go to **SQL Editor**
3. Run this query (replace the email with the actual user's email):

```sql
-- First, find the user's ID
SELECT id, email FROM auth.users WHERE email = 'admin@example.com';

-- Then update their role (use the ID from above)
UPDATE user_roles 
SET role = 'admin' 
WHERE user_id = 'USER_ID_HERE';
```

## Role-Based Access Control

### Admin-Only Features

The following features are restricted to admin users only:

- **Reports & Sales Analytics**: Only admins can view sales reports, revenue, and profit analysis
- Full access to all sales transactions
- Export detailed Excel reports with profit margins
- View monthly and product-level performance

### All Users Can Access

- **POS (Point of Sale)**: Process sales and manage cart
- **Products**: View and manage product inventory
- **Customers**: View and manage customer information
- **Settings**: Update business settings, logo, and personal account settings

## User Roles

### Admin Role
- Full access to all features
- Can view all sales and reports
- Can manage all aspects of the system
- Role badge displayed as blue "admin"

### User Role
- Limited access to operational features
- Cannot view sales reports
- Can process sales through POS
- Can manage products and customers
- Role badge displayed as gray "user"

## Password & Email Management

All users (admin and regular) can:
- Change their email address with OTP verification
- Update their password
- View their current role in Settings

## Security Features

- All routes are protected with authentication
- Admin-only routes show "Access Denied" page for non-admins
- Role checks are performed server-side using RLS policies
- Email changes require OTP verification
- Password changes are encrypted and secure

## Best Practices

1. **Create at least one admin account** immediately after setup
2. **Don't share admin credentials** - create individual accounts for each admin
3. **Regularly review user roles** in the Backend Dashboard
4. **Use strong passwords** for all admin accounts
5. **Test role restrictions** by logging in with different user types

## Troubleshooting

### Can't see Reports page?
- Check your role in Settings page
- Verify you're logged in as an admin
- Contact your system administrator to update your role

### How to verify my role?
1. Open Settings page
2. Look for "Account Role" badge at the top
3. It will show either "admin" (blue) or "user" (gray)

### Need to demote an admin?
Use the same SQL query but change 'admin' to 'user':
```sql
UPDATE user_roles 
SET role = 'user' 
WHERE user_id = 'USER_ID_HERE';
```
