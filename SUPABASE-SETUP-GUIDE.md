# Complete Supabase Backend Rebuild Guide

## Problem Summary
Your app was built with Lovable AI which used a hidden/internal backend. Your Supabase dashboard is empty (no tables visible), which means all data sync, variants, and multi-user features cannot work.

##Solution: Rebuild Everything in Supabase

---

## Step 1: Verify Your Supabase Access

1. Go to https://supabase.com/dashboard
2. Select your project
3. Go to **Table Editor** (left sidebar)
4. **Check**: Do you see ANY tables? (profiles, products, etc.)

**If YES** - Skip to Step 3
**If NO** - Continue to Step 2

---

## Step 2: Run Complete Database Setup

### 2.1 Open SQL Editor
1. In Supabase dashboard → **SQL Editor** (left sidebar)
2. Click **"New query"**

### 2.2 Copy & Run Setup SQL
1. Open file: `supabase/COMPLETE_DATABASE_SETUP.sql`
2. **Copy ALL content** (Ctrl+A, Ctrl+C)
3. **Paste** into Supabase SQL Editor
4. Click **"Run"** button (or press F5)

### 2.3 Verify Success
You should see: **"Success. No rows returned"**

This means:
- ✅ All 10 tables created
- ✅ All indexes created
- ✅ RLS enabled on all tables
- ✅ All security policies applied
- ✅ Triggers added for auto-timestamps
- ✅ Auto-profile creation on signup enabled

---

## Step 3: Verify Tables Were Created

1. Go to **Table Editor** in Supabase
2. You should now see these tables:
   - ✅ profiles
   - ✅ settings
   - ✅ categories
   - ✅ products
   - ✅ product_variants
   - ✅ customers
   - ✅ customer_loans
   - ✅ sales
   - ✅ sale_items
   - ✅ held_carts

**If you see these tables: SUCCESS!** ✅

---

## Step 4: Test Authentication & Auto-Setup

### 4.1 Create Test Account
1. Go to your app → Sign Out (if logged in)
2. Sign Up with a new email (e.g., `test@example.com`)
3. Complete signup

### 4.2 Verify Auto-Creation
1. Go back to Supabase → Table Editor
2. Click on **`profiles`** table
3. You should see your new user row
4. Click on **`settings`** table
5. You should see default settings for your user

**If both exist: Auto-setup working!** ✅

---

## Step 5: Test Data Sync

### 5.1 In Your App
1. Log in with your test account
2. Go to **Products** page
3. Create a product (e.g., "Test Product - $100")
4. Wait 5 seconds

### 5.2 In Supabase
1. Go to Table Editor → `products` table
2. **Refresh** the table
3. You should see your product!

**If product appears: Sync working!** ✅

---

## Step 6: Test Variants (The Main Issue)

### 6.1 Create Variant
1. In app: Click your product
2. Click "Manage Variants"
3. Add variant (e.g., "Size: Large", price +50)
4. Save
5. Wait 10 seconds (or click "Sync Now" button)

### 6.2 Verify in Supabase
1. Table Editor → `product_variants`
2. **Refresh**
3. You should see your variant!

### 6.3 Test Persistence
1. In browser console (F12): `await db.clearUserData()`
2. Click **"Sync Now"** button in app
3. Go back to Products → Your product → Variants
4. **Variant should reappear!** ✅

---

## Step 7: Test Multi-User Isolation

### 7.1 Create Second User
1. Sign out
2. Create another account (e.g., `user2@example.com`)
3. Log in

### 7.2 Verify Isolation
1. Go to Products page
2. Should be **EMPTY** (no products from first user)
3. Create a product specific to User 2
4. Log out

### 7.3 Verify First User Still Has Their Data
1. Log back in as first user
2. Go to Products
3. Should see ONLY first user's products (not User 2's)

**If isolated: Multi-user working!** ✅

---

## Troubleshooting

### Issue: "Success but no tables visible"
**Fix**: Refresh the page or switch between Table Editor tabs

### Issue: "permission denied for schema public"
**Fix**: You're not the database owner. Check project permissions.

### Issue: "relation already exists"
**Fix**: Tables partially exist. Contact me to get cleanup script.

### Issue: Products/Variants not syncing
**Checklist**:
- [ ] RLS policies applied? (Check `product_variants` table → Policies tab)
- [ ] User logged in? (Check auth status)
- [ ] Check browser console for sync errors
- [ ] Click "Sync Now" button manually

### Issue: User can see other user's data
**Fix**: RLS policies not applied correctly. Re-run Step 2.

---

## What This Setup Includes

### Tables (10 total)
1. **profiles** - User accounts
2. **settings** - Per-user shop configuration
3. **categories** - Product categories
4. **products** - Inventory
5. **product_variants** - Product variations
6. **customers** - Customer records
7. **customer_loans** - Customer credit tracking
8. **sales** - Sales transactions
9. **sale_items** - Line items in sales
10. **held_carts** - Saved carts

### Security Features
- ✅ **RLS on all tables** - Complete data isolation
- ✅ **User-specific policies** - Each user only sees their data
- ✅ **Cascade deletes** - Clean up when user deleted
- ✅ **Auto-timestamps** - track created_at/updated_at

### Auto-Functions
- ✅ **Auto-profile creation** - New users get profile + settings automatically
- ✅ **Auto-timestamp updates** - updated_at changes on every edit

---

## After Setup Complete

Your app will now have:
- ✅ **Full Supabase backend** (you can see and control everything)
- ✅ **Cloud sync** (data persists)
- ✅ **Variant persistence** (variants don't disappear)
- ✅ **Multi-user isolation** (each user has separate workspace)
- ✅ **Proper RLS** (security enforced at database level)

---

## Next Steps (Optional Enhancements)

1. **Backup Strategy**: Set up automated Supabase backups
2. **Edge Functions**: Add server-side logic if needed
3. **Realtime**: Enable Supabase Realtime for live updates
4. **Storage**: Add file storage for product images/receipts
5. **Analytics**: Add PostgHog or similar for usage tracking

---

## Important Notes

⚠️ **Data Migration**: If you have existing data in Lovable's hidden backend, it cannot be migrated automatically. You'll need to:
1. Export data from Lovable (if possible)
2. Import via CSV to Supabase
3. Or manually recreate data

⚠️ **Breaking Change**: After running this setup, the app will use YOUR Supabase instance. Make sure your `.env` file has correct Supabase URL and API keys.

⚠️ **Test First**: Run this on a development/test Supabase project first before production!

---

## Support

If you encounter issues:
1. Check browser console for errors
2. Check Supabase logs (Dashboard → Logs)
3. Verify RLS policies are applied (Table → Policies tab)
4. Ask me for help with specific error messages

---

**Status**: Ready to run! ✅
**Estimated Time**: 5-10 minutes
**Risk Level**: Low (creates new tables, doesn't modify existing data)
