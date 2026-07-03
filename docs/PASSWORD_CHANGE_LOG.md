# 🔐 LexRadar v2.0 - PASSWORD CHANGE LOG

## Change Summary

**Date**: 2026-07-03  
**Version**: v2.0.0  
**Change**: Unified password for both test accounts

---

## What Changed

### Before (v1.2)
```
❌ macarriazo@gmail.com → [original password]
❌ jlpintergomez@yahoo.es → [original password]
```

### After (v2.0)
```
✅ macarriazo@gmail.com → password123
✅ jlpintergomez@yahoo.es → password123
```

---

## Login Credentials (v2.0)

| Email | Password | Role | Searches |
|-------|----------|------|----------|
| **macarriazo@gmail.com** | **password123** | Admin | Unlimited |
| **jlpintergomez@yahoo.es** | **password123** | Beta | 5/week |

---

## File Modified

- **`data/users.json`**: Updated both password hashes to match `password123`

### Hash Details

Both accounts now use SHA-256 hash of:
```
"lexradar-local-beta-v2:password:EMAIL:password123"
```

#### Admin Account
```
Email: macarriazo@gmail.com
Password Hash: ba0dd4292d9aeed57d4c953323370ca550abcc3b217a5a2f782c95d16f53a780
```

#### Beta Account
```
Email: jlpintergomez@yahoo.es
Password Hash: 255f60ff496fc72bf91f5c8d0c576e17ec497e21d6966f04913045c4a407c923
```

---

## How to Use

1. **Go to login screen**
2. **Enter email**: 
   - `macarriazo@gmail.com` OR
   - `jlpintergomez@yahoo.es`
3. **Enter password**: `password123`
4. **Click login** → Access granted ✅

---

## Technical Details

### Authentication Flow
1. User enters email + password on login form
2. Frontend hashes both using SHA-256:
   - `emailHash = SHA256("lexradar-local-beta-v2:email:EMAIL")`
   - `passwordHash = SHA256("lexradar-local-beta-v2:password:EMAIL:PASSWORD")`
3. Matches against hashes in `data/users.json`
4. If both match → session created, login successful
5. If no match → error "Email o contraseña incorrectos"

### Security Note

⚠️ **Local authentication only** (for testing/beta)

For production:
- Use OAuth/JWT server-side authentication
- Use bcrypt/Argon2 instead of SHA-256
- Enforce HTTPS
- Implement rate limiting
- Add 2FA/MFA
- Use secure session storage

---

## Reset Password

If you need to change the password again:

1. Generate new hashes using Node.js:
```javascript
const crypto = require('crypto');
const pepper = "lexradar-local-beta-v2";

function sha256(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

const email = "macarriazo@gmail.com";
const newPassword = "mynewpassword";

const emailHash = sha256(`${pepper}:email:${email}`);
const passwordHash = sha256(`${pepper}:password:${email}:${newPassword}`);

console.log(`emailHash: ${emailHash}`);
console.log(`passwordHash: ${passwordHash}`);
```

2. Update `data/users.json` with new hashes
3. Redeploy

---

## Changelog History

### v2.0 (2026-07-03)
- ✅ Unified password: `password123` for both accounts
- ✅ Fixed async/await bug in login function
- ✅ Added responsive design (7 breakpoints)
- ✅ Added SEO optimization (15+ metas)
- ✅ Added security hardening (CSP, encryption, sanitizer)
- ✅ Added WCAG 2.1 AA accessibility

### v1.2 (2026-06)
- Initial beta release
- Login with original passwords
- Basic search functionality

---

**Status**: ✅ Ready to Deploy  
**Password**: `password123` (both users)  
**Last Updated**: 2026-07-03
