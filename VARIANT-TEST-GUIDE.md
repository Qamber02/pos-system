# Variant Persistence Test Guide

## How to Properly Test Variant Persistence

### Prerequisites
✅ Run the RLS migration in Supabase first
✅ Make sure you're online (cloud sync enabled)

### Step-by-Step Test

#### Phase 1: Create Variant
1. Log in to the app
2. Go to **Products** page
3. Click on any product → "Manage Variants"
4. Add a variant (e.g., "Size: Large", price +50)
5. Save the variant
6. **IMPORTANT**: Wait 30 seconds for auto-sync
   - Check browser console for: "Syncing X product variants..."
   - This means variants uploaded to Supabase ✅

#### Phase 2: Clear Local Database
1. Open DevTools (F12) → Console tab
2. Type: `await db.clearUserData()`
3. Press Enter
4. You'll see: "✅ User data cleared successfully"
5. **Variants should disappear from the screen** (this is expected!)

#### Phase 3: Trigger Sync (Restore Variants)
1. Reload the page (F5)
2. **Wait 30 seconds** for auto-sync to run
3. Check browser console for: "Syncing X product variants..."
4. Go to Products → Click product → Variants
5. **Variants should reappear** ✅

### Manual Sync Method (Faster)

Instead of waiting 30 seconds, you can force sync:

```javascript
// In browser console:
await syncService.syncAll()
```

### Troubleshooting

#### Variants Don't Reappear
**Check 1**: Are variants in Supabase?
1. Go to Supabase Dashboard
2. Table Editor → `product_variants`
3. Verify your variants are there
4. Check `user_id` matches your account

**Check 2**: Did sync run?
1. Open Console (F12)
2. Look for: "Syncing product variants..."
3. If not appearing, sync might be failing

**Check 3**: RLS Policy Issues
If you see "0 variants synced" but they exist in Supabase:
1. RLS migration not applied
2. Run `20251123120000_complete_user_isolation.sql`

**Check 4**: User ID Mismatch
Variants might have wrong `user_id`:
```sql
-- Check in Supabase SQL Editor:
SELECT id, variant_name, user_id FROM product_variants;
```

### Expected Console Logs (Normal Flow)

```
Starting sync attempt...
Processing 0 items from sync queue... (variants already synced)
Syncing variants... Last local modified: [timestamp]
Syncing 2 new/updated product variants...
Variants synced successfully.
Sync completed successfully
```

### Common Mistakes

❌ **Clearing DB but not waiting for sync**
- Variants need time to download from Supabase
- Wait minimum 30 seconds OR force sync

❌ **Offline mode**
- Variants can't sync if you're offline
- Check network tab in DevTools

❌ **RLS policy blocking access**
- If migration not run, you can't read variants
- Apply RLS migration first

### Quick Test Command

Run this in browser console to test full cycle:

```javascript
// 1. Create test variant
const testVariant = {
  product_id: 'YOUR_PRODUCT_ID', // Replace with real product ID
  variant_name: 'Test Variant',
  sku: '',
  price_adjustment: 0,
  stock_quantity: 10,
  is_active: true,
  user_id: 'YOUR_USER_ID' // Replace with your user ID
};

// 2. Add variant
await db.productVariants.add({
  ...testVariant,
  id: crypto.randomUUID(),
  synced: false,
  lastModified: Date.now(),
  updated_at: new Date().toISOString()
});

// 3. Sync to cloud
await syncService.syncAll();

// 4. Wait 2 seconds
await new Promise(r => setTimeout(r, 2000));

// 5. Clear local
await db.clearUserData();

// 6. Sync from cloud
await syncService.syncAll();

// 7. Check if variant restored
const variants = await db.productVariants.toArray();
console.log('Variants after restore:', variants);
```

---

## Summary

**Normal Behavior**:
1. Create variant → Auto-uploaded to Supabase ✅
2. Clear local DB → Variant disappears locally ✅  
3. Sync runs → Variant re-downloaded ✅
4. Variant reappears ✅

**If variants don't reappear**:
- Check Supabase (are they stored?)
- Check RLS policies (can you read them?)
- Check sync logs (did sync run?)
- Check network (are you online?)
